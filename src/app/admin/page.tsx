import { sql, count, asc, desc } from "drizzle-orm";
import { db } from "@/db";
import { users, groups, matches, groupMembers, matchParticipants } from "@/db/schema";
import { Card, SectionTitle } from "@/components/ui";

export const dynamic = "force-dynamic";
export const revalidate = 60;

interface StatCardProps { label: string; value: string | number; sub?: string }

function StatCard({ label, value, sub }: StatCardProps) {
  return (
    <Card>
      <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-muted-dim">{label}</p>
      <p className="mt-1 text-[1.75rem] font-extrabold tabular-nums">{value}</p>
      {sub ? <p className="mt-0.5 text-[0.6875rem] text-muted-dim">{sub}</p> : null}
    </Card>
  );
}

export default async function AdminPage() {
  const [[{ totalUsers }], [{ totalGroups }], [{ totalMatches }], [{ totalGuests }], [{ registered }], [{ active24h }], [{ active7d }]] = await Promise.all([
    db.select({ totalUsers: count() }).from(users).where(sql`${users.deletedAt} is null`),
    db.select({ totalGroups: count() }).from(groups).where(sql`${groups.archivedAt} is null`),
    db.select({ totalMatches: count() }).from(matches).where(sql`${matches.status} = 'confirmed'`),
    db.select({ totalGuests: count() }).from(users).where(sql`${users.isGuest} = true and ${users.deletedAt} is null`),
    db.select({ registered: count() }).from(users).where(sql`${users.isGuest} = false and ${users.deletedAt} is null`),
    db.select({ active24h: count() }).from(matchParticipants).innerJoin(matches, sql`${matches.id} = ${matchParticipants.matchId}`).where(sql`${matches.playedAt} > now() - interval '24 hours'`),
    db.select({ active7d: count() }).from(matchParticipants).innerJoin(matches, sql`${matches.id} = ${matchParticipants.matchId}`).where(sql`${matches.playedAt} > now() - interval '7 days'`),
  ]);

  const signupsByDay = await db
    .select({ day: sql<string>`to_char(${users.createdAt}, 'Mon DD')`, count: count() })
    .from(users)
    .where(sql`${users.createdAt} > now() - interval '14 days' and ${users.deletedAt} is null`)
    .groupBy(sql`to_char(${users.createdAt}, 'YYYY-MM-DD'), to_char(${users.createdAt}, 'Mon DD')`)
    .orderBy(asc(sql`to_char(${users.createdAt}, 'YYYY-MM-DD')`));

  const matchesByDay = await db
    .select({ day: sql<string>`to_char(${matches.playedAt}, 'Mon DD')`, count: count() })
    .from(matches)
    .where(sql`${matches.playedAt} > now() - interval '14 days' and ${matches.status} = 'confirmed'`)
    .groupBy(sql`to_char(${matches.playedAt}, 'YYYY-MM-DD'), to_char(${matches.playedAt}, 'Mon DD')`)
    .orderBy(asc(sql`to_char(${matches.playedAt}, 'YYYY-MM-DD')`));

  const topGames = await db
    .select({
      name: sql<string>`g.name`,
      count: count(),
    })
    .from(matches)
    .innerJoin(sql`games g`, sql`g.id = ${matches.gameId}`)
    .where(sql`${matches.status} = 'confirmed'`)
    .groupBy(sql`g.name`)
    .orderBy(desc(count()))
    .limit(5);

  const topGroups = await db
    .select({
      name: groups.name,
      matchCount: count(matches.id),
      memberCount: count(sql`distinct ${groupMembers.userId}`),
    })
    .from(groups)
    .leftJoin(matches, sql`${matches.groupId} = ${groups.id} and ${matches.status} = 'confirmed'`)
    .leftJoin(groupMembers, sql`${groupMembers.groupId} = ${groups.id}`)
    .where(sql`${groups.archivedAt} is null`)
    .groupBy(groups.id, groups.name)
    .orderBy(desc(count(matches.id)))
    .limit(5);

  return (
    <main className="pt-4">
      <h1 className="mb-6 text-[1.65rem] font-bold tracking-[-0.02em]">Admin dashboard</h1>

      <div className="mb-6 grid grid-cols-2 gap-3">
        <StatCard label="Total users" value={totalUsers} sub={`${registered} registered · ${totalGuests} guests`} />
        <StatCard label="Total matches" value={totalMatches} />
        <StatCard label="Total groups" value={totalGroups} />
        <StatCard label="Active players" value={active7d} sub={`${active24h} in last 24h`} />
      </div>

      <SectionTitle>Signups (last 14 days)</SectionTitle>
      <Card noPadding className="mb-5">
        <div className="divide-y divide-border">
          {signupsByDay.map((r) => (
            <div key={r.day} className="flex justify-between px-4 py-2.5 text-[0.8125rem]">
              <span className="text-muted-dim">{r.day}</span>
              <span className="font-semibold tabular-nums">{r.count}</span>
            </div>
          ))}
          {signupsByDay.length === 0 ? <div className="px-4 py-4 text-[0.8125rem] text-muted">No signups this period.</div> : null}
        </div>
      </Card>

      <SectionTitle>Matches (last 14 days)</SectionTitle>
      <Card noPadding className="mb-5">
        <div className="divide-y divide-border">
          {matchesByDay.map((r) => (
            <div key={r.day} className="flex justify-between px-4 py-2.5 text-[0.8125rem]">
              <span className="text-muted-dim">{r.day}</span>
              <span className="font-semibold tabular-nums">{r.count}</span>
            </div>
          ))}
          {matchesByDay.length === 0 ? <div className="px-4 py-4 text-[0.8125rem] text-muted">No matches this period.</div> : null}
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-5">
        <div>
          <SectionTitle>Top games</SectionTitle>
          <Card noPadding>
            <div className="divide-y divide-border">
              {topGames.map((g, i) => (
                <div key={g.name} className="flex items-center gap-3 px-4 py-2.5 text-[0.8125rem]">
                  <span className="w-5 text-center font-semibold tabular-nums text-muted-dim">{i + 1}</span>
                  <span className="flex-1 truncate">{g.name}</span>
                  <span className="tabular-nums font-semibold">{g.count}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
        <div>
          <SectionTitle>Top groups</SectionTitle>
          <Card noPadding>
            <div className="divide-y divide-border">
              {topGroups.map((g, i) => (
                <div key={g.name} className="px-4 py-2.5 text-[0.8125rem]">
                  <div className="flex items-center gap-3">
                    <span className="w-5 text-center font-semibold tabular-nums text-muted-dim">{i + 1}</span>
                    <span className="truncate font-medium">{g.name}</span>
                  </div>
                  <div className="ml-8 mt-0.5 text-[0.6875rem] text-muted-dim">
                    {g.matchCount} matches · {g.memberCount} members
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <p className="mt-8 text-center text-[0.6875rem] text-muted-dim">
        Data refreshes every 60s. Built-in analytics — no third parties beyond Vercel.
      </p>
    </main>
  );
}