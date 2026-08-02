"use client";

import { useState } from "react";
import { api } from "@/lib/api-client";
import { useRouter } from "next/navigation";

const EMOJIS = ["🔥", "💀", "👑", "😱", "🎯", "🤝"];

export function ReactButton({ matchId }: { matchId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function react(emoji: string) {
    await api.post(`/api/matches/${matchId}/react`, { emoji });
    router.refresh();
    setOpen(false);
  }

  return (
    <span className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-dim hover:border-muted"
      >
        +
      </button>
      {open ? (
        <span className="absolute bottom-full right-0 z-20 mb-1 flex gap-0.5 rounded-xl border border-border bg-surface px-2 py-1.5 shadow-lg">
          {EMOJIS.map((e) => (
            <button key={e} type="button" onClick={() => react(e)} className="text-base transition active:scale-125 hover:scale-110">
              {e}
            </button>
          ))}
        </span>
      ) : null}
    </span>
  );
}