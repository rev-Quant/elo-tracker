"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui";
import { ApiRequestError, api } from "@/lib/api-client";

const UNDO_WINDOW_SECONDS = 60;

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
    try { await api.del(`/api/matches/${matchId}`); onUndone(); }
    finally { setPending(false); }
  }

  return (
    <Button variant="ghost" size="sm" onClick={undo} disabled={pending} className="!w-auto">
      {pending ? "Undoing…" : `Undo (${secondsLeft}s)`}
    </Button>
  );
}

export function VoidButton({ matchId }: { matchId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (!confirm("Void this match?")) return;
    setPending(true);
    setError(null);
    try { await api.del(`/api/matches/${matchId}`); router.refresh(); }
    catch (err) { setError(err instanceof ApiRequestError ? err.detail.message : "Couldn't void."); }
    finally { setPending(false); }
  }

  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="text-[0.6875rem] font-medium text-muted-dim underline-offset-2 hover:text-down hover:underline disabled:opacity-50"
      >
        {pending ? "…" : "Void"}
      </button>
      {error ? <span className="text-[0.625rem] text-down">{error}</span> : null}
    </span>
  );
}