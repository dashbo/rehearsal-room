import { Midi } from "@tonejs/midi";
import {
  defaultPartName,
  IR_PPQ,
  matchVoiceType,
  PartIR,
  ScoreIR,
  TimeSignatureEntry,
} from "@/lib/score-ir";

export interface MidiParseResult {
  ir: ScoreIR;
  warnings: string[];
}

export function parseMidiToIR(
  data: Uint8Array,
  filename: string,
): MidiParseResult {
  const warnings: string[] = [];
  const midi = new Midi(data);
  const srcPPQ = midi.header.ppq || 480;
  const scale = IR_PPQ / srcPPQ;
  const toTicks = (seconds: number) =>
    Math.round(midi.header.secondsToTicks(seconds) * scale);

  const parts: PartIR[] = [];
  let otherCount = 0;

  midi.tracks.forEach((track, i) => {
    if (track.notes.length === 0) return;
    const voiceType = matchVoiceType(track.name || track.instrument?.name);
    const name =
      voiceType === "other"
        ? track.name || `Track ${++otherCount}`
        : defaultPartName(voiceType, 0);

    parts.push({
      id: `track-${i}`,
      name,
      voiceType,
      notes: track.notes.map((n) => {
        const startTick = toTicks(n.time);
        const endTick = toTicks(n.time + n.duration);
        return {
          startTick,
          durationTick: Math.max(1, endTick - startTick),
          midi: n.midi,
          velocity: n.velocity,
        };
      }),
    });
  });

  if (parts.length === 0) {
    throw new Error("This MIDI file contains no notes.");
  }

  const tempoMap =
    midi.header.tempos.length > 0
      ? midi.header.tempos.map((t) => ({
          tick: Math.round(t.ticks * scale),
          bpm: t.bpm,
        }))
      : [{ tick: 0, bpm: 120 }];
  if (tempoMap[0].tick !== 0) tempoMap.unshift({ tick: 0, bpm: tempoMap[0].bpm });

  const timeSignatures: TimeSignatureEntry[] =
    midi.header.timeSignatures.length > 0
      ? midi.header.timeSignatures.map((ts) => ({
          tick: Math.round(ts.ticks * scale),
          numerator: ts.timeSignature[0],
          denominator: ts.timeSignature[1],
        }))
      : [{ tick: 0, numerator: 4, denominator: 4 }];
  if (timeSignatures[0].tick !== 0) {
    timeSignatures.unshift({
      tick: 0,
      numerator: timeSignatures[0].numerator,
      denominator: timeSignatures[0].denominator,
    });
  }

  const durationTicks = Math.max(
    1,
    ...parts.flatMap((p) => p.notes.map((n) => n.startTick + n.durationTick)),
  );

  // derive measures from time signatures across the whole duration
  const measures = deriveMeasures(timeSignatures, durationTicks);

  if (midi.tracks.some((t) => t.notes.length === 0)) {
    warnings.push("Empty MIDI tracks were skipped.");
  }

  return {
    ir: {
      title: midi.header.name || stripExt(filename) || "MIDI score",
      source: "midi",
      ppq: IR_PPQ,
      durationTicks,
      tempoMap,
      timeSignatures,
      measures,
      parts,
    },
    warnings,
  };
}

function deriveMeasures(
  timeSignatures: TimeSignatureEntry[],
  durationTicks: number,
) {
  const measures: { index: number; startTick: number; endTick: number }[] = [];
  const sorted = [...timeSignatures].sort((a, b) => a.tick - b.tick);
  let tick = 0;
  let index = 1;
  let guard = 0;
  while (tick < durationTicks && guard++ < 10000) {
    const ts =
      [...sorted].reverse().find((s) => s.tick <= tick) ?? sorted[0];
    const measureLen = Math.round(
      ts.numerator * ((IR_PPQ * 4) / ts.denominator),
    );
    const next = sorted.find((s) => s.tick > tick && s.tick < tick + measureLen);
    const endTick = next ? next.tick : tick + measureLen;
    measures.push({ index, startTick: tick, endTick });
    tick = endTick;
    index++;
  }
  if (measures.length === 0) {
    measures.push({ index: 1, startTick: 0, endTick: durationTicks });
  }
  return measures;
}

function stripExt(name: string) {
  return name.replace(/\.[^.]+$/, "");
}
