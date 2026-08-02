import { and, eq, sql, desc } from "drizzle-orm";
import { type Queryable, db as defaultDb } from "@/db";
import { matchReactions, currentRatings, users } from "@/db/schema";
import { ConflictError } from "@/lib/errors";

/** Toggle a reaction on a match. Returns all reactions for the match. */
export async function toggleReaction(matchId: string, userId: string, emoji: string, db: Queryable = defaultDb) {
  const [existing] = await db
    .select()
    .from(matchReactions)
    .where(and(eq(matchReactions.matchId, matchId), eq(matchReactions.userId, userId), eq(matchReactions.emoji, emoji)))
    .limit(1);

  if (existing) {
    await db.delete(matchReactions).where(eq(matchReactions.id, existing.id));
  } else {
    await db.insert(matchReactions).values({ matchId, userId, emoji });
  }

  return getReactions(matchId, db);
}

export async function getReactions(matchId: string, db: Queryable = defaultDb) {
  return db
    .select({
      emoji: matchReactions.emoji,
      userId: matchReactions.userId,
      count: sql<number>`count(*)::int`,
    })
    .from(matchReactions)
    .where(eq(matchReactions.matchId, matchId))
    .groupBy(matchReactions.emoji, matchReactions.userId);
}

/** Global leaderboard — only users who opted in. */
export async function globalLeaderboard(db: Queryable = defaultDb) {
  return db
    .select({
      userId: users.id,
      displayName: users.displayName,
      avgRating: sql<number>`avg(${currentRatings.displayRating})::int`,
      gamesPlayed: sql<number>`sum(${currentRatings.gamesPlayed})::int`,
      gameCount: sql<number>`count(distinct ${currentRatings.gameId})::int`,
    })
    .from(currentRatings)
    .innerJoin(users, eq(users.id, currentRatings.userId))
    .where(and(
      eq(users.showOnGlobalLeaderboard, true),
      eq(currentRatings.ratingPool, "competitive"),
    ))
    .groupBy(users.id, users.displayName)
    .orderBy(desc(sql`avg(${currentRatings.displayRating})`))
    .limit(100);
}