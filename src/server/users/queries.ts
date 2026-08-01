import { aliasedTable, and, desc, eq, ne, sql } from "drizzle-orm";
import { type Queryable, db as defaultDb } from "@/db";
import { currentRatings, games, matchParticipants, matches, users } from "@/db/schema";
import { NotFoundError } from "@/lib/errors";
import { type Badge, computeBadges } from "./badges";

/** Profile page reads. Spec §7. */

export interface GameBreakdown {
  gameId: string;
  gameName: string;
  gameSlug: string;
  displayRating: number;
  gamesPlayed: number;
  wins: number;
  losses: number;
  /** 1-based position among everyone rated for this game in this group. */
  rank: number;
  outOf: number;
}

export interface RecentMatch {
  matchId: string;
  playedAt: Date;
  gameName: string;
  finalRank: number | null;
  won: boolean;
  ratingDelta: number | null;
}

export interface HeadToHead {
  opponentId: string;
  opponentName: string;
  wins: number;
  losses: number;
  total: number;
}

export interface Profile {
  user: { id: string; displayName: string; avatarUrl: string | null; isGuest: boolean };
  games: GameBreakdown[];
  recentMatches: RecentMatch[];
  /** Worst record against (spec §7 "Nemesis"). */
  nemesis: HeadToHead | null;
  /** Best record against (spec §7 "Prey"). */
  prey: HeadToHead | null;
  badges: Badge[];
}

export async function profile(
  userId: string,
  groupId: string,
  db: Queryable = defaultDb,
): Promise<Profile> {
  const [user] = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
      isGuest: users.isGuest,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) throw new NotFoundError("That player doesn't exist.");

  const [gameStats, recentMatches, h2h, badges] = await Promise.all([
    breakdown(userId, groupId, db),
    recent(userId, groupId, db),
    headToHead(userId, groupId, db),
    computeBadges(userId, groupId, db),
  ]);

  // Only opponents actually faced more than once are interesting enough to
  // label; a single loss should not crown someone your nemesis.
  const meaningful = h2h.filter((r) => r.total >= 2);
  const byMargin = [...meaningful].sort((a, b) => a.wins - a.losses - (b.wins - b.losses));

  return {
    user,
    games: gameStats,
    recentMatches,
    nemesis: byMargin.length > 0 && byMargin[0].losses > byMargin[0].wins ? byMargin[0] : null,
    prey:
      byMargin.length > 0 && byMargin[byMargin.length - 1].wins > byMargin[byMargin.length - 1].losses
        ? byMargin[byMargin.length - 1]
        : null,
    badges,
  };
}

/**
 * Per-game rating, record and standing.
 *
 * Selects the whole group, not just this player: the window functions must see
 * the full field to compute rank and size. Narrowing happens in JS afterwards,
 * because a WHERE on user_id would change what the window ranks over.
 */
async function breakdown(
  userId: string,
  groupId: string,
  db: Queryable,
): Promise<GameBreakdown[]> {
  const rows = await db
    .select({
      userId: currentRatings.userId,
      gameId: currentRatings.gameId,
      gameName: games.name,
      gameSlug: games.slug,
      displayRating: currentRatings.displayRating,
      gamesPlayed: currentRatings.gamesPlayed,
      wins: currentRatings.wins,
      losses: currentRatings.losses,
      rank: sql<number>`rank() over (partition by ${currentRatings.gameId} order by ${currentRatings.displayRating} desc)::int`,
      outOf: sql<number>`count(*) over (partition by ${currentRatings.gameId})::int`,
    })
    .from(currentRatings)
    .innerJoin(games, eq(games.id, currentRatings.gameId))
    .where(and(eq(currentRatings.groupId, groupId), eq(currentRatings.ratingPool, "competitive")))
    .orderBy(desc(currentRatings.displayRating));

  return rows
    .filter((r) => r.userId === userId)
    .map((r) => ({
      gameId: r.gameId,
      gameName: r.gameName,
      gameSlug: r.gameSlug,
      displayRating: r.displayRating,
      gamesPlayed: r.gamesPlayed,
      wins: r.wins,
      losses: r.losses,
      rank: r.rank,
      outOf: r.outOf,
    }));
}

async function recent(userId: string, groupId: string, db: Queryable): Promise<RecentMatch[]> {
  const rows = await db
    .select({
      matchId: matches.id,
      playedAt: matches.playedAt,
      gameName: games.name,
      finalRank: matchParticipants.finalRank,
      ratingDelta: matchParticipants.ratingDelta,
    })
    .from(matchParticipants)
    .innerJoin(matches, eq(matches.id, matchParticipants.matchId))
    .innerJoin(games, eq(games.id, matches.gameId))
    .where(and(eq(matchParticipants.userId, userId), eq(matches.groupId, groupId)))
    .orderBy(desc(matches.playedAt))
    .limit(10);

  return rows.map((r) => ({ ...r, won: r.finalRank === 1 }));
}

/**
 * Lifetime record against every opponent in this group. Spec §5, §7.
 *
 * Self-joins participants on the same match and compares placements. Ties
 * count for neither side.
 */
async function headToHead(
  userId: string,
  groupId: string,
  db: Queryable,
): Promise<HeadToHead[]> {
  const me = aliasedTable(matchParticipants, "me");
  const them = aliasedTable(matchParticipants, "them");

  return db
    .select({
      opponentId: them.userId,
      opponentName: users.displayName,
      wins: sql<number>`count(*) filter (where ${me.finalRank} < ${them.finalRank})::int`,
      losses: sql<number>`count(*) filter (where ${me.finalRank} > ${them.finalRank})::int`,
      total: sql<number>`count(*)::int`,
    })
    .from(me)
    .innerJoin(them, and(eq(them.matchId, me.matchId), ne(them.userId, me.userId)))
    .innerJoin(matches, eq(matches.id, me.matchId))
    .innerJoin(users, eq(users.id, them.userId))
    .where(
      and(
        eq(me.userId, userId),
        eq(matches.groupId, groupId),
        eq(matches.matchType, "competitive"),
        eq(matches.status, "confirmed"),
      ),
    )
    .groupBy(them.userId, users.displayName);
}
