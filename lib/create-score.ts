import { prisma } from "@/lib/db";
import { saveUpload } from "@/lib/storage";
import {
  extensionOf,
  isAcceptedExtension,
  MAX_UPLOAD_BYTES,
  parseScore,
} from "@/lib/parse-score";

export class ScoreInputError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

/**
 * Shared path for both file uploads and URL imports: validate → parse →
 * store file → persist row. Throws {@link ScoreInputError} with an HTTP
 * status for anything the caller should surface to the user.
 */
export async function createScore(
  data: Uint8Array,
  filename: string,
  opts: { sourceUrl?: string; titleOverride?: string } = {},
): Promise<{ id: string; warnings: string[] }> {
  const ext = extensionOf(filename);
  if (!isAcceptedExtension(ext)) {
    throw new ScoreInputError(
      "Unsupported file type. Use MusicXML (.xml, .musicxml, .mxl) or MIDI (.mid).",
    );
  }
  if (data.byteLength > MAX_UPLOAD_BYTES) {
    throw new ScoreInputError(
      `File is too large (max ${MAX_UPLOAD_BYTES / 1024 / 1024} MB).`,
    );
  }

  let parsed;
  try {
    parsed = parseScore(data, filename);
  } catch (err) {
    throw new ScoreInputError(
      err instanceof Error ? err.message : "Could not read this score file.",
      422,
    );
  }

  const buffer = Buffer.from(data);
  const filePath = await saveUpload(buffer, ext);

  const score = await prisma.score.create({
    data: {
      title: opts.titleOverride?.trim() || parsed.ir.title,
      source: parsed.source,
      originalFilename: filename,
      filePath,
      sourceUrl: opts.sourceUrl ?? null,
      ir: parsed.ir as unknown as object,
    },
    select: { id: true },
  });

  return { id: score.id, warnings: parsed.warnings };
}
