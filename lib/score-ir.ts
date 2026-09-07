/**
 * Score IR — the internal model that every downstream layer consumes
 * (audio engine, mixer, notation cursor), regardless of whether the
 * uploaded source was MusicXML or MIDI.
 */

export type VoiceType = "soprano" | "alto" | "tenor" | "bass" | "other";

export type ScoreSource = "musicxml" | "midi";

export interface NoteEvent {
  /** absolute start position, in IR ticks (see ScoreIR.ppq) */
  startTick: number;
  /** sounding duration, in IR ticks */
  durationTick: number;
  /** MIDI note number, 0..127 */
  midi: number;
  /** 0..1 */
  velocity: number;
}

export interface PartIR {
  id: string;
  /** display name, editable by the user ("Soprano", "Alto", …) */
  name: string;
  voiceType: VoiceType;
  notes: NoteEvent[];
}

export interface TempoEntry {
  tick: number;
  bpm: number;
}

export interface TimeSignatureEntry {
  tick: number;
  numerator: number;
  denominator: number;
}

export interface MeasureEntry {
  index: number; // 1-based measure number as shown to the user
  startTick: number;
  endTick: number;
}

export interface ScoreIR {
  title: string;
  source: ScoreSource;
  /** ticks per quarter note used throughout this IR */
  ppq: number;
  durationTicks: number;
  /** always >= 1 entry; first entry is at tick 0 */
  tempoMap: TempoEntry[];
  /** always >= 1 entry; first entry is at tick 0 */
  timeSignatures: TimeSignatureEntry[];
  measures: MeasureEntry[];
  parts: PartIR[];
}

/** The tick resolution all parsers normalise to. */
export const IR_PPQ = 480;

export const VOICE_TYPES: VoiceType[] = [
  "soprano",
  "alto",
  "tenor",
  "bass",
  "other",
];

/**
 * Best-effort match of a free-text part / track / voice name to a vocal
 * part. Returns "other" when nothing recognisable is found.
 */
export function matchVoiceType(raw: string | undefined | null): VoiceType {
  if (!raw) return "other";
  const s = raw.toLowerCase();
  if (/\b(sop|soprano|descant|treble|cantus)\b/.test(s) || /\bs\d?\b/.test(s))
    return "soprano";
  if (/\b(alt|alto|mezzo|contralto)\b/.test(s) || /\ba\d?\b/.test(s))
    return "alto";
  if (/\b(ten|tenor)\b/.test(s) || /\bt\d?\b/.test(s)) return "tenor";
  if (/\b(bass|baritone|bari)\b/.test(s) || /\bb\d?\b/.test(s)) return "bass";
  return "other";
}

const DEFAULT_NAME: Record<VoiceType, string> = {
  soprano: "Soprano",
  alto: "Alto",
  tenor: "Tenor",
  bass: "Bass",
  other: "Part",
};

export function defaultPartName(voiceType: VoiceType, fallbackIndex: number) {
  if (voiceType === "other") return `Part ${fallbackIndex}`;
  return DEFAULT_NAME[voiceType];
}
