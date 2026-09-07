"use client";

import { create } from "zustand";
import type { ScoreIR } from "@/lib/score-ir";
import type { AudioEngine, PartControls } from "@/lib/audio/engine";
import type { InstrumentId } from "@/lib/audio/instruments";

export interface PartUIState extends PartControls {
  id: string;
  name: string;
  voiceType: string;
}

interface PlayerState {
  engine: AudioEngine | null;
  ir: ScoreIR | null;
  ready: boolean;

  isPlaying: boolean;
  positionTicks: number;
  tempoRate: number;
  instrument: InstrumentId;
  metronomeOn: boolean;
  countInOn: boolean;
  loop: { enabled: boolean; startMeasure: number; endMeasure: number };
  parts: PartUIState[];

  bindEngine: (engine: AudioEngine, ir: ScoreIR) => void;
  unbind: () => void;
  setReady: (ready: boolean) => void;
  setIsPlaying: (playing: boolean) => void;
  setPositionTicks: (ticks: number) => void;

  play: () => void;
  pause: () => void;
  stop: () => void;
  togglePlay: () => void;
  seekTicks: (ticks: number) => void;
  seekMeasure: (measure: number) => void;

  setTempoRate: (rate: number) => void;
  setInstrument: (id: InstrumentId) => void;
  setMetronome: (on: boolean) => void;
  setCountIn: (on: boolean) => void;
  setLoop: (loop: Partial<PlayerState["loop"]>) => void;

  setPartControls: (id: string, patch: Partial<PartControls>) => void;
  isolatePart: (id: string) => void;
  clearMutes: () => void;
  renamePart: (id: string, name: string, voiceType: string) => void;
}

const DEFAULT_PART: PartControls = { mute: false, volumeDb: 0 };

export const usePlayerStore = create<PlayerState>((set, get) => ({
  engine: null,
  ir: null,
  ready: false,
  isPlaying: false,
  positionTicks: 0,
  tempoRate: 1,
  instrument: "piano",
  metronomeOn: false,
  countInOn: true,
  loop: { enabled: false, startMeasure: 1, endMeasure: 1 },
  parts: [],

  bindEngine: (engine, ir) => {
    const lastMeasure = ir.measures.at(-1)?.index ?? 1;
    set({
      engine,
      ir,
      parts: ir.parts.map((p) => ({
        id: p.id,
        name: p.name,
        voiceType: p.voiceType,
        ...DEFAULT_PART,
      })),
      loop: { enabled: false, startMeasure: 1, endMeasure: lastMeasure },
      isPlaying: false,
      positionTicks: 0,
      ready: false,
    });
  },

  unbind: () => {
    get().engine?.dispose();
    set({
      engine: null,
      ir: null,
      ready: false,
      isPlaying: false,
      positionTicks: 0,
      parts: [],
    });
  },

  setReady: (ready) => set({ ready }),
  setIsPlaying: (isPlaying) => set({ isPlaying }),
  setPositionTicks: (positionTicks) => set({ positionTicks }),

  play: () => {
    void get().engine?.play();
  },
  pause: () => get().engine?.pause(),
  stop: () => get().engine?.stop(),
  togglePlay: () => {
    const { isPlaying, engine } = get();
    if (!engine) return;
    if (isPlaying) engine.pause();
    else void engine.play();
  },
  seekTicks: (ticks) => {
    get().engine?.seekTicks(ticks);
    set({ positionTicks: ticks });
  },
  seekMeasure: (measure) => {
    get().engine?.seekMeasure(measure);
  },

  setTempoRate: (rate) => {
    get().engine?.setTempoRate(rate);
    set({ tempoRate: get().engine?.getTempoRate() ?? rate });
  },
  setInstrument: (id) => {
    set({ instrument: id });
    void get().engine?.setInstrument(id);
  },
  setMetronome: (on) => {
    get().engine?.setMetronome(on);
    set({ metronomeOn: on });
  },
  setCountIn: (on) => {
    get().engine?.setCountIn(on);
    set({ countInOn: on });
  },
  setLoop: (patch) => {
    const loop = { ...get().loop, ...patch };
    get().engine?.setLoop(loop);
    set({ loop });
  },

  setPartControls: (id, patch) => {
    const parts = get().parts.map((p) =>
      p.id === id ? { ...p, ...patch } : p,
    );
    set({ parts });
    const engine = get().engine;
    const updated = parts.find((p) => p.id === id);
    if (engine && updated) {
      engine.setPartControls(id, {
        mute: updated.mute,
        volumeDb: updated.volumeDb,
      });
    }
  },

  isolatePart: (id) => {
    const parts = get().parts;
    const target = parts.find((p) => p.id === id);
    const alreadyIsolated =
      !!target &&
      !target.mute &&
      parts.every((p) => p.id === id || p.mute);
    const next = parts.map((p) => ({
      ...p,
      mute: alreadyIsolated ? false : p.id !== id,
    }));
    set({ parts: next });
    const engine = get().engine;
    if (engine) {
      for (const p of next) {
        engine.setPartControls(p.id, { mute: p.mute, volumeDb: p.volumeDb });
      }
    }
  },

  clearMutes: () => {
    const next = get().parts.map((p) => ({ ...p, mute: false }));
    set({ parts: next });
    const engine = get().engine;
    if (engine) {
      for (const p of next) {
        engine.setPartControls(p.id, { mute: false, volumeDb: p.volumeDb });
      }
    }
  },

  renamePart: (id, name, voiceType) => {
    set({
      parts: get().parts.map((p) =>
        p.id === id ? { ...p, name, voiceType } : p,
      ),
    });
  },
}));
