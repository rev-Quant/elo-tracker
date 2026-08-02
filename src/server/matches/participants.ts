import { and, eq, sql } from "drizzle-orm";
import { type Queryable, db as defaultDb } from "@/db";
import { matchParticipants, matches } from "@/db/schema";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import * as groupsService from "@/server/groups/service";
import type { UpdateParticipantInput } from "./participant-schemas";

/**
 * Rage-quit / left-excused attestation. Spec §4.
 *
 * Any participant in the match or a group admin can mark a player's departure
 * status. Does NOT change ratings retroactively (that's what void is for) —
 * it records the reason for the departure in the match record.
 */
export async function updateParticipantStatus(
  matchId: string,
  targetUserId: string,
  actorUserId: string,
  input: UpdateParticipantInput,
  db: Queryable = defaultDb,
) {
  const [match] = await db.select().from(matches).where(eq(matches.id, matchId)).limit(1);
  if (!match) throw new NotFoundError("Match not found.");
  if (match.status === "voided") throw new ValidationError("That match has been voided.");

  const role = await groupsService.roleOf(match.groupId, actorUserId, db);
  if (!role) throw new NotFoundError("Match not found.");

  // Any participant, or any admin, can attest.
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(matchParticipants)
    .where(
      and(
        eq(matchParticipants.matchId, matchId),
        eq(matchParticipants.userId, actorUserId),
      ),
    );
  if (count === 0 && role !== "owner" && role !== "admin") {
    throw new ForbiddenError("Only a participant or group admin can update a player's departure status.");
  }

  const [updated] = await db
    .update(matchParticipants)
    .set({
      status: input.status,
      leftAtMove: input.leftAtMove ?? null,
    })
    .where(
      and(
        eq(matchParticipants.matchId, matchId),
        eq(matchParticipants.userId, targetUserId),
      ),
    )
    .returning();

  if (!updated) throw new NotFoundError("That player isn't in this match.");

  return updated;
}