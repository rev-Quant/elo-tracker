"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Card, ErrorBanner, Field } from "@/components/ui";
import { ApiRequestError, api } from "@/lib/api-client";

interface Props {
  slug: string;
  group: { name: string; timezone: string; isPublic: boolean; inviteCode: string };
  canDelete: boolean;
}

/** Group customization: rename, timezone, discoverability, invite rotation. Spec §6. */
export function GroupSettingsForm({ slug, group, canDelete }: Props) {
  const router = useRouter();
  const [name, setName] = useState(group.name);
  const [isPublic, setIsPublic] = useState(group.isPublic);
  const [timezone, setTimezone] = useState(group.timezone);
  const [inviteCode, setInviteCode] = useState(group.inviteCode);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
      setError(err instanceof ApiRequestError ? err.detail.message : "Couldn't save those changes.");
    } finally {
      setPending(false);
    }
  }

  async function regenerate() {
    if (!confirm("Regenerate the invite code? The old link will stop working.")) return;
    setPending(true);
    setError(null);
    try {
      const { inviteCode: next } = await api.post<{ inviteCode: string }>(`/api/groups/${slug}/invite`);
      setInviteCode(next);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.detail.message : "Couldn't regenerate the code.");
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    if (!confirm(`Delete "${group.name}"? This removes every match and rating in it. This cannot be undone.`)) {
      return;
    }
    setPending(true);
    try {
      await fetch(`/api/groups/${slug}`, { method: "DELETE" });
      router.push("/groups");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-5">
      <form onSubmit={save} className="space-y-3">
        <Field label="Group name" value={name} onChange={(e) => setName(e.target.value)} required />
        <Field
          label="Timezone (IANA, e.g. America/New_York)"
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
        />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
          Public — appears in discovery
        </label>
        <ErrorBanner>{error}</ErrorBanner>
        <Button type="submit" disabled={pending}>
          {saved ? "Saved" : pending ? "Saving…" : "Save changes"}
        </Button>
      </form>

      <Card>
        <p className="mb-2 text-xs uppercase tracking-wide text-muted">Invite code</p>
        <p className="mb-3 font-mono text-lg">{inviteCode}</p>
        <Button variant="secondary" onClick={regenerate} disabled={pending}>
          Regenerate code
        </Button>
      </Card>

      {canDelete ? (
        <Card className="border-down/30">
          <p className="mb-3 text-sm text-muted">Deleting a group removes all its matches and ratings.</p>
          <Button
            variant="secondary"
            onClick={remove}
            disabled={pending}
            className="border-down/50 text-down"
          >
            Delete group
          </Button>
        </Card>
      ) : null}
    </div>
  );
}
