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
  try { membership = await requireMembership(slug, session.userId); }
  catch (err) { if (err instanceof NotFoundError) notFound(); throw err; }
  const { group, role } = membership;

  return (
    <main>
      <Link href={`/g/${slug}`} className="mb-4 inline-flex items-center gap-1 text-[0.8125rem] font-medium text-muted hover:text-text">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M7.5 2.5 4 6l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        {group.name}
      </Link>
      <PageTitle>Settings</PageTitle>
      {!can(role, "manage_group_settings") ? (
        <p className="text-sm text-muted">Only group admins can change settings.</p>
      ) : (
        <GroupSettingsForm slug={slug} group={{ name: group.name, timezone: group.timezone, isPublic: group.isPublic, inviteCode: group.inviteCode }} canDelete={can(role, "delete_group")} />
      )}
    </main>
  );
}