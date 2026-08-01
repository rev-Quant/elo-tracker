import Link from "next/link";
import { redirect } from "next/navigation";
import { CreateGroupForm, JoinGroupForm } from "@/components/group-forms";
import { Card, EmptyState, PageTitle } from "@/components/ui";
import { getSession } from "@/lib/auth/session";
import { listForUser } from "@/server/groups/service";
import { requireUser } from "@/server/auth/service";

export const dynamic = "force-dynamic";

export default async function GroupsPage() {
  const session = await getSession();
  if (!session) redirect("/");
  const user = await requireUser(session.userId);

  const groups = await listForUser(user.id);

  return (
    <main>
      <PageTitle sub={`Signed in as ${user.displayName}`}>Your groups</PageTitle>

      {groups.length === 0 ? (
        <EmptyState
          title="No groups yet"
          body="Create one for your game nights, then share the invite code with everyone at the table."
        />
      ) : (
        <ul className="space-y-2">
          {groups.map(({ group, role }) => (
            <li key={group.id}>
              <Link
                href={`/g/${group.slug}`}
                className="flex items-center justify-between rounded-2xl border border-border bg-surface p-4 transition hover:border-muted"
              >
                <span className="font-medium">{group.name}</span>
                <span className="text-xs uppercase tracking-wide text-muted">{role}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 space-y-4">
        <CreateGroupForm />
        <Card>
          <JoinGroupForm />
        </Card>
      </div>
    </main>
  );
}
