import { sql } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/db";
import { groups } from "@/db/schema";
import { PageTitle, Card, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";
export const revalidate = 300;

export default async function DiscoverPage() {
  const publicGroups = await db
    .select({
      id: groups.id,
      name: groups.name,
      slug: groups.slug,
      createdAt: groups.createdAt,
      memberCount: sql<number>`(select count(*) from group_members where group_id = ${groups.id})::int`,
      matchCount: sql<number>`(select count(*) from matches where group_id = ${groups.id} and status = 'confirmed')::int`,
    })
    .from(groups)
    .where(sql`${groups.isPublic} = true and ${groups.archivedAt} is null`)
    .orderBy(sql`(select count(*) from matches where group_id = ${groups.id} and status = 'confirmed') desc`)
    .limit(50);

  return (
    <main>
      <PageTitle sub="Public groups anyone can browse">Discover</PageTitle>

      {publicGroups.length === 0 ? (
        <EmptyState icon="🔍" title="No public groups yet" body="Be the first to make your group public in settings." />
      ) : (
        <div className="space-y-2">
          {publicGroups.map((g) => (
            <Link key={g.id} href={`/g/${g.slug}`} className="block">
              <Card>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[0.9375rem] font-semibold">{g.name}</p>
                    <p className="mt-0.5 text-[0.75rem] text-muted-dim">
                      {g.memberCount} members · {g.matchCount} matches
                    </p>
                  </div>
                  <span className="shrink-0 text-[0.75rem] font-medium text-accent">View →</span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <footer className="mt-10 text-center text-[0.6875rem] text-muted-dim space-x-4">
        <Link href="/" className="hover:text-text">Home</Link>
        <Link href="/terms" className="hover:text-text">Terms</Link>
        <Link href="/privacy" className="hover:text-text">Privacy</Link>
      </footer>
    </main>
  );
}