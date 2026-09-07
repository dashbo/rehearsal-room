"use client";

import { useEffect, useRef, useState } from "react";
import type { ScoreIR } from "@/lib/score-ir";
import { usePlayerStore } from "@/store/player-store";

type OSMD = import("opensheetmusicdisplay").OpenSheetMusicDisplay;

export function Notation({
  scoreId,
  ir,
}: {
  scoreId: string;
  ir: ScoreIR;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const osmdRef = useRef<OSMD | null>(null);
  const lastWholeRef = useRef(0);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [message, setMessage] = useState<string | null>(null);

  const positionTicks = usePlayerStore((s) => s.positionTicks);

  // load + render
  useEffect(() => {
    let cancelled = false;
    setStatus("loading");

    (async () => {
      const { OpenSheetMusicDisplay } = await import("opensheetmusicdisplay");
      if (cancelled || !containerRef.current) return;

      const osmd = new OpenSheetMusicDisplay(containerRef.current, {
        autoResize: true,
        backend: "svg",
        drawingParameters: "compact",
        drawPartNames: true,
        followCursor: true,
      });
      osmdRef.current = osmd;

      const res = await fetch(`/api/scores/${scoreId}/file`);
      if (!res.ok) throw new Error("Could not load the score file.");
      const xml = await res.text();
      if (cancelled) return;

      await osmd.load(xml);
      if (cancelled) return;
      osmd.render();
      osmd.cursor.show();
      setStatus("ready");
    })().catch((e) => {
      if (cancelled) return;
      setStatus("error");
      setMessage(e instanceof Error ? e.message : "Notation failed to render.");
    });

    return () => {
      cancelled = true;
      try {
        osmdRef.current?.clear();
      } catch {
        /* ignore */
      }
      osmdRef.current = null;
    };
  }, [scoreId]);

  // move the cursor to follow playback
  useEffect(() => {
    const osmd = osmdRef.current;
    if (!osmd || status !== "ready") return;

    const targetWhole = positionTicks / (ir.ppq * 4);
    const cursor = osmd.cursor;

    if (targetWhole < lastWholeRef.current - 1e-6) {
      cursor.reset();
    }
    lastWholeRef.current = targetWhole;

    let guard = 0;
    while (!cursor.iterator.EndReached && guard++ < 5000) {
      const ts = cursor.iterator.currentTimeStamp?.RealValue ?? 0;
      if (ts >= targetWhole - 1e-6) break;
      cursor.next();
    }
  }, [positionTicks, ir.ppq, status]);

  return (
    <div className="rounded-xl border border-border bg-panel p-3">
      {status === "loading" && (
        <p className="p-4 text-sm text-muted">Rendering notation…</p>
      )}
      {status === "error" && (
        <p className="p-4 text-sm text-red-600">
          {message} You can still rehearse using the parts and transport below.
        </p>
      )}
      <div
        ref={containerRef}
        className="osmd-container max-h-[70vh] overflow-auto"
        style={{ display: status === "ready" ? "block" : "none" }}
      />
    </div>
  );
}
