import * as Tone from "tone";
import type { ScoreIR } from "@/lib/score-ir";

export interface BeatGrid {
  /** absolute tick of every beat in the piece */
  beats: { tick: number; downbeat: boolean }[];
  /** ticks in one beat at a given tick */
  beatTicksAt: (tick: number) => number;
  /** beats per measure at a given tick */
  beatsPerBarAt: (tick: number) => number;
}

export function buildBeatGrid(ir: ScoreIR): BeatGrid {
  const sigs = [...ir.timeSignatures].sort((a, b) => a.tick - b.tick);
  const sigAt = (tick: number) =>
    [...sigs].reverse().find((s) => s.tick <= tick) ?? sigs[0];

  const beatTicksAt = (tick: number) => {
    const s = sigAt(tick);
    return (ir.ppq * 4) / s.denominator;
  };
  const beatsPerBarAt = (tick: number) => sigAt(tick).numerator;

  const beats: { tick: number; downbeat: boolean }[] = [];
  for (const m of ir.measures) {
    const beatLen = beatTicksAt(m.startTick);
    let t = m.startTick;
    let i = 0;
    while (t < m.endTick - 1) {
      beats.push({ tick: Math.round(t), downbeat: i === 0 });
      t += beatLen;
      i++;
    }
  }
  return { beats, beatTicksAt, beatsPerBarAt };
}

export class Metronome {
  private hi: Tone.Synth;
  private lo: Tone.Synth;
  private scheduledIds: number[] = [];
  private enabled = false;

  constructor() {
    const gain = new Tone.Gain(0.6).toDestination();
    this.hi = new Tone.Synth({
      oscillator: { type: "square" },
      envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.05 },
    }).connect(gain);
    this.lo = new Tone.Synth({
      oscillator: { type: "square" },
      envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.05 },
    }).connect(gain);
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    if (on) this.schedule();
    else this.clear();
  }

  isEnabled() {
    return this.enabled;
  }

  /** (re)schedule clicks on the Transport for the whole piece. */
  schedule(grid?: BeatGrid) {
    this.clear();
    if (!this.enabled || !grid) return;
    const transport = Tone.getTransport();
    for (const beat of grid.beats) {
      const id = transport.schedule((time) => {
        const synth = beat.downbeat ? this.hi : this.lo;
        synth.triggerAttackRelease(beat.downbeat ? "G5" : "C5", 0.03, time);
      }, `${beat.tick}i`);
      this.scheduledIds.push(id);
    }
  }

  /** one bar of count-in clicks starting at audio time `startTime`. */
  countIn(
    startTime: number,
    beatsPerBar: number,
    secondsPerBeat: number,
  ): number {
    for (let i = 0; i < beatsPerBar; i++) {
      const t = startTime + i * secondsPerBeat;
      const synth = i === 0 ? this.hi : this.lo;
      synth.triggerAttackRelease(i === 0 ? "G5" : "C5", 0.03, t);
    }
    return beatsPerBar * secondsPerBeat;
  }

  clear() {
    const transport = Tone.getTransport();
    for (const id of this.scheduledIds) transport.clear(id);
    this.scheduledIds = [];
  }

  dispose() {
    this.clear();
    this.hi.dispose();
    this.lo.dispose();
  }
}
