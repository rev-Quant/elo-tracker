"use client";

import { useEffect, useState } from "react";

/**
 * Persists the last failed log-match submission to localStorage so a retry
 * button can replay it after the connection returns (spec §10).
 */

const KEY = "elo-log-queue";

export interface QueuedMatch {
  body: unknown;
  slug: string;
  failedAt: string;
}

export function queueMatch(body: unknown, slug: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ body, slug, failedAt: new Date().toISOString() }));
  } catch { /* quota exceeded, drop silently */ }
}

export function dequeueMatch(): QueuedMatch | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    localStorage.removeItem(KEY);
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function useQueuedMatch() {
  const [queued, setQueued] = useState<QueuedMatch | null>(null);

  useEffect(() => {
    setQueued(dequeueMatch());
  }, []);

  return queued;
}