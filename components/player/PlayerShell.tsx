"use client";

import { useEffect, useRef, useState } from "react";
import type { ScoreIR } from "@/lib/score-ir";
import { usePlayerStore } from "@/store/player-store";
import { TransportBar } from "./TransportBar";
import { PartMixer } from "./PartMixer";
import { Notation } from "./Notation";
import { PositionReadout } from "./PositionReadout";

export function PlayerShell({
  scoreId,
  source,
  ir,
}: {
  scoreId: string;
  source: "musicxml" | "midi";
  ir: ScoreIR;
}) {
  const bindEngine = usePlayerStore((s) => s.bindEngine);
  const unbind = usePlayerStore((s) => s.unbind);
  const setIsPlaying = usePlayerStore((s) => s.setIsPlaying);
  const setPositionTicks = usePlayerStore((s) => s.setPositionTicks);

  const [error, setError] = useState<string | null>(null);
  const initialised = useRef(false);

  useEffect(() => {
    let disposed = false;
    initialised.current = false;

    (async () => {
      const { AudioEngine } = await import("@/lib/audio/engine");
      if (disposed) return;
      const engine = new AudioEngine(ir, {
        instrument: "piano",
        tempoRate: 1,
        metronome: false,
        countIn: true,
      });
      engine.onState(setIsPlaying);
      engine.onPosition(setPositionTicks);
      bindEngine(engine, ir);
      initialised.current = true;
    })().catch((e) => {
      if (!disposed) setError(e instanceof Error ? e.message : "Audio failed.");
    });

    return () => {
      disposed = true;
      unbind();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoreId]);

  return (
    <div className="flex flex-col gap-5">
      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}

      {/* Transport + part controls stay pinned to the top of the viewport
          while you scroll the score, so Play / Stop and the mute toggles
          are always reachable. Side by side on wide screens; stacked when
          there isn't room. */}
      <div className="sticky top-0 z-20 -mx-5 flex flex-col gap-3 border-b border-border bg-background/95 px-5 py-2 backdrop-blur lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <TransportBar />
        </div>
        <div className="w-full shrink-0 lg:w-[22rem]">
          <PartMixer scoreId={scoreId} />
        </div>
      </div>

      {source === "musicxml" ? (
        <Notation scoreId={scoreId} ir={ir} />
      ) : (
        <PositionReadout ir={ir} />
      )}

      <p className="text-xs text-muted">
        Tip: audio starts after your first tap on Play (browsers block sound
        until then). Samples for the piano voice stream from the Tone.js CDN.
      </p>
    </div>
  );
}
