import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { type Queryable, db as defaultDb } from "@/db";
import { currentRatings, games, matches, ratingSnapshots, users } from "@/db/schema";

/** Leaderboard and group dashboard reads. Spec §5, §7. */

export interface LeaderboardEntry {
  rank: number;
  previousRank: number | null;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  isGuest: boolean;
  displayRating: number;
  gamesPlayed: number;
  wins: number;
  losses: number;
  lastPlayedAt: Date | null;
  /** Last 10 display ratings for sparkline mini-graphs. */
  recentRatings: number[];
}

/**
 * Standings for one game in one group, best first.
 *
 * Ties share a rank ("1224"), so two players on identical ratings are not
 * arbitrarily ordered against each other.
 */
export async function leaderboard(
  groupId: string,
  gameId: string,
  db: Queryable = defaultDb,
): Promise<LeaderboardEntry[]> {
  const rows = await db
    .select({
      userId: users.id,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
      isGuest: users.isGuest,
      displayRating: currentRatings.displayRating,
      gamesPlayed: currentRatings.gamesPlayed,
      wins: currentRatings.wins,
      losses: currentRatings.losses,
      lastPlayedAt: currentRatings.lastPlayedAt,
    })
    .from(currentRatings)
    .innerJoin(users, eq(users.id, currentRatings.userId))
    .where(
      and(
        eq(currentRatings.groupId, groupId),
        eq(currentRatings.gameId, gameId),
        eq(currentRatings.ratingPool, "competitive"),
      ),
    )
    .orderBy(desc(currentRatings.displayRating), users.displayName);

  let rank = 0;
  let previous: number | null = null;
  const entries = rows.map((row, index) => {
    if (previous === null || row.displayRating !== previous) rank = index + 1;
    previous = row.displayRating;
    return { rank, previousRank: null as number | null, recentRatings: [] as number[], ...row };
  });

  const userIds = entries.map((e) => e.userId);
  if (userIds.length > 0) {
    const prevSnapshots = await db
      .select({
        userId: ratingSnapshots.userId,
        prevRating: ratingSnapshots.displayAfter,
      })
      .from(ratingSnapshots)
      .where(
        and(
          eq(ratingSnapshots.groupId, groupId),
          eq(ratingSnapshots.gameId, gameId),
          eq(ratingSnapshots.ratingPool, "competitive"),
          sql`${ratingSnapshots.createdAt} <= now() - interval '7 days'`,
        ),
      )
      .orderBy(desc(ratingSnapshots.createdAt));

    const prevRatingMap = new Map<string, number>();
    for (const s of prevSnapshots) {
      if (!prevRatingMap.has(s.userId)) {
        prevRatingMap.set(s.userId, s.prevRating);
      }
    }

    if (prevRatingMap.size > 0) {
      const prevSorted = [...prevRatingMap.entries()]
        .sort((a, b) => b[1] - a[1]);

      let prevRank = 0;
      let prevVal: number | null = null;
      const prevRankMap = new Map<string, number>();
      prevSorted.forEach(([uid], i) => {
        const val = prevRatingMap.get(uid)!;
        if (prevVal === null || val !== prevVal) prevRank = i + 1;
        prevVal = val;
        prevRankMap.set(uid, prevRank);
      });

      for (const entry of entries) {
        const pr = prevRankMap.get(entry.userId);
        if (pr !== undefined) entry.previousRank = pr;
      }
    }
  }

  // Sparkline data: last 10 display ratings per player.
  const ratingsHistory = new Map<string, number[]>();
  if (userIds.length > 0) {
    const historyRows = await db
      .select({ userId: ratingSnapshots.userId, displayAfter: ratingSnapshots.displayAfter })
      .from(ratingSnapshots)
      .where(
        and(
          eq(ratingSnapshots.groupId, groupId),
          eq(ratingSnapshots.gameId, gameId),
          eq(ratingSnapshots.ratingPool, "competitive"),
          eq(ratingSnapshots.isReversal, false),
          inArray(ratingSnapshots.userId, userIds),
        ),
      )
      .orderBy(desc(ratingSnapshots.createdAt))
      .limit(userIds.length * 10);

    for (const r of historyRows) {
      const list = ratingsHistory.get(r.userId) ?? [];
      if (list.length < 10) list.unshift(r.displayAfter);
      ratingsHistory.set(r.userId, list);
    }
  }

  // Add the current rating as the final sparkline point.
  for (const entry of entries) {
    const list = ratingsHistory.get(entry.userId) ?? [entry.displayRating];
    if (list[list.length - 1] !== entry.displayRating) list.push(entry.displayRating);
    entry.recentRatings = list;
  }

  return entries;
}

export interface GroupGame {
  id: string;
  name: string;
  slug: string;
  matchCount: number;
  lastPlayedAt: Date | null;
}

/**
 * Games this group actually plays, most-played first.
 *
 * Drives the "default to the last game" behaviour the 15-second logging flow
 * depends on (spec §3).
 */
export async function gamesPlayedBy(groupId: string, db: Queryable = defaultDb): Promise<GroupGame[]> {
  return db
    .select({
      id: games.id,
      name: games.name,
      slug: games.slug,
      matchCount: sql<number>`count(${matches.id})::int`,
      lastPlayedAt: sql<Date | null>`max(${matches.playedAt})`,
    })
    .from(matches)
    .innerJoin(games, eq(games.id, matches.gameId))
    .where(and(eq(matches.groupId, groupId), eq(matches.status, "confirmed")))
    .groupBy(games.id, games.name, games.slug)
    .orderBy(desc(sql`count(${matches.id})`));
}

/** The most recent match in a group, used to pre-fill the log form (spec §3). */
export async function lastMatch(groupId: string, db: Queryable = defaultDb) {
  const [row] = await db
    .select()
    .from(matches)
    .where(and(eq(matches.groupId, groupId), eq(matches.status, "confirmed")))
    .orderBy(desc(matches.playedAt))
    .limit(1);
  return row ?? null;
}

/**
 * Whole days since the group last played, or null if it never has.
 *
 * Computed in SQL rather than from `Date.now()` in a component: reading the
 * clock during render is impure, and this keeps "how stale is this group"
 * anchored to the database's clock rather than the renderer's.
 */
export async function daysSinceLastMatch(
  groupId: string,
  db: Queryable = defaultDb,
): Promise<number | null> {
  const [row] = await db
    .select({
      days: sql<
        number | null
      >`floor(extract(epoch from (now() - max(${matches.playedAt}))) / 86400)::int`,
    })
    .from(matches)
    .where(and(eq(matches.groupId, groupId), eq(matches.status, "confirmed")));

  return row?.days ?? null;
}
