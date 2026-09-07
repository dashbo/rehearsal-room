import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { deleteUpload } from "@/lib/storage";
import type { ScoreIR } from "@/lib/score-ir";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const score = await prisma.score.findUnique({ where: { id } });
  if (!score) {
    return NextResponse.json({ error: "Score not found." }, { status: 404 });
  }
  return NextResponse.json({
    meta: {
      id: score.id,
      title: score.title,
      source: score.source,
      originalFilename: score.originalFilename,
      createdAt: score.createdAt,
    },
    ir: score.ir as unknown as ScoreIR,
  });
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params;
  const score = await prisma.score.findUnique({ where: { id } });
  if (!score) {
    return NextResponse.json({ error: "Score not found." }, { status: 404 });
  }
  await deleteUpload(score.filePath);
  await prisma.score.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
