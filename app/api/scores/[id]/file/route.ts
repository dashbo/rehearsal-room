import { prisma } from "@/lib/db";
import { readUpload } from "@/lib/storage";
import { extensionOf } from "@/lib/parse-score";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

const CONTENT_TYPES: Record<string, string> = {
  ".xml": "application/xml",
  ".musicxml": "application/vnd.recordare.musicxml+xml",
  ".mxl": "application/vnd.recordare.musicxml",
  ".mid": "audio/midi",
  ".midi": "audio/midi",
};

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const score = await prisma.score.findUnique({ where: { id } });
  if (!score) {
    return new Response("Score not found.", { status: 404 });
  }

  let bytes: Buffer;
  try {
    bytes = await readUpload(score.filePath);
  } catch {
    return new Response("Uploaded file is missing.", { status: 410 });
  }

  const ext = extensionOf(score.originalFilename);
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": CONTENT_TYPES[ext] ?? "application/octet-stream",
      "Content-Disposition": `inline; filename="${encodeURIComponent(
        score.originalFilename,
      )}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
