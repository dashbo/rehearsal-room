import type { ScoreIR, ScoreSource } from "@/lib/score-ir";

export interface ScoreListItem {
  id: string;
  title: string;
  source: ScoreSource;
  originalFilename: string;
  createdAt: string;
}

export interface ScoreDetail {
  meta: {
    id: string;
    title: string;
    source: ScoreSource;
    originalFilename: string;
    createdAt: string;
  };
  ir: ScoreIR;
}

async function readError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (body?.error) return body.error as string;
  } catch {
    /* ignore */
  }
  return `Request failed (${res.status})`;
}

export async function listScores(): Promise<ScoreListItem[]> {
  const res = await fetch("/api/scores", { cache: "no-store" });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()).scores;
}

export async function uploadScore(
  file: File,
): Promise<{ id: string; warnings: string[] }> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/scores", { method: "POST", body: form });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export async function deleteScore(id: string): Promise<void> {
  const res = await fetch(`/api/scores/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await readError(res));
}

export async function updatePart(
  scoreId: string,
  partId: string,
  patch: { name?: string; voiceType?: string },
): Promise<void> {
  const res = await fetch(`/api/scores/${scoreId}/parts`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ partId, ...patch }),
  });
  if (!res.ok) throw new Error(await readError(res));
}
