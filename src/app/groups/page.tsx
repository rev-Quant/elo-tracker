import Link from "next/link";
import { redirect } from "next/navigation";
import { CreateGroupForm, JoinGroupForm } from "@/components/group-forms";
import { Card, EmptyState, PageTitle, SectionTitle } from "@/components/ui";
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
      <PageTitle sub="Your groups">Game tracker</PageTitle>

      {groups.length === 0 ? (
        <EmptyState
          icon="🎲"
          title="No groups yet"
          body="Create one for your game nights, then share the invite code with everyone at the table."
          action={<CreateGroupForm />}
        />
      ) : (
        <>
          <SectionTitle>Your groups</SectionTitle>
          <ul className="space-y-2">
            {groups.map(({ group, role }) => (
              <li key={group.id}>
                <Link
                  href={`/g/${group.slug}`}
                  className="card-hover flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-4"
                >
                  <div>
                    <p className="text-[0.9375rem] font-semibold leading-snug">{group.name}</p>
                    <p className="mt-0.5 text-[0.75rem] text-muted-dim">
                      {role === "owner" ? "Owner" : role === "admin" ? "Admin" : role === "spectator" ? "Spectator" : "Member"}
                    </p>
                  </div>
                  <span className="shrink-0 text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-muted-dim">
                    {role}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="mt-5 space-y-4">
        {groups.length > 0 ? (
          <Card>
            <CreateGroupForm />
          </Card>
        ) : null}
        <Card>
          <JoinGroupForm />
        </Card>
      </div>
    </main>
  );
}