import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { saveUpload } from "@/lib/storage";
import {
  extensionOf,
  isAcceptedExtension,
  MAX_UPLOAD_BYTES,
  parseScore,
} from "@/lib/parse-score";
import type { ScoreIR } from "@/lib/score-ir";

export const runtime = "nodejs";

export async function GET() {
  const scores = await prisma.score.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      source: true,
      originalFilename: true,
      createdAt: true,
    },
  });
  return NextResponse.json({ scores });
}

export async function POST(request: NextRequest) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected a multipart form upload." },
      { status: 400 },
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "No file was included in the upload." },
      { status: 400 },
    );
  }

  const ext = extensionOf(file.name);
  if (!isAcceptedExtension(ext)) {
    return NextResponse.json(
      {
        error:
          "Unsupported file type. Upload MusicXML (.xml, .musicxml, .mxl) or MIDI (.mid).",
      },
      { status: 400 },
    );
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `File is too large (max ${MAX_UPLOAD_BYTES / 1024 / 1024} MB).` },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let ir: ScoreIR;
  let source: string;
  let warnings: string[];
  try {
    const result = parseScore(buffer, file.name);
    ir = result.ir;
    source = result.source;
    warnings = result.warnings;
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Could not read this score file.",
      },
      { status: 422 },
    );
  }

  const filePath = await saveUpload(buffer, ext);

  const score = await prisma.score.create({
    data: {
      title: ir.title,
      source,
      originalFilename: file.name,
      filePath,
      ir: ir as unknown as object,
    },
    select: { id: true },
  });

  return NextResponse.json({ id: score.id, warnings }, { status: 201 });
}
