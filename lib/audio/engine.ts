import * as Tone from "tone";
import type { ScoreIR } from "@/lib/score-ir";
import {
  createInstrument,
  InstrumentId,
  PartInstrument,
} from "./instruments";
import { buildBeatGrid, Metronome } from "./metronome";

export interface PartControls {
  mute: boolean;
  solo: boolean;
  /** volume in dB, -40..+6 */
  volumeDb: number;
}

export interface LoopRegion {
  enabled: boolean;
  startMeasure: number;
  endMeasure: number;
}

export interface EngineOptions {
  instrument: InstrumentId;
  tempoRate: number;
  metronome: boolean;
  countIn: boolean;
}

interface PartChannel {
  instrument: PartInstrument;
  channel: Tone.Channel;
}

const MIN_RATE = 0.4;
const MAX_RATE = 1.5;

export class AudioEngine {
  readonly ir: ScoreIR;
  private beatGrid: ReturnType<typeof buildBeatGrid>;
  private parts = new Map<string, PartChannel>();
  private metronome = new Metronome();
  private noteEventIds: number[] = [];
  private tempoRate: number;
  private instrumentId: InstrumentId;
  private countInEnabled: boolean;
  private countInTimer: ReturnType<typeof setTimeout> | null = null;
  private endTimer: ReturnType<typeof setTimeout> | null = null;
  private rafId: number | null = null;
  private loaded = false;

  private positionListeners = new Set<(ticks: number) => void>();
  private stateListeners = new Set<(playing: boolean) => void>();
  private endListeners = new Set<() => void>();

  loop: LoopRegion = { enabled: false, startMeasure: 1, endMeasure: 1 };

  constructor(ir: ScoreIR, opts: EngineOptions) {
    this.ir = ir;
    this.beatGrid = buildBeatGrid(ir);
    this.tempoRate = clampRate(opts.tempoRate);
    this.instrumentId = opts.instrument;
    this.countInEnabled = opts.countIn;
    this.metronome.setEnabled(opts.metronome);

    const transport = Tone.getTransport();
    transport.PPQ = ir.ppq;
    transport.bpm.value = (ir.tempoMap[0]?.bpm ?? 100) * this.tempoRate;
  }

  async load() {
    if (this.loaded) return;
    await Tone.start();

    for (const part of this.ir.parts) {
      const channel = new Tone.Channel({ volume: 0, channelCount: 2 });
      channel.toDestination();
      const instrument = createInstrument(this.instrumentId);
      instrument.connect(channel);
      this.parts.set(part.id, { instrument, channel });
    }

    await Tone.loaded();
    this.scheduleNotes();
    this.metronome.schedule(this.beatGrid);
    this.applyLoop();
    this.loaded = true;
  }

  private scheduleNotes() {
    const transport = Tone.getTransport();
    for (const id of this.noteEventIds) transport.clear(id);
    this.noteEventIds = [];

    for (const part of this.ir.parts) {
      const pc = this.parts.get(part.id);
      if (!pc) continue;
      for (const note of part.notes) {
        const id = transport.schedule((time) => {
          const spb = 60 / transport.bpm.value; // seconds per quarter
          const durSec = Math.max(
            0.05,
            (note.durationTick / this.ir.ppq) * spb,
          );
          pc.instrument.triggerAttackRelease(
            note.midi,
            durSec,
            time,
            note.velocity,
          );
        }, `${note.startTick}i`);
        this.noteEventIds.push(id);
      }
    }
  }

  // ---- tempo -------------------------------------------------------------

  private baseBpmAt(tick: number): number {
    const map = this.ir.tempoMap;
    let bpm = map[0]?.bpm ?? 100;
    for (const entry of map) {
      if (entry.tick <= tick) bpm = entry.bpm;
      else break;
    }
    return bpm;
  }

  private syncTempoToPosition() {
    const transport = Tone.getTransport();
    const target = this.baseBpmAt(transport.ticks) * this.tempoRate;
    if (Math.abs(transport.bpm.value - target) > 0.01) {
      transport.bpm.value = target;
    }
  }

  setTempoRate(rate: number) {
    this.tempoRate = clampRate(rate);
    this.syncTempoToPosition();
  }

  getTempoRate() {
    return this.tempoRate;
  }

  // ---- mixer ------------------------------------------------------------

  setPartControls(id: string, controls: PartControls) {
    const pc = this.parts.get(id);
    if (!pc) return;
    pc.channel.volume.value = controls.volumeDb;
    pc.channel.mute = controls.mute;
    pc.channel.solo = controls.solo;
  }

  applyAllControls(map: Record<string, PartControls>) {
    for (const [id, c] of Object.entries(map)) this.setPartControls(id, c);
  }

  // ---- metronome / count-in ------------------------------------------------

  setMetronome(on: boolean) {
    this.metronome.setEnabled(on);
    this.metronome.schedule(this.beatGrid);
  }

  async setInstrument(id: InstrumentId) {
    if (id === this.instrumentId || !this.loaded) {
      this.instrumentId = id;
      return;
    }
    const wasPlaying = this.isPlaying();
    const pos = Tone.getTransport().ticks;
    this.pause();
    for (const pc of this.parts.values()) {
      pc.instrument.dispose();
      const inst = createInstrument(id);
      inst.connect(pc.channel);
      pc.instrument = inst;
    }
    this.instrumentId = id;
    await Tone.loaded();
    Tone.getTransport().ticks = pos;
    this.emitPosition();
    if (wasPlaying) void this.play();
  }

  getInstrument() {
    return this.instrumentId;
  }

