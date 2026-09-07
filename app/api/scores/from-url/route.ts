import { NextResponse } from "next/server";
import { createScore, ScoreInputError } from "@/lib/create-score";
import { resolveScoreFromUrl } from "@/lib/import-url";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request) {
  let body: { url?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const url = body.url?.trim();
  if (!url) {
    return NextResponse.json({ error: "A URL is required." }, { status: 400 });
  }

  try {
    const resolved = await resolveScoreFromUrl(url);
    const { id, warnings } = await createScore(
      resolved.data,
      resolved.filename,
      { sourceUrl: resolved.sourceUrl, titleOverride: resolved.title },
    );
    return NextResponse.json({ id, warnings }, { status: 201 });
  } catch (err) {
    if (err instanceof ScoreInputError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Could not import a score from that URL.",
      },
      { status: 422 },
    );
  }
}
