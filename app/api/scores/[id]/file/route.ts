import { prisma } from "@/lib/db";
import { readUpload } from "@/lib/storage";
import { extensionOf } from "@/lib/parse-score";
import { unwrapMusicXml } from "@/lib/musicxml/unwrap";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

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

  // For notation we always hand OpenSheetMusicDisplay uncompressed MusicXML —
  // it chokes on a raw .mxl (zip) delivered as text.
  if (score.source === "musicxml") {
    let xml: string;
    try {
      xml = unwrapMusicXml(new Uint8Array(bytes), score.originalFilename);
    } catch {
      return new Response("Could not read the score file.", { status: 422 });
    }
    return new Response(xml, {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "private, max-age=3600",
      },
    });
  }

  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": ext === ".mid" || ext === ".midi" ? "audio/midi" : "application/octet-stream",
      "Content-Disposition": `inline; filename="${encodeURIComponent(
        score.originalFilename,
      )}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
