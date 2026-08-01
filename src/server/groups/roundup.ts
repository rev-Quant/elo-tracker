import { aliasedTable, and, desc, eq, gte, sql } from "drizzle-orm";
import { type Queryable, db as defaultDb } from "@/db";
import { groupMembers, matchParticipants, matches, ratingSnapshots, users } from "@/db/schema";

/**
 * Weekly roundup. Spec §5 — computed on read rather than a scheduled job.
 *
 * A real cron/email digest needs infra this build doesn't have (a queue, a
 * mail provider). This gives the same content live at `/g/:slug/roundup`,
 * which is strictly more useful for a first release since it works the
 * moment it's opened rather than waiting for Sunday.
 *
 * NOT IMPLEMENTED: "Hottest Streak" and per-rank movement arrows — both need
 * a start-of-week rating snapshot per player, which is a second scheduled
 * job's worth of bookkeeping for a feature that's cosmetic. Flagged rather
 * than faked.
 */

export interface Roundup {
  since: Date;
  totalMatches: number;
  mostWins: { userId: string; displayName: string; wins: number; losses: number } | null;
  biggestGain: { userId: string; displayName: string; delta: number; newRating: number } | null;
  biggestUpset: { winnerId: string; winnerName: string; loserId: string; loserName: string; gap: number } | null;
  quiet: { userId: string; displayName: string }[];
}

export async function roundup(
  groupId: string,
  db: Queryable = defaultDb,
  days = 7,
): Promise<Roundup> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [{ count: totalMatches }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(matches)
    .where(and(eq(matches.groupId, groupId), eq(matches.status, "confirmed"), gte(matches.playedAt, since)));

  const wins = await db
    .select({
      userId: matchParticipants.userId,
      displayName: users.displayName,
      wins: sql<number>`count(*) filter (where ${matchParticipants.finalRank} = 1)::int`,
      losses: sql<number>`count(*) filter (where ${matchParticipants.finalRank} <> 1)::int`,
    })
    .from(matchParticipants)
    .innerJoin(matches, eq(matches.id, matchParticipants.matchId))
    .innerJoin(users, eq(users.id, matchParticipants.userId))
    .where(and(eq(matches.groupId, groupId), eq(matches.status, "confirmed"), gte(matches.playedAt, since)))
    .groupBy(matchParticipants.userId, users.displayName)
    .orderBy(desc(sql`count(*) filter (where ${matchParticipants.finalRank} = 1)`))
    .limit(1);

  const gains = await db
    .select({
      userId: ratingSnapshots.userId,
      displayName: users.displayName,
      delta: ratingSnapshots.delta,
      newRating: ratingSnapshots.displayAfter,
    })
    .from(ratingSnapshots)
    .innerJoin(users, eq(users.id, ratingSnapshots.userId))
    .where(
      and(
        eq(ratingSnapshots.groupId, groupId),
        eq(ratingSnapshots.isReversal, false),
        gte(ratingSnapshots.createdAt, since),
      ),
    )
    .orderBy(desc(ratingSnapshots.delta))
    .limit(1);

  // Biggest upset: a win where the opponent was rated 200+ higher before the match.
  const me = aliasedTable(matchParticipants, "me");
  const them = aliasedTable(matchParticipants, "them");
  const meUser = aliasedTable(users, "meUser");
  const themUser = aliasedTable(users, "themUser");
  const upsets = await db
    .select({
      winnerId: me.userId,
      winnerName: meUser.displayName,
      loserId: them.userId,
      loserName: themUser.displayName,
      gap: sql<number>`${them.ratingBefore} - ${me.ratingBefore}`,
    })
    .from(me)
    .innerJoin(them, and(eq(them.matchId, me.matchId), sql`${them.userId} <> ${me.userId}`))
    .innerJoin(matches, eq(matches.id, me.matchId))
    .innerJoin(meUser, eq(meUser.id, me.userId))
    .innerJoin(themUser, eq(themUser.id, them.userId))
    .where(
      and(
        eq(matches.groupId, groupId),
        eq(matches.status, "confirmed"),
        gte(matches.playedAt, since),
        sql`${me.finalRank} = 1`,
        sql`${them.ratingBefore} - ${me.ratingBefore} >= 200`,
      ),
    )
    .orderBy(desc(sql`${them.ratingBefore} - ${me.ratingBefore}`))
    .limit(1);

  // Members with zero matches this week — the "be the spark" nudge (spec §5).
  const active = await db
    .select({ userId: matchParticipants.userId })
    .from(matchParticipants)
    .innerJoin(matches, eq(matches.id, matchParticipants.matchId))
    .where(and(eq(matches.groupId, groupId), eq(matches.status, "confirmed"), gte(matches.playedAt, since)));
  const activeIds = new Set(active.map((a) => a.userId));

  const members = await db
    .select({ userId: groupMembers.userId, displayName: users.displayName })
    .from(groupMembers)
    .innerJoin(users, eq(users.id, groupMembers.userId))
    .where(eq(groupMembers.groupId, groupId));
  const quiet = members.filter((m) => !activeIds.has(m.userId));

  return {
    since,
    totalMatches,
    mostWins: wins[0] ?? null,
    biggestGain: gains[0] ? { ...gains[0], delta: Math.round(gains[0].delta) } : null,
    biggestUpset: upsets[0] ? { ...upsets[0], gap: Math.round(upsets[0].gap) } : null,
    quiet,
  };
}
