"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Card, ErrorBanner, Field, SectionTitle } from "@/components/ui";
import { ApiRequestError, api } from "@/lib/api-client";
import { useHideRating } from "@/lib/privacy";

interface Props {
  slug: string;
  group: { name: string; timezone: string; isPublic: boolean; inviteCode: string };
  canDelete: boolean;
}

export function GroupSettingsForm({ slug, group, canDelete }: Props) {
  const router = useRouter();
  const [name, setName] = useState(group.name);
  const [isPublic, setIsPublic] = useState(group.isPublic);
  const [timezone, setTimezone] = useState(group.timezone);
  const [inviteCode, setInviteCode] = useState(group.inviteCode);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const { hidden, toggle } = useHideRating();

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/groups/${slug}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, isPublic, timezone }),
      });
      if (!res.ok) {
        const body = await res.json();
        throw new ApiRequestError(res.status, body.error);
      }
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.detail.message : "Couldn't save.");
    } finally {
      setPending(false);
    }
  }

  async function regenerate() {
    if (!confirm("Regenerate invite code? Old link stops working.")) return;
    setPending(true);
    setError(null);
    try {
      const { inviteCode: next } = await api.post<{ inviteCode: string }>(`/api/groups/${slug}/invite`);
      setInviteCode(next);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.detail.message : "Couldn't regenerate.");
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    if (!confirm(`Delete "${group.name}"? This removes all matches and ratings.`)) return;
    setPending(true);
    try {
      await fetch(`/api/groups/${slug}`, { method: "DELETE" });
      router.push("/groups");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={save} className="space-y-4">
        <SectionTitle>Display</SectionTitle>
        <Field label="Group name" value={name} onChange={(e) => setName(e.target.value)} required />
        <Field label="Timezone" value={timezone} onChange={(e) => setTimezone(e.target.value)} placeholder="America/New_York" />
        <label className="flex items-center gap-2.5 text-[0.8125rem] font-medium">
          <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
          <span>Public — appears in discovery</span>
        </label>
        <ErrorBanner>{error}</ErrorBanner>
        <Button type="submit" disabled={pending}>
          {saved ? "Saved ✓" : pending ? "Saving…" : "Save changes"}
        </Button>
      </form>

      <section>
        <SectionTitle>Privacy</SectionTitle>
        <Card>
          <label className="flex items-center gap-2.5 text-[0.8125rem] font-medium">
            <input type="checkbox" checked={hidden} onChange={toggle} />
            <span>Hide my rating from other group members</span>
          </label>
          <p className="mt-1.5 text-[0.6875rem] text-muted-dim">
            You&apos;ll still see your own ratings. Spec §9.
          </p>
        </Card>
      </section>

      <section>
        <SectionTitle>Invite link</SectionTitle>
        <Card>
          <p className="mb-3 font-mono text-[1.0625rem] font-semibold tracking-wider">{inviteCode}</p>
          <Button variant="secondary" size="sm" onClick={regenerate} disabled={pending}>
            Regenerate code
          </Button>
        </Card>
      </section>

      {canDelete ? (
        <section>
          <SectionTitle>Danger zone</SectionTitle>
          <Card className="border-down/20">
            <p className="mb-3 text-[0.8125rem] text-muted">Removes all matches, participants, and ratings.</p>
            <Button variant="danger" size="sm" onClick={remove} disabled={pending}>
              Delete group
            </Button>
          </Card>
        </section>
      ) : null}
    </div>
  );
}