"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, ApiRequestError } from "@/lib/api-client";

/**
 * Confirm or dispute a match. Shows to participants of pending matches.
 * Spec §3 — competitive matches need confirmation from at least 1 other player.
 */
export function ConfirmButton({ matchId }: { matchId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(action: "confirm" | "dispute") {
    setPending(true);
    setError(null);
    try {
      await api.post(`/api/matches/${matchId}/${action}`);
      setDone(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.detail.message : `Couldn't ${action}.`);
    } finally {
      setPending(false);
    }
  }

  if (done) return <span className="text-[0.625rem] text-up">✓</span>;

  return (
    <span className="inline-flex items-center gap-1 shrink-0">
      <button
        type="button"
        onClick={() => act("confirm")}
        disabled={pending}
        className="rounded-full bg-up/15 px-2.5 py-0.5 text-[0.625rem] font-semibold text-up hover:bg-up/25 disabled:opacity-50"
      >
        Confirm
      </button>
      <button
        type="button"
        onClick={() => act("dispute")}
        disabled={pending}
        className="rounded-full bg-down/15 px-2.5 py-0.5 text-[0.625rem] font-semibold text-down hover:bg-down/25 disabled:opacity-50"
      >
        Dispute
      </button>
      {error ? <span className="text-[0.5rem] text-down">{error}</span> : null}
    </span>
  );
}