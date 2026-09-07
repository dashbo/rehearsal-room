"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { deleteScore, listScores, type ScoreListItem } from "@/lib/api";

export function ScoreList({ refreshKey }: { refreshKey: number }) {
  const [scores, setScores] = useState<ScoreListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    listScores()
      .then((s) => active && setScores(s))
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [refreshKey]);

  async function handleDelete(id: string) {
    setPendingDelete(id);
    try {
      await deleteScore(id);
      setScores((cur) => cur?.filter((s) => s.id !== id) ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed.");
    } finally {
      setPendingDelete(null);
    }
  }

  if (error) {
    return <p className="text-sm text-red-600">{error}</p>;
  }
  if (!scores) {
    return <p className="text-sm text-muted">Loading…</p>;
  }
  if (scores.length === 0) {
    return (
      <p className="text-sm text-muted">
        No scores yet. Upload one above to start rehearsing.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-panel">
      {scores.map((score) => (
        <li
          key={score.id}
          className="flex items-center justify-between gap-4 px-4 py-3"
        >
          <Link href={`/scores/${score.id}`} className="min-w-0 flex-1">
            <span className="block truncate font-medium hover:text-accent">
              {score.title}
            </span>
            <span className="block truncate text-xs text-muted">
              {score.source === "midi" ? "MIDI" : "MusicXML"} ·{" "}
              {score.originalFilename} ·{" "}
              {new Date(score.createdAt).toLocaleDateString()}
            </span>
          </Link>
          <button
            onClick={() => handleDelete(score.id)}
            disabled={pendingDelete === score.id}
            className="shrink-0 rounded-md px-2 py-1 text-xs text-muted hover:bg-red-50 hover:text-red-700 disabled:opacity-50 dark:hover:bg-red-950/40"
          >
            {pendingDelete === score.id ? "Deleting…" : "Delete"}
          </button>
        </li>
      ))}
    </ul>
  );
}
