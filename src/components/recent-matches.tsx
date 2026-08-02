"use client";

import { useState } from "react";
import { Delta, Card, SectionTitle } from "@/components/ui";
import { VoidButton } from "@/components/match-actions";
import { ReactButton } from "@/components/react-button";
import type { MatchSummary } from "@/server/matches/queries";

export function RecentMatches({
  matches,
  canVoid,
}: {
  matches: MatchSummary[];
  canVoid: boolean;
}) {
  return (
    <section className="mt-6">
      <SectionTitle>Recent matches</SectionTitle>
      <Card noPadding>
        <ul className="divide-y divide-border">
          {matches.map((match) => (
            <MatchRow key={match.id} match={match} canVoid={canVoid} />
          ))}
        </ul>
      </Card>
    </section>
  );
}

function MatchRow({
  match,
  canVoid,
}: {
  match: MatchSummary;
  canVoid: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const winners = match.participants.filter((p) => p.finalRank === 1);

  return (
    <li>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-[0.8125rem] font-medium">
            {winners.map((w) => w.displayName).join(" & ")} won
          </p>
          <p className="mt-0.5 truncate text-[0.6875rem] text-muted-dim">
            {match.game.name}
            {match.matchType === "casual" ? " · casual" : ""}
          </p>
        </div>
        <time dateTime={match.playedAt.toISOString()} className="shrink-0 text-[0.6875rem] tabular-nums text-muted-dim">
          {match.playedAt.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
        </time>
        {canVoid ? <VoidButton matchId={match.id} /> : null}
        <ReactButton matchId={match.id} />
      </button>
      {expanded ? (
        <div className="border-t border-border bg-surface-2/50 px-4 py-3">
          <ul className="space-y-1.5">
            {match.participants.map((p) => (
              <li key={p.userId} className="flex items-center justify-between text-[0.8125rem]">
                <span className="flex items-center gap-2">
                  <span className="w-4 text-center text-[0.6875rem] font-semibold tabular-nums text-muted-dim">
                    {p.finalRank ?? "—"}
                  </span>
                  <span className="text-text">{p.displayName}</span>
                </span>
                <Delta value={p.ratingDelta} className="text-[0.75rem]" />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </li>
  );
}
