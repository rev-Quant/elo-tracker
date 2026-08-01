import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { GroupSettingsForm } from "@/components/group-settings-form";
import { PageTitle } from "@/components/ui";
import { getSession } from "@/lib/auth/session";
import { NotFoundError } from "@/lib/errors";
import { can } from "@/lib/permissions";
import { requireMembership } from "@/server/groups/service";

export const dynamic = "force-dynamic";

export default async function GroupSettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await getSession();
  if (!session) redirect("/");

  let membership;
  try {
    membership = await requireMembership(slug, session.userId);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }
  const { group, role } = membership;

  if (!can(role, "manage_group_settings")) {
    return (
      <main>
        <PageTitle>Settings</PageTitle>
        <p className="text-sm text-muted">Only group admins can change settings.</p>
        <Link href={`/g/${slug}`} className="mt-3 inline-block text-sm text-accent">
          Back to {group.name}
        </Link>
      </main>
    );
  }

  return (
    <main>
      <Link href={`/g/${slug}`} className="mb-3 inline-block text-sm text-muted hover:text-text">
        ← {group.name}
      </Link>
      <PageTitle>Group settings</PageTitle>
      <GroupSettingsForm
        slug={slug}
        group={{
          name: group.name,
          timezone: group.timezone,
          isPublic: group.isPublic,
          inviteCode: group.inviteCode,
        }}
        canDelete={can(role, "delete_group")}
      />
    </main>
  );
}
