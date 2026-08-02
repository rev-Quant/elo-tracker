"use client";

import { useEffect, useState } from "react";
import type { Badge } from "@/server/users/badges";

/**
 * Shows a toast when the user earned a new badge they didn't have before.
 * Compares current badges against a localStorage cache; shows a brief
 * celebration for the first new badge seen this session.
 */
const SEEN_KEY = "elo-seen-badges";

function loadSeen(): string[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]"); } catch { return []; }
}

function saveSeen(ids: string[]) {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify(ids)); } catch {}
}

export function BadgeToast({ badges, className = "" }: { badges: Badge[]; className?: string }) {
  const [newBadge, setNewBadge] = useState<Badge | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const seen = loadSeen();
    const current = badges.map((b) => b.id);
    const unseen = badges.find((b) => !seen.includes(b.id));
    if (unseen) {
      setNewBadge(unseen);
      setVisible(true);
      saveSeen([...new Set([...seen, ...current])]);
      const timer = setTimeout(() => setVisible(false), 4000);
      return () => clearTimeout(timer);
    }
  }, [badges]);

  if (!visible || !newBadge) return null;

  return (
    <div className={`animate-scale-in fixed left-1/2 top-20 z-50 -translate-x-1/2 rounded-2xl border border-accent/30 bg-surface px-5 py-3 shadow-lg ${className}`}>
      <p className="flex items-center gap-2 text-[0.875rem] font-semibold">
        <span className="text-xl">{newBadge.emoji}</span>
        <span>Achievement unlocked!</span>
      </p>
      <p className="mt-0.5 text-[0.75rem] text-muted">{newBadge.label}</p>
    </div>
  );
}