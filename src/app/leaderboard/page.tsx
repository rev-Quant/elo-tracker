import Link from "next/link";
import { db } from "@/db";
import { users } from "@/db/schema";
import { and, eq, sql, desc } from "drizzle-orm";
import { currentRatings } from "@/db/schema";
import { Card, PageTitle, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function GlobalLeaderboardPage() {
  const board = await db
    .select({
      userId: users.id,
      displayName: users.displayName,
      avgRating: sql<number>`avg(${currentRatings.displayRating})::int`,
      gamesPlayed: sql<number>`sum(${currentRatings.gamesPlayed})::int`,
      gameCount: sql<number>`count(distinct ${currentRatings.gameId})::int`,
    })
    .from(currentRatings)
    .innerJoin(users, eq(users.id, currentRatings.userId))
    .where(and(eq(users.showOnGlobalLeaderboard, true), eq(currentRatings.ratingPool, "competitive")))
    .groupBy(users.id, users.displayName)
    .orderBy(desc(sql`avg(${currentRatings.displayRating})`))
    .limit(50);

  return (
    <main>
      <div className="mb-4 flex items-center justify-between">
        <PageTitle sub="Players who opted in to the public leaderboard">Global rankings</PageTitle>
        <Link href="/" className="shrink-0 text-xs font-medium text-muted hover:text-text">Home</Link>
      </div>

      {board.length === 0 ? (
        <EmptyState icon="🌍" title="No one on the board yet" body="Enable 'Show on global leaderboard' in your group settings to appear here." />
      ) : (
        <Card noPadding>
          <ul className="divide-y divide-border">
            {board.map((entry, i) => (
              <li key={entry.userId} className="flex items-center gap-3 px-4 py-3">
                <span className="w-6 shrink-0 text-center text-xs font-bold tabular-nums text-muted-dim">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{entry.displayName}</p>
                  <p className="text-[0.625rem] text-muted-dim">{entry.gamesPlayed} games · {entry.gameCount} types</p>
                </div>
                <span className="tabular-nums font-bold">{entry.avgRating}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </main>
  );
}