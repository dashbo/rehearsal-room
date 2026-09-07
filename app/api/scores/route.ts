import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createScore, ScoreInputError } from "@/lib/create-score";

export const runtime = "nodejs";

export async function GET() {
  const scores = await prisma.score.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      source: true,
      originalFilename: true,
      sourceUrl: true,
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

  try {
    const data = new Uint8Array(await file.arrayBuffer());
    const { id, warnings } = await createScore(data, file.name);
    return NextResponse.json({ id, warnings }, { status: 201 });
  } catch (err) {
    if (err instanceof ScoreInputError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
