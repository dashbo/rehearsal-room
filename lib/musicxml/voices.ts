import {
  defaultPartName,
  matchVoiceType,
  NoteEvent,
  PartIR,
  VoiceType,
} from "@/lib/score-ir";
import type { RawNote, RawPart } from "./parse";

/**
 * MusicXML `<part>`s don't map 1:1 to vocal parts. Three common layouts:
 *
 *  - Open score: 4 parts already named Soprano/Alto/Tenor/Bass.
 *  - Closed score, separate voices: 1–2 parts, 2 voices per staff
 *    (SA on the top staff, TB on the bottom).
 *  - Closed score, chorded (hymn books): 2 systems, each voice is a stack
 *    of chords — the top note of the treble stack is Soprano, the bottom
 *    is Alto, and likewise Tenor/Bass on the bass system.
 *
 * The user can rename/relabel any part afterwards, so these only need to be
 * a good default.
 */

const CLOSED_SCORE_ORDER: Record<string, VoiceType> = {
  "1:1": "soprano",
  "1:2": "alto",
  "2:1": "tenor",
  "2:2": "bass",
};

interface Sub {
  key: string;
  staff: number;
  voice: string;
  notes: NoteEvent[];
}

function toNoteEvent(n: RawNote): NoteEvent {
  return {
    startTick: n.startTick,
    durationTick: n.durationTick,
    midi: n.midi,
    velocity: n.velocity,
  };
}

function averagePitch(notes: NoteEvent[]): number {
  if (notes.length === 0) return 0;
  return notes.reduce((s, n) => s + n.midi, 0) / notes.length;
}

