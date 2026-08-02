"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card } from "@/components/ui";
import { ApiRequestError, api } from "@/lib/api-client";

/**
 * Gauntlet challenge button. Shows on a profile page to challenge that player.
 * Also shows active gauntlets on the group dashboard.
 */
export function GauntletChallenge({
  groupSlug,
  gameId,
  gameName,
  opponentId,
  opponentName,
  activeGauntlet,
}: {
  groupSlug: string;
  gameId: string;
  gameName: string;
  opponentId: string;
  opponentName: string;
  activeGauntlet?: {
    id: string;
    challengerWins: number;
    opponentWins: number;
    bestOf: number;
  } | null;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (activeGauntlet) {
    const needed = Math.ceil(activeGauntlet.bestOf / 2);
    return (
      <Card glow className="mb-3">
        <p className="text-[0.8125rem] font-semibold">⚔️ Active Gauntlet: {gameName}</p>
        <p className="mt-1 text-[0.75rem] tabular-nums">
          {activeGauntlet.challengerWins} - {activeGauntlet.opponentWins}{" "}
          (first to {needed})
        </p>
        <p className="mt-0.5 text-[0.6875rem] text-muted-dim">Deciding game: {activeGauntlet.challengerWins + activeGauntlet.opponentWins + 1} of {activeGauntlet.bestOf}</p>
      </Card>
    );
  }

  async function challenge(bestOf: number) {
    setPending(true);
    setError(null);
    try {
      // POST to create gauntlet
      await fetch(`/api/groups/${groupSlug}/gauntlets`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ opponentId, gameId, bestOf }),
      });
      router.refresh();
    } catch {
      setError("Couldn't create challenge.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mb-3">
      <p className="mb-2 text-[0.75rem] text-muted">
        Challenge {opponentName} to a best-of series:
      </p>
      <div className="flex gap-2">
        {[3, 5].map((n) => (
          <Button key={n} size="sm" variant="secondary" disabled={pending} onClick={() => challenge(n)}>
            Best of {n}
          </Button>
        ))}
      </div>
      {error ? <p className="mt-1 text-xs text-down">{error}</p> : null}
    </div>
  );
}