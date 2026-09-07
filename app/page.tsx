"use client";

import { useState } from "react";
import { Uploader } from "@/components/Uploader";
import { UrlImport } from "@/components/UrlImport";
import { ScoreList } from "@/components/ScoreList";
import { SampleButtons } from "@/components/SampleButtons";

export default function HomePage() {
  const [refreshKey, setRefreshKey] = useState(0);
  const bump = () => setRefreshKey((k) => k + 1);

  return (
    <main className="mx-auto max-w-2xl px-5 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Choir Practice</h1>
        <p className="mt-1 text-sm text-muted">
          Upload a score you have the rights to use, then rehearse your part —
          play at any tempo and mute or solo any voice.
        </p>
      </header>

      <section className="mb-6">
        <Uploader onUploaded={bump} />
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
          Or paste a link
        </h2>
        <UrlImport onImported={bump} />
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
          Or try a sample
        </h2>
        <SampleButtons onLoaded={bump} />
      </section>

      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
          Your scores
        </h2>
        <ScoreList refreshKey={refreshKey} />
      </section>

      <footer className="mt-12 text-xs text-muted">
        You are responsible for holding the rights to any score you upload.
        Scores are unlisted but not private — anyone with the link can open one.
      </footer>
    </main>
  );
}
