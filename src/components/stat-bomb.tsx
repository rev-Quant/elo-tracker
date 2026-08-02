"use client";

import { useState } from "react";
import { Card, Button, Delta, Chip } from "@/components/ui";

interface StatBombProps {
  winners: string[];
  gameName: string;
  groupName: string;
  rank: string;
  participants: { displayName: string; ratingBefore: number | null; ratingAfter: number | null }[];
  highlight?: string;
  nemesisNote?: string;
}

export function StatBomb({ winners, gameName, groupName, rank, participants, highlight, nemesisNote }: StatBombProps) {
  const [copied, setCopied] = useState(false);

  const text = [
    `🏆 ${winners.join(" & ").toUpperCase()} WINS`,
    `${gameName} · ${groupName}`,
    `${rank} | ${participants.filter((p) => winners.includes(p.displayName)).map((p) => p.ratingAfter !== null && p.ratingBefore !== null ? `${p.displayName}: ${Math.round(p.ratingBefore)} → ${Math.round(p.ratingAfter)}` : "").filter(Boolean).join(", ")}`,
    "",
    "📊 Match Stats",
    ...participants.map((p) => `${p.displayName}: ${p.ratingBefore !== null ? Math.round(p.ratingBefore) : "—"} → ${p.ratingAfter !== null ? Math.round(p.ratingAfter) : "—"}`),
    highlight ?? "",
    nemesisNote ?? "",
  ].filter(Boolean).join("\n");

  function copy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }

  return (
    <Card glow className="animate-scale-in relative">
      <p className="mb-1 text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-muted-dim">Stat Bomb</p>
      <p className="text-[1.25rem] font-extrabold leading-tight">
        🏆 {winners.join(" & ").toUpperCase()} WINS
      </p>
      <p className="mt-0.5 text-[0.8125rem] text-muted">
        {gameName} · {groupName} · {rank}
      </p>

      <div className="mt-3 space-y-1.5">
        {participants.map((p) => {
          const won = winners.includes(p.displayName);
          return (
            <div key={p.displayName} className="flex items-center gap-2 text-[0.75rem]">
              <Chip active={won} className="!py-0.5 !text-[0.625rem] font-semibold">
                {won ? "W" : "L"}
              </Chip>
              <span className="flex-1 truncate font-medium">{p.displayName}</span>
              <span className="tabular-nums font-semibold">
                {p.ratingBefore !== null ? Math.round(p.ratingBefore) : "—"}
              </span>
              <span className="text-muted-dim">→</span>
              <span className="tabular-nums font-semibold">
                {p.ratingAfter !== null ? Math.round(p.ratingAfter) : "—"}
              </span>
            </div>
          );
        })}
      </div>

      {highlight ? (
        <p className="mt-2 text-[0.6875rem] font-medium text-accent">{highlight}</p>
      ) : null}
      {nemesisNote ? (
        <p className="mt-1 text-[0.6875rem] text-muted-dim">{nemesisNote}</p>
      ) : null}

      <Button size="sm" variant="secondary" onClick={copy} className="mt-3">
        {copied ? "Copied!" : "Copy to clipboard"}
      </Button>
    </Card>
  );
}