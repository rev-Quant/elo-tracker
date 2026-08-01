import { and, desc, eq, inArray, lt } from "drizzle-orm";
import { type Queryable, db as defaultDb } from "@/db";
import { games, matchParticipants, matches, users } from "@/db/schema";
import { NotFoundError } from "@/lib/errors";

/** Match history reads. Spec §11. */

export interface MatchSummary {
  id: string;
  playedAt: Date;
  matchType: "casual" | "competitive";
  status: "pending" | "confirmed" | "disputed" | "voided";
  notes: string | null;
  game: { id: string; name: string; slug: string };
  participants: {
    userId: string;
    displayName: string;
    finalRank: number | null;
    ratingDelta: number | null;
  }[];
}

export interface MatchPage {
  matches: MatchSummary[];
  /** ISO timestamp to pass back as `cursor` for the next page, or null at the end. */
  nextCursor: string | null;
}

/**
 * Paginated group history, newest first.
 *
 * Keyset pagination on `played_at` rather than OFFSET, so inserting a match
 * while someone is paging does not shift rows across page boundaries.
 */
export async function history(
  groupId: string,
  options: { limit?: number; cursor?: string; gameId?: string } = {},
  db: Queryable = defaultDb,
): Promise<MatchPage> {
  const limit = options.limit ?? 20;

  const conditions = [eq(matches.groupId, groupId)];
  if (options.cursor) conditions.push(lt(matches.playedAt, new Date(options.cursor)));
  if (options.gameId) conditions.push(eq(matches.gameId, options.gameId));

  const rows = await db
    .select({
      id: matches.id,
      playedAt: matches.playedAt,
      matchType: matches.matchType,
      status: matches.status,
      notes: matches.notes,
      gameId: games.id,
      gameName: games.name,
      gameSlug: games.slug,
    })
    .from(matches)
    .innerJoin(games, eq(games.id, matches.gameId))
    .where(and(...conditions))
    .orderBy(desc(matches.playedAt))
    // Over-fetch by one to detect whether another page exists.
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  if (page.length === 0) return { matches: [], nextCursor: null };

  const byMatch = await participantsFor(
    page.map((r) => r.id),
    db,
  );

  return {
    matches: page.map((r) => ({
      id: r.id,
      playedAt: r.playedAt,
      matchType: r.matchType,
      status: r.status,
      notes: r.notes,
      game: { id: r.gameId, name: r.gameName, slug: r.gameSlug },
      participants: byMatch.get(r.id) ?? [],
    })),
    nextCursor: hasMore ? page[page.length - 1].playedAt.toISOString() : null,
  };
}

/** One round-trip for every participant across a page of matches. */
async function participantsFor(matchIds: string[], db: Queryable) {
  const rows = await db
    .select({
      matchId: matchParticipants.matchId,
      userId: matchParticipants.userId,
      displayName: users.displayName,
      finalRank: matchParticipants.finalRank,
      ratingDelta: matchParticipants.ratingDelta,
    })
    .from(matchParticipants)
    .innerJoin(users, eq(users.id, matchParticipants.userId))
    .where(inArray(matchParticipants.matchId, matchIds))
    .orderBy(matchParticipants.finalRank);

  const map = new Map<string, MatchSummary["participants"]>();
  for (const { matchId, ...rest } of rows) {
    const list = map.get(matchId) ?? [];
    list.push(rest);
    map.set(matchId, list);
  }
  return map;
}

export async function detail(matchId: string, db: Queryable = defaultDb): Promise<MatchSummary> {
  const [row] = await db
    .select({
      id: matches.id,
      playedAt: matches.playedAt,
      matchType: matches.matchType,
      status: matches.status,
      notes: matches.notes,
      groupId: matches.groupId,
      gameId: games.id,
      gameName: games.name,
      gameSlug: games.slug,
    })
    .from(matches)
    .innerJoin(games, eq(games.id, matches.gameId))
    .where(eq(matches.id, matchId))
    .limit(1);

  if (!row) throw new NotFoundError("That match doesn't exist.");

  const byMatch = await participantsFor([row.id], db);
  return {
    id: row.id,
    playedAt: row.playedAt,
    matchType: row.matchType,
    status: row.status,
    notes: row.notes,
    game: { id: row.gameId, name: row.gameName, slug: row.gameSlug },
    participants: byMatch.get(row.id) ?? [],
  };
}

/** The group a match belongs to, for authorising a read. */
export async function groupIdOf(matchId: string, db: Queryable = defaultDb): Promise<string> {
  const [row] = await db
    .select({ groupId: matches.groupId })
    .from(matches)
    .where(eq(matches.id, matchId))
    .limit(1);
  if (!row) throw new NotFoundError("That match doesn't exist.");
  return row.groupId;
}
