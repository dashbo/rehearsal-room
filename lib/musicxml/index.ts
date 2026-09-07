import type { ScoreIR } from "@/lib/score-ir";
import { parseMusicXml } from "./parse";
import { unwrapMusicXml } from "./unwrap";
import { splitVoices } from "./voices";

export interface MusicXmlParseResult {
  ir: ScoreIR;
  warnings: string[];
}

export function parseMusicXmlToIR(
  data: Uint8Array,
  filename: string,
): MusicXmlParseResult {
  const xml = unwrapMusicXml(data, filename);
  const raw = parseMusicXml(xml);
  const parts = splitVoices(raw.parts).filter((p) => p.notes.length > 0);

  if (parts.length === 0) {
    throw new Error("No playable notes were found in this score.");
  }

  const ir: ScoreIR = {
    title: raw.title,
    source: "musicxml",
    ppq: raw.ppq,
    durationTicks: raw.durationTicks,
    tempoMap: raw.tempoMap,
    timeSignatures: raw.timeSignatures,
    measures: raw.measures,
    parts,
  };

  return { ir, warnings: raw.warnings };
}
