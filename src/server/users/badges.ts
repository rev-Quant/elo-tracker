import { aliasedTable, and, desc, eq, sql } from "drizzle-orm";
import { type Queryable, db as defaultDb } from "@/db";
import { currentRatings, matchParticipants, matches } from "@/db/schema";

/**
 * Achievement badges. Spec §5 — "awarded silently, no push notification".
 *
 * Computed on read rather than persisted: with no cron/queue in this build,
 * a stored-badge table would need a write on every match just to stay in
 * sync, for a feature that's purely decorative. Recomputing at profile-read
 * time is a few cheap indexed queries and can never drift.
 *
 * NOT IMPLEMENTED: "Comeback Kid" (needs raw_score, which no seeded game uses).
 */

export interface Badge {
  id: string;
  emoji: string;
  label: string;
}

const CATALOG: Record<string, Omit<Badge, "id">> = {
  first_win: { emoji: "🏆", label: "First Win" },
  streak_5: { emoji: "🔥", label: "Streak: 5" },
  streak_10: { emoji: "🔥", label: "Streak: 10" },
  giant_slayer: { emoji: "🎯", label: "Giant Slayer" },
  iron_man: { emoji: "💪", label: "Iron Man" },
  century: { emoji: "💯", label: "Century" },
  perfect_week: { emoji: "📅", label: "Perfect Week" },
};

export async function computeBadges(
  userId: string,
  groupId: string,
  db: Queryable = defaultDb,
): Promise<Badge[]> {
  const earned = new Set<string>();

  const ratingRows = await db
    .select({ gamesPlayed: currentRatings.gamesPlayed, wins: currentRatings.wins })
    .from(currentRatings)
    .where(
      and(
        eq(currentRatings.userId, userId),
        eq(currentRatings.groupId, groupId),
        eq(currentRatings.ratingPool, "competitive"),
      ),
    );

  if (ratingRows.some((r) => r.wins >= 1)) earned.add("first_win");
  if (ratingRows.some((r) => r.gamesPlayed >= 50)) earned.add("iron_man");
  if (ratingRows.reduce((sum, r) => sum + r.gamesPlayed, 0) >= 100) earned.add("century");

  // Current win streak, across every game in the group, most recent first.
  const recent = await db
    .select({ finalRank: matchParticipants.finalRank })
    .from(matchParticipants)
    .innerJoin(matches, eq(matches.id, matchParticipants.matchId))
    .where(
      and(
        eq(matchParticipants.userId, userId),
        eq(matches.groupId, groupId),
        eq(matches.matchType, "competitive"),
        eq(matches.status, "confirmed"),
      ),
    )
    .orderBy(desc(matches.playedAt))
    .limit(20);
  let streak = 0;
  for (const r of recent) {
    if (r.finalRank !== 1) break;
    streak += 1;
  }
  if (streak >= 10) earned.add("streak_10");
  else if (streak >= 5) earned.add("streak_5");

  // Giant Slayer: won a match where a co-participant outranked them by 200+
  // display points beforehand. Self-join, same pattern as head-to-head.
  const me = aliasedTable(matchParticipants, "me");
  const them = aliasedTable(matchParticipants, "them");
  const [slain] = await db
    .select({ n: sql<number>`1` })
    .from(me)
    .innerJoin(them, and(eq(them.matchId, me.matchId), sql`${them.userId} <> ${me.userId}`))
    .innerJoin(matches, eq(matches.id, me.matchId))
    .where(
      and(
        eq(me.userId, userId),
        eq(matches.groupId, groupId),
        eq(matches.matchType, "competitive"),
        sql`${me.finalRank} = 1`,
        sql`${them.ratingBefore} - ${me.ratingBefore} >= 200`,
      ),
    )
    .limit(1);
  if (slain) earned.add("giant_slayer");

  // Perfect Week: logged at least 1 game on each of the last 7 distinct calendar days
  const [perfectWeek] = await db
    .select({ n: sql<number>`count(distinct to_char(${matches.playedAt} at time zone 'UTC', 'YYYY-MM-DD'))::int` })
    .from(matchParticipants)
    .innerJoin(matches, eq(matches.id, matchParticipants.matchId))
    .where(
      and(
        eq(matchParticipants.userId, userId),
        eq(matches.groupId, groupId),
        eq(matches.status, "confirmed"),
        sql`${matches.playedAt} >= now() - interval '7 days'`,
      ),
    );
  if (perfectWeek && perfectWeek.n >= 7) earned.add("perfect_week");

  return [...earned].map((id) => ({ id, ...CATALOG[id] }));
}

export { CATALOG as BADGE_CATALOG };
