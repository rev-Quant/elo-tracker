import { and, desc, eq, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { matchParticipants, matches, ratingSnapshots } from "@/db/schema";
import { handler, json } from "@/lib/http";
import { listForUser } from "@/server/groups/service";
import { currentUser } from "@/server/current-user";

/** Spec §10: GDPR-friendly JSON dump of all matches + rating history. */
export const GET = handler(async () => {
  const user = await currentUser();
  const groups = await listForUser(user.id);
  const groupIds = groups.map((g) => g.group.id);
  if (groupIds.length === 0) return json({ matches: [], ratings: [] });

  const matchHistory = await db
    .select({
      matchId: matches.id,
      gameId: matches.gameId,
      groupId: matches.groupId,
      finalRank: matchParticipants.finalRank,
      ratingDelta: matchParticipants.ratingDelta,
      playedAt: matches.playedAt,
      matchType: matches.matchType,
    })
    .from(matchParticipants)
    .innerJoin(matches, eq(matches.id, matchParticipants.matchId))
    .where(
      and(
        eq(matchParticipants.userId, user.id),
        sql`${matches.groupId} = ANY(${groupIds})`,
      ),
    )
    .orderBy(desc(matches.playedAt));

  const ratingHistory = await db
    .select({
      gameId: ratingSnapshots.gameId,
      groupId: ratingSnapshots.groupId,
      displayBefore: ratingSnapshots.displayBefore,
      displayAfter: ratingSnapshots.displayAfter,
      delta: ratingSnapshots.delta,
      createdAt: ratingSnapshots.createdAt,
    })
    .from(ratingSnapshots)
    .where(
      and(
        eq(ratingSnapshots.userId, user.id),
        or(...groupIds.map((id) => eq(ratingSnapshots.groupId, id))),
        eq(ratingSnapshots.isReversal, false),
      ),
    )
    .orderBy(desc(ratingSnapshots.createdAt));

  return json({
    user: { id: user.id, displayName: user.displayName },
    exportedAt: new Date().toISOString(),
    matchHistory,
    ratingHistory,
  });
});