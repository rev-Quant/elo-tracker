import Link from "next/link";
import { redirect } from "next/navigation";
import { CreateGroupForm, JoinGroupForm } from "@/components/group-forms";
import { Card, EmptyState, PageTitle, SectionTitle } from "@/components/ui";
import { LogoutButton } from "@/components/logout-button";
import { NotificationBanner } from "@/components/push-subscribe";
import { getSession } from "@/lib/auth/session";
import { listForUser } from "@/server/groups/service";
import { requireUser } from "@/server/auth/service";
import { db } from "@/db";
import { groupMembers } from "@/db/schema";
import { countDistinct, inArray } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function GroupsPage() {
  const session = await getSession();
  if (!session) redirect("/");
  const user = await requireUser(session.userId);
  const groups = await listForUser(user.id);

  let totalPlayers = 0;
  if (groups.length > 0) {
    const [row] = await db
      .select({ n: countDistinct(groupMembers.userId) })
      .from(groupMembers)
      .where(inArray(groupMembers.groupId, groups.map(({ group }) => group.id)));
    totalPlayers = row?.n ?? 0;
  }

  return (
    <main>
      <div className="flex items-center justify-between mb-4">
        <p className="text-[0.75rem] text-muted-dim">Signed in as {user.displayName}</p>
        <LogoutButton />
      </div>

      <NotificationBanner />

      <PageTitle sub="Your groups">Game tracker</PageTitle>

      {groups.length > 0 ? (
        <Card className="mb-6 grid grid-cols-2 gap-4 text-center">
          <div>
            <p className="text-[1.5rem] font-extrabold tabular-nums tracking-[-0.02em]">{groups.length}</p>
            <p className="text-[0.6875rem] font-medium uppercase tracking-[0.1em] text-muted-dim">Groups</p>
          </div>
          <div>
            <p className="text-[1.5rem] font-extrabold tabular-nums tracking-[-0.02em]">{totalPlayers}</p>
            <p className="text-[0.6875rem] font-medium uppercase tracking-[0.1em] text-muted-dim">Players</p>
          </div>
        </Card>
      ) : null}

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