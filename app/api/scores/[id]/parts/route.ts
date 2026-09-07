import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ScoreIR, VOICE_TYPES, VoiceType } from "@/lib/score-ir";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params;

  let body: { partId?: string; name?: string; voiceType?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { partId, name, voiceType } = body;
  if (!partId) {
    return NextResponse.json({ error: "partId is required." }, { status: 400 });
  }
  if (voiceType && !VOICE_TYPES.includes(voiceType as VoiceType)) {
    return NextResponse.json(
      { error: `voiceType must be one of ${VOICE_TYPES.join(", ")}.` },
      { status: 400 },
    );
  }

  const score = await prisma.score.findUnique({ where: { id } });
  if (!score) {
    return NextResponse.json({ error: "Score not found." }, { status: 404 });
  }

  const ir = score.ir as unknown as ScoreIR;
  const part = ir.parts.find((p) => p.id === partId);
  if (!part) {
    return NextResponse.json({ error: "Part not found." }, { status: 404 });
  }

  if (typeof name === "string" && name.trim()) part.name = name.trim().slice(0, 60);
  if (voiceType) part.voiceType = voiceType as VoiceType;

  await prisma.score.update({
    where: { id },
    data: { ir: ir as unknown as object },
  });

  return NextResponse.json({
    part: { id: part.id, name: part.name, voiceType: part.voiceType },
  });
}
