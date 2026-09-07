import type { ScoreIR, ScoreSource } from "@/lib/score-ir";
import { parseMidiToIR } from "@/lib/midi/parse";
import { parseMusicXmlToIR } from "@/lib/musicxml";

export const ACCEPTED_EXTENSIONS = [
  ".xml",
  ".musicxml",
  ".mxl",
  ".mid",
  ".midi",
] as const;

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export interface ParseResult {
  ir: ScoreIR;
  source: ScoreSource;
  warnings: string[];
}

export function extensionOf(filename: string): string {
  const m = filename.toLowerCase().match(/\.[a-z0-9]+$/);
  return m ? m[0] : "";
}

export function isAcceptedExtension(ext: string): boolean {
  return (ACCEPTED_EXTENSIONS as readonly string[]).includes(ext);
}

/**
 * Dispatch on file extension. Parser errors are thrown as plain Error with
 * a human-readable message; the API layer turns them into 422s.
 */
export function parseScore(data: Uint8Array, filename: string): ParseResult {
  const ext = extensionOf(filename);
  if (ext === ".mid" || ext === ".midi") {
    const { ir, warnings } = parseMidiToIR(data, filename);
    return { ir, source: "midi", warnings };
  }
  if (ext === ".xml" || ext === ".musicxml" || ext === ".mxl") {
    const { ir, warnings } = parseMusicXmlToIR(data, filename);
    return { ir, source: "musicxml", warnings };
  }
  throw new Error(
    `Unsupported file type "${ext || filename}". Upload a MusicXML (.xml, .musicxml, .mxl) or MIDI (.mid) file.`,
  );
}
