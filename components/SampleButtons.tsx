"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { uploadScore } from "@/lib/api";

const SAMPLES = [
  {
    label: "SATB chorale (MusicXML)",
    path: "/samples/chorale-satb.musicxml",
    filename: "chorale-satb.musicxml",
    type: "application/xml",
  },
  {
    label: "3-part round (MIDI)",
    path: "/samples/round-three-parts.mid",
    filename: "round-three-parts.mid",
    type: "audio/midi",
  },
];

export function SampleButtons({ onLoaded }: { onLoaded?: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load(sample: (typeof SAMPLES)[number]) {
    setBusy(sample.path);
    setError(null);
    try {
      const res = await fetch(sample.path);
      if (!res.ok) throw new Error("Could not fetch the sample file.");
      const blob = await res.blob();
      const file = new File([blob], sample.filename, { type: sample.type });
      const { id } = await uploadScore(file);
      onLoaded?.();
      router.push(`/scores/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sample.");
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {SAMPLES.map((s) => (
          <button
            key={s.path}
            onClick={() => load(s)}
            disabled={busy !== null}
            className="rounded-lg border border-border bg-panel px-3 py-1.5 text-sm hover:border-accent disabled:opacity-50"
          >
            {busy === s.path ? "Loading…" : `Load ${s.label}`}
          </button>
        ))}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
