"use client";

import { useEffect, useState } from "react";
import { Button, Card } from "@/components/ui";
import { ApiRequestError, api } from "@/lib/api-client";
import { dequeueMatch, type QueuedMatch } from "@/lib/offline";

export function OfflineRetry() {
  const [match, setMatch] = useState<QueuedMatch | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    setMatch(dequeueMatch());
  }, []);

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