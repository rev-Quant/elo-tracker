"use client";

import { useState } from "react";
import { Button, Card } from "@/components/ui";
import { ApiRequestError, api } from "@/lib/api-client";
import type { QueuedMatch } from "@/lib/offline";

function loadQueued(): QueuedMatch | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("elo-log-queue");
    if (!raw) return null;
    localStorage.removeItem("elo-log-queue");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function OfflineRetry() {
  const [match, setMatch] = useState(loadQueued);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (!match || done) return null;

  async function retry() {
    setPending(true);
    setError(null);
    try {
      await api.post(`/api/groups/${match!.slug}/matches`, match!.body);
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.detail.message : "Still couldn't sync. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card glow className="mb-4">
      <p className="mb-2 text-[0.8125rem] font-medium">Offline match queued</p>
      <p className="mb-3 text-[0.75rem] text-muted">
        A match failed to log while you were offline. Retry now?
      </p>
      {error ? <p className="mb-3 text-[0.75rem] text-down">{error}</p> : null}
      <div className="flex gap-2">
        <Button size="sm" onClick={retry} disabled={pending}>
          {pending ? "Retrying…" : "Retry"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setDone(true)}>
          Discard
        </Button>
      </div>
    </Card>
  );
}