  setCountIn(on: boolean) {
    this.countInEnabled = on;
  }

  // ---- loop -----------------------------------------------------------------

  setLoop(loop: LoopRegion) {
    this.loop = loop;
    this.applyLoop();
  }

  private measureStartTick(measure: number): number {
    const m = this.ir.measures.find((x) => x.index === measure);
    return m ? m.startTick : 0;
  }

  private measureEndTick(measure: number): number {
    const m = this.ir.measures.find((x) => x.index === measure);
    return m ? m.endTick : this.ir.durationTicks;
  }

  private applyLoop() {
    const transport = Tone.getTransport();
    if (this.loop.enabled) {
      const a = this.measureStartTick(
        Math.min(this.loop.startMeasure, this.loop.endMeasure),
      );
      const b = this.measureEndTick(
        Math.max(this.loop.startMeasure, this.loop.endMeasure),
      );
      transport.loop = true;
      transport.loopStart = `${a}i`;
      transport.loopEnd = `${b}i`;
    } else {
      transport.loop = false;
    }
  }

  // ---- transport ----------------------------------------------------------

  async play() {
    await this.load();
    const transport = Tone.getTransport();
    this.syncTempoToPosition();

    const startClock = () => {
      transport.start();
      this.emitState(true);
      this.startRaf();
      this.scheduleEndCheck();
    };

    if (this.countInEnabled) {
      const tick = transport.ticks;
      const spb = 60 / (this.baseBpmAt(tick) * this.tempoRate);
      const beatsPerBar = this.beatGrid.beatsPerBarAt(tick);
      const beatTicks = this.beatGrid.beatTicksAt(tick);
      const secondsPerBeat = (beatTicks / this.ir.ppq) * spb;
      const now = Tone.now() + 0.1;
      const countInSec = this.metronome.countIn(
        now,
        beatsPerBar,
        secondsPerBeat,
      );
      this.countInTimer = setTimeout(
        startClock,
        Math.max(0, countInSec * 1000 - 20),
      );
    } else {
      startClock();
    }
  }

  pause() {
    this.cancelCountIn();
    Tone.getTransport().pause();
    this.stopRaf();
    this.emitState(false);
    this.releaseAll();
  }

  stop() {
    this.cancelCountIn();
    const transport = Tone.getTransport();
    transport.stop();
    transport.ticks = this.loop.enabled
      ? this.measureStartTick(
          Math.min(this.loop.startMeasure, this.loop.endMeasure),
        )
      : 0;
    this.stopRaf();
    this.emitState(false);
    this.releaseAll();
    this.emitPosition();
  }

  seekTicks(tick: number) {
    const transport = Tone.getTransport();
    transport.ticks = Math.max(0, Math.min(tick, this.ir.durationTicks));
    this.syncTempoToPosition();
    this.releaseAll();
    this.emitPosition();
  }

  seekMeasure(measure: number) {
    this.seekTicks(this.measureStartTick(measure));
  }

  private releaseAll() {
    for (const { instrument } of this.parts.values()) instrument.releaseAll?.();
  }

  private cancelCountIn() {
    if (this.countInTimer) {
      clearTimeout(this.countInTimer);
      this.countInTimer = null;
    }
  }

  // ---- position updates -------------------------------------------------

  getPositionTicks(): number {
    return Tone.getTransport().ticks;
  }

  isPlaying(): boolean {
    return Tone.getTransport().state === "started";
  }

  private startRaf() {
    if (this.rafId !== null) return;
    const tick = () => {
      this.syncTempoToPosition();
      this.emitPosition();
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private stopRaf() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private scheduleEndCheck() {
    if (this.endTimer) clearInterval(this.endTimer as unknown as number);
    this.endTimer = setInterval(() => {
      if (
        !this.loop.enabled &&
        Tone.getTransport().state === "started" &&
        Tone.getTransport().ticks >= this.ir.durationTicks
      ) {
        this.stop();
        this.endListeners.forEach((cb) => cb());
      }
    }, 120);
  }

  // ---- listeners --------------------------------------------------------

  onPosition(cb: (ticks: number) => void) {
    this.positionListeners.add(cb);
    return () => this.positionListeners.delete(cb);
  }
  onState(cb: (playing: boolean) => void) {
    this.stateListeners.add(cb);
    return () => this.stateListeners.delete(cb);
  }
  onEnd(cb: () => void) {
    this.endListeners.add(cb);
    return () => this.endListeners.delete(cb);
  }

  private emitPosition() {
    const t = Tone.getTransport().ticks;
    this.positionListeners.forEach((cb) => cb(t));
  }
  private emitState(playing: boolean) {
    this.stateListeners.forEach((cb) => cb(playing));
  }

  // ---- teardown -------------------------------------------------------

  dispose() {
    this.cancelCountIn();
    this.stopRaf();
    if (this.endTimer) clearInterval(this.endTimer as unknown as number);
    const transport = Tone.getTransport();
    transport.stop();
    transport.cancel(0);
    transport.loop = false;
    transport.ticks = 0;
    this.metronome.dispose();
    for (const { instrument, channel } of this.parts.values()) {
      instrument.dispose();
      channel.dispose();
    }
    this.parts.clear();
    this.positionListeners.clear();
    this.stateListeners.clear();
    this.endListeners.clear();
    this.loaded = false;
  }
}

function clampRate(rate: number) {
  if (!Number.isFinite(rate)) return 1;
  return Math.min(MAX_RATE, Math.max(MIN_RATE, rate));
}

export { MIN_RATE, MAX_RATE };
