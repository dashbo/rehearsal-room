import * as Tone from "tone";

export type InstrumentId = "piano" | "voice" | "synth";

export const INSTRUMENT_LABELS: Record<InstrumentId, string> = {
  piano: "Piano",
  voice: "Voice (ooh)",
  synth: "Synth",
};

export interface PartInstrument {
  triggerAttackRelease: (
    note: number | string,
    duration: number | string,
    time?: number,
    velocity?: number,
  ) => void;
  releaseAll?: () => void;
  connect: (node: Tone.ToneAudioNode) => void;
  dispose: () => void;
}

const SALAMANDER_BASE = "https://tonejs.github.io/audio/salamander/";

function createPiano(): PartInstrument {
  const sampler = new Tone.Sampler({
    urls: {
      A0: "A0.mp3",
      C1: "C1.mp3",
      "D#1": "Ds1.mp3",
      "F#1": "Fs1.mp3",
      A1: "A1.mp3",
      C2: "C2.mp3",
      "D#2": "Ds2.mp3",
      "F#2": "Fs2.mp3",
      A2: "A2.mp3",
      C3: "C3.mp3",
      "D#3": "Ds3.mp3",
      "F#3": "Fs3.mp3",
      A3: "A3.mp3",
      C4: "C4.mp3",
      "D#4": "Ds4.mp3",
      "F#4": "Fs4.mp3",
      A4: "A4.mp3",
      C5: "C5.mp3",
      "D#5": "Ds5.mp3",
      "F#5": "Fs5.mp3",
      A5: "A5.mp3",
      C6: "C6.mp3",
      "D#6": "Ds6.mp3",
      "F#6": "Fs6.mp3",
      A6: "A6.mp3",
      C7: "C7.mp3",
      "D#7": "Ds7.mp3",
      "F#7": "Fs7.mp3",
      A7: "A7.mp3",
      C8: "C8.mp3",
    },
    release: 1,
    baseUrl: SALAMANDER_BASE,
  });
  return wrapPoly(sampler);
}

function createVoice(): PartInstrument {
  // no samples available offline — approximate an "ooh" vowel with a
  // filtered saw + gentle vibrato
  const synth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: "sawtooth" },
    envelope: { attack: 0.08, decay: 0.2, sustain: 0.8, release: 0.6 },
  });
  const filter = new Tone.Filter({ type: "lowpass", frequency: 900, Q: 6 });
  const vibrato = new Tone.Vibrato({ frequency: 5, depth: 0.06 });
  synth.connect(filter);
  filter.connect(vibrato);

  return {
    triggerAttackRelease: (note, duration, time, velocity) =>
      synth.triggerAttackRelease(
        typeof note === "number" ? Tone.Frequency(note, "midi").toNote() : note,
        duration,
        time,
        velocity,
      ),
    releaseAll: () => synth.releaseAll(),
    connect: (node) => vibrato.connect(node),
    dispose: () => {
      synth.dispose();
      filter.dispose();
      vibrato.dispose();
    },
  };
}

function createSynth(): PartInstrument {
  const synth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: "triangle" },
    envelope: { attack: 0.02, decay: 0.1, sustain: 0.6, release: 0.4 },
  });
  return wrapPoly(synth);
}

function wrapPoly(
  inst: Tone.Sampler | Tone.PolySynth,
): PartInstrument {
  return {
    triggerAttackRelease: (note, duration, time, velocity) =>
      inst.triggerAttackRelease(
        typeof note === "number" ? Tone.Frequency(note, "midi").toNote() : note,
        duration,
        time,
        velocity,
      ),
    releaseAll: () => {
      inst.releaseAll();
    },
    connect: (node) => inst.connect(node),
    dispose: () => inst.dispose(),
  };
}

export function createInstrument(id: InstrumentId): PartInstrument {
  switch (id) {
    case "piano":
      return createPiano();
    case "voice":
      return createVoice();
    default:
      return createSynth();
  }
}
