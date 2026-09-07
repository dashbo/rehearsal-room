"use client";

import type { ScoreIR } from "@/lib/score-ir";
import { usePlayerStore } from "@/store/player-store";
import { measureAtTick } from "@/lib/format";

export function PositionReadout({ ir }: { ir: ScoreIR }) {
  const positionTicks = usePlayerStore((s) => s.positionTicks);
  const bar = measureAtTick(ir, positionTicks);
  const lastBar = ir.measures.at(-1)?.index ?? 1;
  const progress = Math.min(1, positionTicks / ir.durationTicks);

  return (
    <div className="rounded-xl border border-border bg-panel p-6 text-center">
      <p className="text-sm text-muted">
        This score came from a MIDI file, so there is no engraving to show.
      </p>
      <p className="mt-3 text-3xl font-semibold tabular-nums">
        Bar {bar}
        <span className="text-lg font-normal text-muted"> / {lastBar}</span>
      </p>
      <div className="mx-auto mt-4 h-2 max-w-md overflow-hidden rounded-full bg-border">
        <div
          className="h-full bg-accent transition-[width] duration-100"
          style={{ width: `${progress * 100}%` }}
        />
      </div>
    </div>
  );
}
