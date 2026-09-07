"use client";

import { useState } from "react";
import { usePlayerStore } from "@/store/player-store";
import { updatePart } from "@/lib/api";
import { VOICE_TYPES, type VoiceType } from "@/lib/score-ir";

export function PartMixer({ scoreId }: { scoreId: string }) {
  const parts = usePlayerStore((s) => s.parts);
  const setPartControls = usePlayerStore((s) => s.setPartControls);
  const clearMutes = usePlayerStore((s) => s.clearMutes);
  const renamePart = usePlayerStore((s) => s.renamePart);

  const anyMuted = parts.some((p) => p.mute);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-panel">
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">
          Parts
        </span>
        {anyMuted && (
          <button
            onClick={clearMutes}
            className="text-xs text-accent hover:underline"
          >
            Unmute all
          </button>
        )}
      </div>
      <ul className="max-h-[36vh] divide-y divide-border overflow-y-auto">
        {parts.map((part) => (
          <PartRow
            key={part.id}
            scoreId={scoreId}
            part={part}
            onControls={(patch) => setPartControls(part.id, patch)}
            onRename={(name, voiceType) => renamePart(part.id, name, voiceType)}
          />
        ))}
      </ul>
    </div>
  );
}

function PartRow({
  scoreId,
  part,
  onControls,
  onRename,
}: {
  scoreId: string;
  part: {
    id: string;
    name: string;
    voiceType: string;
    mute: boolean;
    volumeDb: number;
  };
  onControls: (patch: { mute?: boolean; volumeDb?: number }) => void;
  onRename: (name: string, voiceType: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(part.name);
  const [voiceType, setVoiceType] = useState(part.voiceType);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await updatePart(scoreId, part.id, { name, voiceType });
      onRename(name, voiceType);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <li
      className={`flex flex-wrap items-center gap-3 px-4 py-2 transition-opacity ${
        part.mute ? "opacity-45" : ""
      }`}
    >
      <div className="min-w-0 flex-1">
        {editing ? (
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-32 rounded-md border border-border bg-background px-2 py-1 text-sm"
            />
            <select
              value={voiceType}
              onChange={(e) => setVoiceType(e.target.value as VoiceType)}
              className="rounded-md border border-border bg-background px-1 py-1 text-sm"
            >
              {VOICE_TYPES.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
            <button
              onClick={save}
              disabled={saving}
              className="text-xs text-accent hover:underline disabled:opacity-50"
            >
              {saving ? "saving…" : "save"}
            </button>
            <button
              onClick={() => {
                setEditing(false);
                setName(part.name);
                setVoiceType(part.voiceType);
              }}
              className="text-xs text-muted hover:underline"
            >
              cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="group flex min-w-0 items-center gap-2 text-left"
            title="Rename or relabel this part"
          >
            <span className="truncate font-medium">{part.name}</span>
            <span className="shrink-0 rounded bg-border/60 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted">
              {part.voiceType}
            </span>
          </button>
        )}
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>

      <button
        onClick={() => onControls({ mute: !part.mute })}
        className={`shrink-0 rounded-md border px-2 py-1 text-xs font-medium ${
          part.mute
            ? "border-red-400 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"
            : "border-border hover:border-accent"
        }`}
      >
        {part.mute ? "Muted" : "Mute"}
      </button>

      <input
        type="range"
        min={-30}
        max={6}
        step={1}
        value={part.volumeDb}
        onChange={(e) => onControls({ volumeDb: Number(e.target.value) })}
        className="w-20 shrink-0 accent-accent sm:w-24"
        aria-label={`${part.name} volume`}
      />
    </li>
  );
}
