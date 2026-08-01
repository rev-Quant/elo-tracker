"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui";
import { ApiRequestError, api } from "@/lib/api-client";

const UNDO_WINDOW_SECONDS = 60;

/** "Match logged. Undo?" toast (spec §3), shown right after logging. */
export function UndoButton({ matchId, onUndone }: { matchId: string; onUndone: () => void }) {
  const [secondsLeft, setSecondsLeft] = useState(UNDO_WINDOW_SECONDS);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, []);

  if (secondsLeft === 0) return null;

  async function undo() {
    setPending(true);
    try {
      await api.del(`/api/matches/${matchId}`);
      onUndone();
    } finally {
      setPending(false);
    }
  }

  return (
    <Button variant="secondary" onClick={undo} disabled={pending}>
      {pending ? "Undoing…" : `Undo (${secondsLeft}s)`}
    </Button>
  );
}

/**
 * Void/dispute a match. Spec §4/§11 — see src/server/matches/void.ts for why
 * this one action covers both undo and dispute.
 */
export function VoidButton({ matchId }: { matchId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (!confirm("Void this match? Ratings it produced will be reversed.")) return;
    setPending(true);
    setError(null);
    try {
      await api.del(`/api/matches/${matchId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.detail.message : "Couldn't void that match.");
    } finally {
      setPending(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="text-xs text-muted underline-offset-2 hover:text-down hover:underline disabled:opacity-50"
      >
        {pending ? "Voiding…" : "Void"}
      </button>
      {error ? <span className="text-xs text-down">{error}</span> : null}
    </span>
  );
}
