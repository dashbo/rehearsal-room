import type { ScoreIR } from "@/lib/score-ir";

export function measureAtTick(ir: ScoreIR, tick: number): number {
  for (const m of ir.measures) {
    if (tick >= m.startTick && tick < m.endTick) return m.index;
  }
  return ir.measures.at(-1)?.index ?? 1;
}

/** Seconds elapsed from tick 0 to `tick`, honouring the tempo map (rate=1). */
export function tickToSeconds(ir: ScoreIR, tick: number, rate = 1): number {
  const map = [...ir.tempoMap].sort((a, b) => a.tick - b.tick);
  let seconds = 0;
  let cursor = 0;
  let bpm = map[0]?.bpm ?? 100;
  for (let i = 0; i < map.length; i++) {
    const entry = map[i];
    if (entry.tick >= tick) break;
    const segStart = Math.max(cursor, entry.tick);
    const next = map[i + 1];
    const segEnd = next ? Math.min(next.tick, tick) : tick;
    if (segEnd > segStart) {
      seconds += ((segEnd - segStart) / ir.ppq) * (60 / (entry.bpm * rate));
      cursor = segEnd;
    }
    bpm = entry.bpm;
  }
  if (cursor < tick) {
    seconds += ((tick - cursor) / ir.ppq) * (60 / (bpm * rate));
  }
  return seconds;
}

export function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function effectiveBpm(ir: ScoreIR, tick: number, rate: number): number {
  const map = [...ir.tempoMap].sort((a, b) => a.tick - b.tick);
  let bpm = map[0]?.bpm ?? 100;
  for (const e of map) {
    if (e.tick <= tick) bpm = e.bpm;
    else break;
  }
  return bpm * rate;
}
