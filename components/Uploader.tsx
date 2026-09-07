"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useDropzone } from "react-dropzone";
import { uploadScore } from "@/lib/api";
import { ACCEPTED_EXTENSIONS } from "@/lib/parse-score";

export function Uploader({ onUploaded }: { onUploaded?: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback(
    async (file: File) => {
      setBusy(true);
      setError(null);
      try {
        const { id } = await uploadScore(file);
        onUploaded?.();
        router.push(`/scores/${id}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed.");
        setBusy(false);
      }
    },
    [router, onUploaded],
  );

  const onDrop = useCallback(
    (accepted: File[]) => {
      if (accepted[0]) void handleFile(accepted[0]);
    },
    [handleFile],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    disabled: busy,
    accept: {
      "application/xml": [".xml", ".musicxml"],
      "application/vnd.recordare.musicxml+xml": [".musicxml"],
      "application/vnd.recordare.musicxml": [".mxl"],
      "audio/midi": [".mid", ".midi"],
    },
  });

  return (
    <div>
      <div
        {...getRootProps()}
        className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors ${
          isDragActive
            ? "border-accent bg-accent/5"
            : "border-border hover:border-accent/60"
        } ${busy ? "opacity-60" : "cursor-pointer"}`}
      >
        <input {...getInputProps()} />
        <p className="text-base font-medium">
          {busy
            ? "Uploading and analysing…"
            : isDragActive
              ? "Drop the score here"
              : "Drop a score, or click to choose a file"}
        </p>
        <p className="text-sm text-muted">
          MusicXML ({ACCEPTED_EXTENSIONS.slice(0, 3).join(", ")}) or MIDI (.mid)
          — export one from MuseScore, Finale, or Sibelius. Max 5&nbsp;MB.
        </p>
      </div>
      {error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}
