"use client";

import { useEffect, useRef, useState } from "react";
import type { ScoreIR } from "@/lib/score-ir";
import { usePlayerStore } from "@/store/player-store";

type OSMD = import("opensheetmusicdisplay").OpenSheetMusicDisplay;

export function Notation({ scoreId, ir }: { scoreId: string; ir: ScoreIR }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const osmdRef = useRef<OSMD | null>(null);
  const lastWholeRef = useRef(0);
  const renderWidthRef = useRef(0);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [message, setMessage] = useState<string | null>(null);

  const positionTicks = usePlayerStore((s) => s.positionTicks);

  // re-render for the current container width, then (re)place the cursor
  function renderAndShowCursor() {
    const osmd = osmdRef.current;
    const el = containerRef.current;
    if (!osmd || !el) return;
    try {
      osmd.render();
      osmd.cursor.show();
      osmd.cursor.update();
      renderWidthRef.current = el.clientWidth;
    } catch {
      /* transient layout race — ignore, a later pass will catch it */
    }
  }

  // load + render
  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    lastWholeRef.current = 0;
    renderWidthRef.current = 0;

    (async () => {
      const { OpenSheetMusicDisplay } = await import("opensheetmusicdisplay");
      if (cancelled || !containerRef.current) return;

      const osmd = new OpenSheetMusicDisplay(containerRef.current, {
        autoResize: false, // we drive re-layout with a ResizeObserver
        backend: "svg",
        drawingParameters: "default",
        drawPartNames: true,
        followCursor: true,
        cursorsOptions: [{ type: 0, color: "#2f6feb", alpha: 0.35, follow: true }],
      });
      osmdRef.current = osmd;

      const res = await fetch(`/api/scores/${scoreId}/file`);
      if (!res.ok) throw new Error("Could not load the score file.");
      const xml = await res.text();
      if (cancelled) return;

      await osmd.load(xml);
      if (cancelled) return;

      osmd.cursor.reset();
      renderAndShowCursor();
      setStatus("ready");

      // container width often settles a frame or two after mount; re-render
      // once it has, otherwise the engraving lays out at the wrong width and
      // only snaps into place on the next resize (e.g. a browser zoom).
      requestAnimationFrame(() => {
        if (!cancelled) renderAndShowCursor();
      });
      setTimeout(() => {
        if (!cancelled) renderAndShowCursor();
      }, 150);
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

  // re-render on container resize
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const ro = new ResizeObserver(() => {
      if (!osmdRef.current) return;
      const w = el.clientWidth;
      if (Math.abs(w - renderWidthRef.current) < 8) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        renderAndShowCursor();
        placeCursor(true);
      }, 120);
    });
    ro.observe(el);
    return () => {
      if (timer) clearTimeout(timer);
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  function placeCursor(forceReset = false) {
    const osmd = osmdRef.current;
    if (!osmd || status !== "ready") return;
    const targetWhole = positionTicks / (ir.ppq * 4);
    const cursor = osmd.cursor;

    if (forceReset || targetWhole < lastWholeRef.current - 1e-6) {
      cursor.reset();
    }
    lastWholeRef.current = targetWhole;

    let guard = 0;
    while (!cursor.iterator.EndReached && guard++ < 20000) {
      const ts = cursor.iterator.currentTimeStamp?.RealValue ?? 0;
      if (ts >= targetWhole - 1e-6) break;
      cursor.next();
    }
    cursor.update();
    (cursor.cursorElement as HTMLElement | undefined)?.scrollIntoView?.({
      block: "nearest",
      inline: "nearest",
    });
  }

  // follow playback
  useEffect(() => {
    placeCursor();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positionTicks, status]);

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
        className="osmd-container max-h-[72vh] min-h-24 w-full overflow-auto"
        style={{ visibility: status === "error" ? "hidden" : "visible" }}
      />
    </div>
  );
}
