import {
  defaultPartName,
  matchVoiceType,
  NoteEvent,
  PartIR,
  VoiceType,
} from "@/lib/score-ir";
import type { RawPart } from "./parse";

/**
 * MusicXML `<part>`s don't map 1:1 to vocal parts:
 *
 *  - Open score: 4 separate parts already named Soprano/Alto/Tenor/Bass.
 *  - Closed score: 1 part, 2 staves, 2 voices per staff (SA on staff 1,
 *    TB on staff 2).
 *
 * We split every part by (staff, voice) and label the pieces with a
 * heuristic. The user can always rename/relabel in the UI afterwards, so
 * this only needs to be a sensible default.
 */

const CLOSED_SCORE_ORDER: Record<string, VoiceType> = {
  "1:1": "soprano",
  "1:2": "alto",
  "2:1": "tenor",
  "2:2": "bass",
};

interface SubPart {
  staff: number;
  voice: string;
  notes: NoteEvent[];
}

function splitByStaffVoice(part: RawPart): SubPart[] {
  const groups = new Map<string, SubPart>();
  for (const n of part.notes) {
    const key = `${n.staff}:${n.voice}`;
    let g = groups.get(key);
    if (!g) {
      g = { staff: n.staff, voice: n.voice, notes: [] };
      groups.set(key, g);
    }
    g.notes.push({
      startTick: n.startTick,
      durationTick: n.durationTick,
      midi: n.midi,
      velocity: n.velocity,
    });
  }
  return [...groups.values()].sort(
    (a, b) => a.staff - b.staff || Number(a.voice) - Number(b.voice),
  );
}

function averagePitch(notes: NoteEvent[]): number {
  if (notes.length === 0) return 0;
  return notes.reduce((s, n) => s + n.midi, 0) / notes.length;
}

export function splitVoices(rawParts: RawPart[]): PartIR[] {
  const out: PartIR[] = [];
  let otherCount = 0;

  for (const part of rawParts) {
    const subs = splitByStaffVoice(part).filter((s) => s.notes.length > 0);
    const named = matchVoiceType(part.name);

    if (subs.length <= 1) {
      // one voice in this part — trust the score-part name
      const voiceType = named;
      out.push({
        id: `${part.id}`,
        name:
          named === "other"
            ? part.name || defaultPartName("other", ++otherCount)
            : part.name || defaultPartName(named, 0),
        voiceType,
        notes: subs[0]?.notes ?? [],
      });
      continue;
    }

    // multiple (staff, voice) pieces
    const looksClosedSATB =
      subs.length === 4 &&
      subs.every((s) => CLOSED_SCORE_ORDER[`${s.staff}:${s.voice}`]);

    subs.forEach((sub, idx) => {
      let voiceType: VoiceType = "other";
      let name = "";

      if (named !== "other" && subs.length === 1) {
        voiceType = named;
      } else if (looksClosedSATB) {
        voiceType = CLOSED_SCORE_ORDER[`${sub.staff}:${sub.voice}`];
      } else if (subs.length === 2) {
        // higher of two on a staff -> the upper voice type
        const higher = averagePitch(sub.notes) >= averagePitch(subs[1 - idx].notes);
        voiceType = higher ? "soprano" : "alto";
      }

      if (voiceType === "other") {
        name = `${part.name || "Part"} ${idx + 1}`;
        otherCount++;
      } else {
        name = defaultPartName(voiceType, 0);
      }

      out.push({
        id: `${part.id}-s${sub.staff}v${sub.voice}`,
        name,
        voiceType,
        notes: sub.notes,
      });
    });
  }

  // de-duplicate identical display names (e.g. two "Alto"s) with a suffix
  const seen = new Map<string, number>();
  for (const p of out) {
    const count = seen.get(p.name) ?? 0;
    seen.set(p.name, count + 1);
    if (count > 0) p.name = `${p.name} ${count + 1}`;
  }

  return out;
}
