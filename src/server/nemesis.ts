import { and, desc, eq, sql } from "drizzle-orm";
import { type Queryable, db as defaultDb } from "@/db";
import { currentRatings, matchParticipants, matches, users } from "@/db/schema";

/**
 * Finds the one person who is the closest-rated frequent opponent.
 * Used for the nemesis system and trophy card generation.
 */
export interface NemesisResult {
  opponentId: string;
  opponentName: string;
  opponentRating: number;
  myRating: number;
  myWins: number;
  myLosses: number;
  totalGames: number;
  gap: number;
  isNemesis: boolean;
}

export async function findNemesis(
  userId: string,
  groupId: string,
  db: Queryable = defaultDb,
): Promise<NemesisResult | null> {
  const h2h = await db
    .select({
      opponentId: sql<string>`them.user_id`,
      opponentName: users.displayName,
      myWins: sql<number>`count(*) filter (where me.final_rank < them.final_rank)::int`,
      myLosses: sql<number>`count(*) filter (where me.final_rank > them.final_rank)::int`,
      total: sql<number>`count(*)::int`,
    })
    .from(sql`match_participants me`)
    .innerJoin(sql`match_participants them`, sql`them.match_id = me.match_id and them.user_id <> me.user_id`)
    .innerJoin(sql`matches m`, sql`m.id = me.match_id and m.status = 'confirmed' and m.match_type = 'competitive'`)
    .innerJoin(users, eq(users.id, sql<string>`them.user_id`))
    .where(and(
      eq(sql<string>`me.user_id`, userId),
      eq(sql<string>`m.group_id`, groupId),
    ))
    .groupBy(sql`them.user_id`, users.displayName)
    .orderBy(desc(sql`count(*)`))
    .limit(20);

  if (h2h.length === 0) return null;

  // Pick the opponent with most games played
  const best = h2h[0];

  // Get ratings
  const myRating = await getAvgRating(userId, groupId, db);
  const oppRating = await getAvgRating(best.opponentId, groupId, db);

  return {
    opponentId: best.opponentId,
    opponentName: best.opponentName,
    opponentRating: oppRating ?? 1000,
    myRating: myRating ?? 1000,
    myWins: best.myWins,
    myLosses: best.myLosses,
    totalGames: best.total,
    gap: best.myWins - best.myLosses,
    isNemesis: best.myWins < best.myLosses,
  };
}

async function getAvgRating(userId: string, groupId: string, db: Queryable): Promise<number | null> {
  const rows = await db
    .select({ r: currentRatings.displayRating })
    .from(currentRatings)
    .where(and(
      eq(currentRatings.userId, userId),
      eq(currentRatings.groupId, groupId),
      eq(currentRatings.ratingPool, "competitive"),
    ));
  if (rows.length === 0) return null;
  return rows.reduce((a, r) => a + r.r, 0) / rows.length;
}

/**
 * Find the bottom-ranked player in a group — for "Relegation" badge.
 */
export async function findBottomPlayer(
  groupId: string,
  db: Queryable = defaultDb,
): Promise<{ userId: string; displayName: string; gamesPlayed: number } | null> {
  const rows = await db
    .select({
      userId: currentRatings.userId,
      displayName: users.displayName,
      avgRating: sql<number>`avg(${currentRatings.displayRating})::int`,
      gamesPlayed: sql<number>`sum(${currentRatings.gamesPlayed})::int`,
    })
    .from(currentRatings)
    .innerJoin(users, eq(users.id, currentRatings.userId))
    .where(and(
      eq(currentRatings.groupId, groupId),
      eq(currentRatings.ratingPool, "competitive"),
    ))
    .groupBy(currentRatings.userId, users.displayName)
    .orderBy(sql`avg(${currentRatings.displayRating}) asc`)
    .limit(1);

  if (rows.length === 0) return null;
  // Only consider players who have actually played at least 3 games
  if (rows[0].gamesPlayed < 3) return null;
  return rows[0];
}