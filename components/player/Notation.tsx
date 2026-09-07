"use client";

import { useEffect, useRef, useState } from "react";
import type { ScoreIR } from "@/lib/score-ir";
import { usePlayerStore } from "@/store/player-store";

type OSMD = import("opensheetmusicdisplay").OpenSheetMusicDisplay;
type OSMDCursor = OSMD["cursor"];

/**
 * Keep the playback cursor visible by scrolling ONLY the notation panel —
 * never the page. `scrollIntoView` would walk every scrollable ancestor,
 * including the document, which yanks the transport controls off-screen.
 */
function scrollCursorIntoPanel(
  panel: HTMLElement | null,
  cursorEl: HTMLElement | undefined,
) {
  if (!panel || !cursorEl) return;
  const margin = 48;

  const top = cursorEl.offsetTop;
  const bottom = top + cursorEl.offsetHeight;
  if (top < panel.scrollTop + margin) {
    panel.scrollTop = Math.max(0, top - margin);
  } else if (bottom > panel.scrollTop + panel.clientHeight - margin) {
    panel.scrollTop = bottom - panel.clientHeight + margin;
  }

  const left = cursorEl.offsetLeft;
  const right = left + cursorEl.offsetWidth;
  if (left < panel.scrollLeft + margin) {
    panel.scrollLeft = Math.max(0, left - margin);
  } else if (right > panel.scrollLeft + panel.clientWidth - margin) {
    panel.scrollLeft = right - panel.clientWidth + margin;
  }
}

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

  function getCursor(): OSMDCursor | undefined {
    const osmd = osmdRef.current;
    if (!osmd) return undefined;
    return osmd.cursor ?? osmd.cursors?.[0];
  }

  // OSMD creates the cursor <img> with a NEGATIVE z-index (it's meant to sit
  // behind a transparent SVG). Our sheet has an opaque white background, so
  // force the cursor in front and make sure it's displayed.
  function forceCursorVisible() {
    const el = getCursor()?.cursorElement as HTMLElement | undefined;
    if (!el) return;
    el.style.zIndex = "10";
    el.style.display = "";
  }

  // re-render for the current container width, then (re)show the cursor
  function renderAndShowCursor() {
    const osmd = osmdRef.current;
    const el = containerRef.current;
    if (!osmd?.IsReadyToRender() || !el) return;
    try {
      osmd.render();
      renderWidthRef.current = el.clientWidth;
      const cursor = getCursor();
      if (cursor) {
        cursor.show();
        cursor.update();
        forceCursorVisible();
      }
    } catch {
      /* transient layout race — a later pass will catch it */
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
        autoResize: false, // re-layout is driven by a ResizeObserver
        backend: "svg",
        drawingParameters: "default",
        drawPartNames: true,
        // We scroll the cursor into view ourselves, inside this panel only —
        // OSMD's own followCursor scrolls the whole page.
        followCursor: false,
        cursorsOptions: [
          { type: 0, color: "#2f6feb", alpha: 0.45, follow: false },
        ],
      });
      // Tells OSMD to paint its own white page background AND (crucially) to
      // give the cursor a positive z-index instead of the default -2.
      osmd.EngravingRules.PageBackgroundColor = "#FFFFFF";
      osmdRef.current = osmd;

      const res = await fetch(`/api/scores/${scoreId}/file`);
      if (!res.ok) throw new Error("Could not load the score file.");
      const xml = await res.text();
      if (cancelled) return;

      await osmd.load(xml);
      if (cancelled) return;

      renderAndShowCursor(); // first paint (cursor is created during render)
      getCursor()?.reset();
      getCursor()?.show();
      setStatus("ready");

      // the container width often settles a frame or two after mount; if we
      // laid out before that, the engraving is the wrong width and only
      // snaps into place on a later resize (e.g. a browser zoom).
      requestAnimationFrame(() => !cancelled && renderAndShowCursor());
      setTimeout(() => !cancelled && renderAndShowCursor(), 200);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoreId]);

  // re-render on container resize
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const ro = new ResizeObserver(() => {
      if (!osmdRef.current) return;
      if (Math.abs(el.clientWidth - renderWidthRef.current) < 8) return;
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
    if (status !== "ready") return;
    const cursor = getCursor();
    if (!cursor) return;
    const targetWhole = positionTicks / (ir.ppq * 4);

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
    cursor.show();
    cursor.update();
    forceCursorVisible();
    scrollCursorIntoPanel(
      containerRef.current,
      cursor.cursorElement as HTMLElement | undefined,
    );
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
