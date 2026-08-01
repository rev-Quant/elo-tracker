"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, ErrorBanner, Field } from "@/components/ui";
import { ApiRequestError, api } from "@/lib/api-client";

/**
 * "Just play" path: create a guest identity with only a name, join, and start
 * logging. Spec §6 step 3 — the payoff comes before the signup ask.
 */
export function JoinNowButton({ code }: { code: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const displayName = String(new FormData(event.currentTarget).get("displayName") ?? "");
    try {
      await api.post("/api/auth/guest", { displayName });
      const { group } = await api.post<{ group: { slug: string } }>("/api/groups/join", {
        inviteCode: code,
      });
      router.push(`/g/${group.slug}`);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.detail.message : "Couldn't join right now.");
      setPending(false);
    }
  }

  if (!open) {
    return (
      <Button variant="ghost" onClick={() => setOpen(true)}>
        Just add my name for now
      </Button>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-2xl border border-border bg-surface p-4">
      <Field label="Your name" name="displayName" required autoFocus />
      <ErrorBanner>{error}</ErrorBanner>
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Joining…" : "Join as guest"}
      </Button>
      <p className="text-center text-xs text-muted">
        You can save your stats with an account later.
      </p>
    </form>
  );
}
