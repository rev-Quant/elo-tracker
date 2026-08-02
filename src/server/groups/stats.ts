import { and, count, desc, eq, max, min, sql } from "drizzle-orm";
import { type Queryable, db as defaultDb } from "@/db";
import { games, groupMembers, matchParticipants, matches } from "@/db/schema";

export interface GroupStats {
  totalMatches: number;
  totalPlayers: number;
  mostPlayedGame: string | null;
  firstMatchDate: Date | null;
  newestMember: Date | null;
}

export async function groupStats(
  groupId: string,
  db: Queryable = defaultDb,
): Promise<GroupStats> {
  const [matchCount] = await db
    .select({ n: count() })
    .from(matches)
    .where(and(eq(matches.groupId, groupId), eq(matches.status, "confirmed")));

  const [playerCount] = await db
    .select({ n: sql<number>`count(distinct ${matchParticipants.userId})::int` })
    .from(matchParticipants)
    .innerJoin(matches, eq(matches.id, matchParticipants.matchId))
    .where(and(eq(matches.groupId, groupId), eq(matches.status, "confirmed")));

  const [topGame] = await db
    .select({ name: games.name })
    .from(matches)
    .innerJoin(games, eq(games.id, matches.gameId))
    .where(and(eq(matches.groupId, groupId), eq(matches.status, "confirmed")))
    .groupBy(games.id, games.name)
    .orderBy(desc(count()))
    .limit(1);

  const [first] = await db
    .select({ d: min(matches.playedAt) })
    .from(matches)
    .where(and(eq(matches.groupId, groupId), eq(matches.status, "confirmed")));

  const [latestMember] = await db
    .select({ d: max(groupMembers.joinedAt) })
    .from(groupMembers)
    .where(eq(groupMembers.groupId, groupId));

  return {
    totalMatches: matchCount?.n ?? 0,
    totalPlayers: playerCount?.n ?? 0,
    mostPlayedGame: topGame?.name ?? null,
    firstMatchDate: first?.d ?? null,
    newestMember: latestMember?.d ?? null,
  };
}
