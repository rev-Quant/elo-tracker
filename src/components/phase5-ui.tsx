"use client";

import { useState } from "react";
import { Card } from "@/components/ui";

/**
 * Photo upload — converts to base64 and sends with the match.
 * Shows on the log-match form in More options.
 */
export function PhotoUpload({ onPhoto }: { onPhoto: (base64: string | null) => void }) {
  const [preview, setPreview] = useState<string | null>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      setPreview(base64);
      onPhoto(base64);
    };
    reader.readAsDataURL(file);
  }

  return (
    <div>
      <label className="inline-block cursor-pointer rounded-xl border border-dashed border-border px-4 py-2 text-[0.75rem] text-muted-dim hover:border-muted hover:text-muted">
        📸 Add photo
        <input type="file" accept="image/*" onChange={handleFile} className="hidden" />
      </label>
      {preview ? (
        <div className="mt-2">
          <img src={preview} alt="Preview" className="max-h-32 rounded-lg border border-border" />
          <button type="button" onClick={() => { setPreview(null); onPhoto(null); }} className="mt-1 text-[0.6875rem] text-down">Remove</button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Rating shield indicator. Shows if the user has an active shield.
 */
export function ShieldBadge({ active, onUse }: { active: boolean; onUse?: () => void }) {
  if (!active) return null;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[0.6875rem] font-semibold ${onUse ? "cursor-pointer bg-accent/10 text-accent border border-accent/30" : "bg-surface-2 text-muted-dim border border-border"}`}
      onClick={onUse}
    >
      🛡️ Shield active
    </span>
  );
}

/**
 * Season filter for the leaderboard.
 */
export function SeasonFilter({
  seasons,
  current,
  onChange,
}: {
  seasons: { id: string; name: string }[];
  current: string | null;
  onChange: (id: string | null) => void;
}) {
  return (
    <div className="mb-3 flex flex-wrap gap-1.5">
      <button
        type="button"
        onClick={() => onChange(null)}
        className={`rounded-full border px-3 py-1 text-[0.6875rem] font-medium transition ${!current ? "border-accent/50 bg-accent/10 text-accent" : "border-border text-muted-dim hover:text-muted"}`}
      >
        All time
      </button>
      {seasons.map((s) => (
        <button
          key={s.id}
          type="button"
          onClick={() => onChange(s.id)}
          className={`rounded-full border px-3 py-1 text-[0.6875rem] font-medium transition ${current === s.id ? "border-accent/50 bg-accent/10 text-accent" : "border-border text-muted-dim hover:text-muted"}`}
        >
          {s.name}
        </button>
      ))}
    </div>
  );
}