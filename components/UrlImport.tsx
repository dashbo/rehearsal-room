"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { importScoreFromUrl } from "@/lib/api";

export function UrlImport({ onImported }: { onImported?: () => void }) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { id } = await importScoreFromUrl(url.trim());
      onImported?.();
      router.push(`/scores/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://…  (a song page or a link to a .mxl / .mid file)"
          className="min-w-0 flex-1 rounded-lg border border-border bg-panel px-3 py-2 text-sm"
          disabled={busy}
        />
        <button
          type="submit"
          disabled={busy || !url.trim()}
          className="shrink-0 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Importing…" : "Import"}
        </button>
      </div>
      <p className="text-xs text-muted">
        Works with{" "}
        <span className="font-medium">churchofjesuschrist.org</span> song pages
        and direct links to MusicXML or MIDI files.
      </p>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