function sortDedupe(notes: NoteEvent[]): NoteEvent[] {
  const seen = new Set<string>();
  return notes
    .sort((a, b) => a.startTick - b.startTick || a.midi - b.midi)
    .filter((n) => {
      const k = `${n.startTick}:${n.midi}:${n.durationTick}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
}

// --- chord-split path -------------------------------------------------------

interface System {
  id: string;
  notes: RawNote[];
}

function toSystems(rawParts: RawPart[]): System[] {
  if (rawParts.length === 1 && rawParts[0].staves >= 2) {
    const staves = [...new Set(rawParts[0].notes.map((n) => n.staff))]
      .sort((a, b) => a - b)
      .slice(0, 2);
    return staves.map((s) => ({
      id: `${rawParts[0].id}-staff${s}`,
      notes: rawParts[0].notes.filter((n) => n.staff === s),
    }));
  }
  return rawParts.map((p) => ({ id: p.id, notes: p.notes }));
}

function chordDensity(systems: System[]): number {
  let total = 0;
  let chorded = 0;
  for (const sys of systems) {
    const groups = new Map<string, number>();
    for (const n of sys.notes) {
      const k = `${n.voice}:${n.startTick}`;
      groups.set(k, (groups.get(k) ?? 0) + 1);
    }
    for (const count of groups.values()) {
      total += count;
      if (count >= 2) chorded += count;
    }
  }
  return total === 0 ? 0 : chorded / total;
}

const SYSTEM_LABELS: [VoiceType, VoiceType][] = [
  ["soprano", "alto"],
  ["tenor", "bass"],
];

function splitChordSystem(
  sys: System,
  upperType: VoiceType,
  lowerType: VoiceType,
  idBase: string,
): PartIR[] {
  const byStart = new Map<number, RawNote[]>();
  for (const n of sys.notes) {
    const arr = byStart.get(n.startTick) ?? [];
    arr.push(n);
    byStart.set(n.startTick, arr);
  }

  const upper: NoteEvent[] = [];
  const lower: NoteEvent[] = [];

  for (const stack of byStart.values()) {
    const uniq = [...new Map(stack.map((n) => [n.midi, n])).values()].sort(
      (a, b) => b.midi - a.midi,
    );
    if (uniq.length === 1) {
      upper.push(toNoteEvent(uniq[0]));
      lower.push(toNoteEvent(uniq[0]));
    } else {
      upper.push(toNoteEvent(uniq[0]));
      for (let i = 1; i < uniq.length; i++) lower.push(toNoteEvent(uniq[i]));
    }
  }

  const parts: PartIR[] = [];
  if (upper.length) {
    parts.push({
      id: `${idBase}-${upperType}`,
      name: defaultPartName(upperType, 0),
      voiceType: upperType,
      notes: sortDedupe(upper),
    });
  }
  if (lower.length) {
    parts.push({
      id: `${idBase}-${lowerType}`,
      name: defaultPartName(lowerType, 0),
      voiceType: lowerType,
      notes: sortDedupe(lower),
    });
  }
  return parts;
}

// --- staff/voice path ------------------------------------------------------

function splitByStaffVoice(part: RawPart): Sub[] {
  const groups = new Map<string, Sub>();
  for (const n of part.notes) {
    const key = `${n.staff}:${n.voice}`;
    let g = groups.get(key);
    if (!g) {
      g = { key, staff: n.staff, voice: n.voice, notes: [] };
      groups.set(key, g);
    }
    g.notes.push(toNoteEvent(n));
  }
  return [...groups.values()].sort(
    (a, b) => a.staff - b.staff || Number(a.voice) - Number(b.voice),
  );
}

function splitByStaffVoicePath(rawParts: RawPart[]): PartIR[] {
  const out: PartIR[] = [];
  let otherCount = 0;

  for (const part of rawParts) {
    const subs = splitByStaffVoice(part).filter((s) => s.notes.length > 0);
    const named = matchVoiceType(part.name);

    if (subs.length <= 1) {
      out.push({
        id: part.id,
        name:
          named === "other"
            ? part.name || defaultPartName("other", ++otherCount)
            : part.name || defaultPartName(named, 0),
        voiceType: named,
        notes: sortDedupe(subs[0]?.notes ?? []),
      });
      continue;
    }

    const looksClosedSATB =
      subs.length === 4 &&
      subs.every((s) => CLOSED_SCORE_ORDER[`${s.staff}:${s.voice}`]);

    subs.forEach((sub, idx) => {
      let voiceType: VoiceType = "other";
      if (looksClosedSATB) {
        voiceType = CLOSED_SCORE_ORDER[`${sub.staff}:${sub.voice}`];
      } else if (subs.length === 2) {
        const isHigher =
          averagePitch(sub.notes) >= averagePitch(subs[1 - idx].notes);
        voiceType = isHigher ? "soprano" : "alto";
      }

      const name =
        voiceType === "other"
          ? `${part.name || "Part"} ${idx + 1}`
          : defaultPartName(voiceType, 0);
      if (voiceType === "other") otherCount++;

      out.push({
        id: `${part.id}-s${sub.staff}v${sub.voice}`,
        name,
        voiceType,
        notes: sortDedupe(sub.notes),
      });
    });
  }

  return out;
}

// --- entry -----------------------------------------------------------------

export function splitVoices(rawParts: RawPart[]): PartIR[] {
  const systems = toSystems(rawParts);
  const useChordSplit =
    systems.length === 2 &&
    systems.every((s) => s.notes.length > 0) &&
    chordDensity(systems) >= 0.35;

  let out: PartIR[];
  if (useChordSplit) {
    out = systems.flatMap((sys, i) =>
      splitChordSystem(
        sys,
        SYSTEM_LABELS[i][0],
        SYSTEM_LABELS[i][1],
        sys.id,
      ),
    );
  } else {
    out = splitByStaffVoicePath(rawParts);
  }

  // de-duplicate identical display names with a numeric suffix
  const seen = new Map<string, number>();
  for (const p of out) {
    const count = seen.get(p.name) ?? 0;
    seen.set(p.name, count + 1);
    if (count > 0) p.name = `${p.name} ${count + 1}`;
  }
  return out;
}
