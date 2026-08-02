"use client";

import { useState } from "react";

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

function loadQueuedMatch(): QueuedMatch | null {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null;
    if (!raw) return null;
    localStorage.removeItem(KEY);
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function useQueuedMatch() {
  return useState(loadQueuedMatch)[0];
}