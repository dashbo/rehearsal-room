"use client";

import { useMemo } from "react";
import { usePlayerStore } from "@/store/player-store";
import { MIN_RATE, MAX_RATE } from "@/lib/audio/engine";
import { INSTRUMENT_LABELS, type InstrumentId } from "@/lib/audio/instruments";
import {
  effectiveBpm,
  formatClock,
  measureAtTick,
  tickToSeconds,
} from "@/lib/format";

export function TransportBar() {
  const ir = usePlayerStore((s) => s.ir);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const positionTicks = usePlayerStore((s) => s.positionTicks);
  const tempoRate = usePlayerStore((s) => s.tempoRate);
  const instrument = usePlayerStore((s) => s.instrument);
  const metronomeOn = usePlayerStore((s) => s.metronomeOn);
  const countInOn = usePlayerStore((s) => s.countInOn);
  const loop = usePlayerStore((s) => s.loop);

  const togglePlay = usePlayerStore((s) => s.togglePlay);
  const stop = usePlayerStore((s) => s.stop);
  const seekTicks = usePlayerStore((s) => s.seekTicks);
  const setTempoRate = usePlayerStore((s) => s.setTempoRate);
  const setInstrument = usePlayerStore((s) => s.setInstrument);
  const setMetronome = usePlayerStore((s) => s.setMetronome);
  const setCountIn = usePlayerStore((s) => s.setCountIn);
  const setLoop = usePlayerStore((s) => s.setLoop);

  const lastMeasure = ir?.measures.at(-1)?.index ?? 1;

  const { elapsed, total, bar, baseBpm, playBpm } = useMemo(() => {
    if (!ir) {
      return { elapsed: 0, total: 0, bar: 1, baseBpm: 0, playBpm: 0 };
    }
    return {
      elapsed: tickToSeconds(ir, positionTicks, tempoRate),
      total: tickToSeconds(ir, ir.durationTicks, tempoRate),
      bar: measureAtTick(ir, positionTicks),
      baseBpm: effectiveBpm(ir, positionTicks, 1),
      playBpm: effectiveBpm(ir, positionTicks, tempoRate),
    };
  }, [ir, positionTicks, tempoRate]);

  if (!ir) return null;

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-panel p-4">
      {/* transport row */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={togglePlay}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          {isPlaying ? "Pause" : "Play"}
        </button>
        <button
          onClick={stop}
          className="rounded-lg border border-border px-3 py-2 text-sm hover:border-accent"
        >
          Stop
        </button>

        <div className="font-mono text-sm tabular-nums">
          {formatClock(elapsed)}{" "}
          <span className="text-muted">/ {formatClock(total)}</span>
        </div>
        <div className="text-sm text-muted">
          bar <span className="font-medium text-foreground">{bar}</span> /{" "}
          {lastMeasure}
        </div>

        <label className="ml-auto flex items-center gap-2 text-sm">
          <span className="text-muted">Instrument</span>
          <select
            value={instrument}
            onChange={(e) => setInstrument(e.target.value as InstrumentId)}
            className="rounded-md border border-border bg-background px-2 py-1"
          >
            {(Object.keys(INSTRUMENT_LABELS) as InstrumentId[]).map((id) => (
              <option key={id} value={id}>
                {INSTRUMENT_LABELS[id]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* scrubber */}
      <input
        type="range"
        min={0}
        max={ir.durationTicks}
        value={Math.min(positionTicks, ir.durationTicks)}
        onChange={(e) => seekTicks(Number(e.target.value))}
        className="w-full accent-accent"
        aria-label="Playback position"
      />

      {/* tempo row */}
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="text-muted">Tempo</span>
        <input
          type="range"
          min={MIN_RATE}
          max={MAX_RATE}
          step={0.05}
          value={tempoRate}
          onChange={(e) => setTempoRate(Number(e.target.value))}
          className="w-40 accent-accent"
          aria-label="Tempo rate"
        />
        <span className="font-mono tabular-nums">
          {Math.round(tempoRate * 100)}%
        </span>
        <span className="text-muted">
          {Math.round(baseBpm)} → {Math.round(playBpm)} bpm
        </span>
        {tempoRate !== 1 && (
          <button
            onClick={() => setTempoRate(1)}
            className="text-xs text-accent hover:underline"
          >
            reset
          </button>
        )}
      </div>

      {/* toggles + loop */}
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={metronomeOn}
            onChange={(e) => setMetronome(e.target.checked)}
            className="accent-accent"
          />
          Metronome
        </label>
        <label
          className="flex items-center gap-2"
          title="One bar of clicks before playback starts — and before every loop repeat"
        >
          <input
            type="checkbox"
            checked={countInOn}
            onChange={(e) => setCountIn(e.target.checked)}
            className="accent-accent"
          />
          Count-in{loop.enabled ? " (every loop)" : ""}
        </label>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={loop.enabled}
            onChange={(e) => setLoop({ enabled: e.target.checked })}
            className="accent-accent"
          />
          Loop bars
        </label>
        <span className="flex items-center gap-1">
          <MeasureInput
            value={loop.startMeasure}
            min={1}
            max={lastMeasure}
            onChange={(v) => setLoop({ startMeasure: v })}
          />
          <span className="text-muted">–</span>
          <MeasureInput
            value={loop.endMeasure}
            min={1}
            max={lastMeasure}
            onChange={(v) => setLoop({ endMeasure: v })}
          />
        </span>
      </div>
    </div>
  );
}

function MeasureInput({
  value,
  min,
  max,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <input
      type="number"
      min={min}
      max={max}
      value={value}
      onChange={(e) => {
        const v = Math.max(min, Math.min(max, Number(e.target.value) || min));
        onChange(v);
      }}
      className="w-16 rounded-md border border-border bg-background px-2 py-1"
    />
  );
}
