import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import type { ScoreIR } from "@/lib/score-ir";
import { PlayerShell } from "@/components/player/PlayerShell";

export const dynamic = "force-dynamic";

export default async function ScorePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const score = await prisma.score.findUnique({ where: { id } });
  if (!score) notFound();

  const ir = score.ir as unknown as ScoreIR;

  return (
    <main className="mx-auto max-w-4xl px-5 py-8">
      <div className="mb-6 flex items-baseline justify-between gap-4">
        <div className="min-w-0">
          <Link href="/" className="text-sm text-muted hover:text-accent">
            ← All scores
          </Link>
          <h1 className="mt-1 truncate text-xl font-semibold tracking-tight">
            {score.title}
          </h1>
          <p className="text-xs text-muted">
            {score.source === "midi" ? "MIDI" : "MusicXML"} ·{" "}
            {ir.parts.length} part{ir.parts.length === 1 ? "" : "s"} ·{" "}
            {ir.measures.length} bars
          </p>
        </div>
      </div>

      <PlayerShell
        scoreId={score.id}
        source={score.source as "musicxml" | "midi"}
        ir={ir}
      />
    </main>
  );
}
