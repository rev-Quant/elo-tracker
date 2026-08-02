import { and, desc, eq, gte, sql } from "drizzle-orm";
import { type Queryable, db as defaultDb } from "@/db";
import { games, matchParticipants, matches, users } from "@/db/schema";

/**
 * In-app activity feed. Spec §8 — computed from existing tables rather than
 * persisted, avoiding a notification table that would need writes on every
 * match to stay in sync.
 *
 * Push notifications (Web Push API) need a service worker, VAPID keys and
 * opt-in UI — deferred to v2.
 */

export interface ActivityItem {
  id: string;
  type: "match_logged" | "streak" | "roundup";
  message: string;
  at: Date;
}

/** Recent activity across every group a user belongs to. */
export async function feed(
  userId: string,
  groupIds: string[],
  options: { limit?: number; since?: Date } = {},
  db: Queryable = defaultDb,
): Promise<ActivityItem[]> {
  if (groupIds.length === 0) return [];

  const limit = options.limit ?? 20;

  // Matches logged recently in the user's groups where they participated.
  const recentMatches = await db
    .select({
      id: matches.id,
      playedAt: matches.playedAt,
      gameName: games.name,
      displayName: users.displayName,
      finalRank: matchParticipants.finalRank,
    })
    .from(matches)
    .innerJoin(matchParticipants, and(
      eq(matchParticipants.matchId, matches.id),
      eq(matchParticipants.userId, userId),
    ))
    .innerJoin(users, eq(users.id, matches.recordedBy))
    .innerJoin(games, eq(games.id, matches.gameId))
    .where(
      and(
        eq(matches.status, "confirmed"),
        options.since ? gte(matches.playedAt, options.since) : undefined,
        groupIds.length === 1 ? eq(matches.groupId, groupIds[0]) : sql`${matches.groupId} = ANY(${groupIds})`,
      ),
    )
    .orderBy(desc(matches.playedAt))
    .limit(limit);

  const items: ActivityItem[] = [];

  for (const m of recentMatches) {
    const placement = m.finalRank === 1 ? "won" : `placed ${m.finalRank}`;
    items.push({
      id: m.id,
      type: "match_logged",
      message: `${m.displayName} logged ${m.gameName} — you ${placement}`,
      at: m.playedAt,
    });
  }

  return items;
}

/**
 * Consecutive days with at least one match. "You've logged a game 4 days
 * in a row" — the spec §5 streak mechanic.
 */
export async function currentStreak(
  userId: string,
  groupId: string,
  db: Queryable = defaultDb,
): Promise<number> {
  const dates = await db
    .select({ day: sql<string>`to_char(${matches.playedAt} at time zone 'UTC', 'YYYY-MM-DD')` })
    .from(matchParticipants)
    .innerJoin(matches, eq(matches.id, matchParticipants.matchId))
    .where(
      and(
        eq(matchParticipants.userId, userId),
        eq(matches.groupId, groupId),
        eq(matches.status, "confirmed"),
      ),
    )
    .groupBy(sql`to_char(${matches.playedAt} at time zone 'UTC', 'YYYY-MM-DD')`)
    .orderBy(desc(sql`to_char(${matches.playedAt} at time zone 'UTC', 'YYYY-MM-DD')`));

  if (dates.length === 0) return 0;

  let streak = 1;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  // The most recent day must be today or yesterday for the streak to be live.
  const latest = new Date(dates[0].day + "T00:00:00Z");
  if (latest.getTime() < today.getTime() - 24 * 60 * 60 * 1000) return 0;

  for (let i = 1; i < dates.length; i += 1) {
    const current = new Date(dates[i].day + "T00:00:00Z");
    const previous = new Date(dates[i - 1].day + "T00:00:00Z");
    if (previous.getTime() - current.getTime() <= 24 * 60 * 60 * 1000 + 1000) {
      streak += 1;
    } else {
      break;
    }
  }

  return streak;
}