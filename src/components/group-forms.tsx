"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, ErrorBanner, Field } from "@/components/ui";
import { ApiRequestError, api } from "@/lib/api-client";

export function CreateGroupForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const name = String(new FormData(event.currentTarget).get("name") ?? "");
    try {
      const { group } = await api.post<{ group: { slug: string } }>("/api/groups", {
        name,
        isPublic: false,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      });
      router.push(`/g/${group.slug}`);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.detail.message : "Couldn't create the group.");
      setPending(false);
    }
  }

  if (!open) {
    return <Button variant="ghost" onClick={() => setOpen(true)}>+ New group</Button>;
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="Group name" name="name" placeholder="College Friends" required autoFocus />
      <ErrorBanner>{error}</ErrorBanner>
      <div className="flex gap-2">
        <Button size="sm" type="submit" disabled={pending} className="flex-1">
          {pending ? "Creating…" : "Create"}
        </Button>
        <Button size="sm" type="button" variant="ghost" className="flex-1" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function JoinGroupForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const inviteCode = String(new FormData(event.currentTarget).get("inviteCode") ?? "");
    try {
      const { group } = await api.post<{ group: { slug: string } }>("/api/groups/join", { inviteCode });
      router.push(`/g/${group.slug}`);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.detail.message : "Couldn't join that group.");
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field
        label="Have an invite code?"
        name="inviteCode"
        placeholder="BCDFGHJK"
        autoCapitalize="characters"
        required
      />
      <ErrorBanner>{error}</ErrorBanner>
      <Button type="submit" variant="secondary" size="sm" disabled={pending}>
        {pending ? "Joining…" : "Join group"}
      </Button>
    </form>
  );
}