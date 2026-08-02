"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Card, ErrorBanner, Field } from "@/components/ui";
import { ApiRequestError, api } from "@/lib/api-client";

/** Banner shown on guest profiles: "Save your stats." Spec §6 step 4. */
export function ClaimAccountBanner({ userId }: { userId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    try {
      await api.post("/api/auth/claim-guest", {
        guestUserId: userId,
        email: String(form.get("email") ?? ""),
        password: String(form.get("password") ?? ""),
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.detail.message : "Couldn't claim this profile.");
      setPending(false);
    }
  }

  if (!open) {
    return (
      <Card glow className="text-center">
        <p className="text-[0.8125rem] font-medium">Save your stats</p>
        <p className="mt-1 text-[0.75rem] text-muted">Create an account to keep your ratings permanently.</p>
        <Button size="sm" variant="secondary" className="mt-3" onClick={() => setOpen(true)}>
          Claim this profile
        </Button>
      </Card>
    );
  }

  return (
    <Card glow>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Email" name="email" type="email" required autoFocus />
        <Field label="Password" name="password" type="password" required placeholder="At least 8 characters" />
        <ErrorBanner>{error}</ErrorBanner>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Claiming…" : "Claim account"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </form>
    </Card>
  );
}