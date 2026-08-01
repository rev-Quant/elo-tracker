import { and, desc, eq, sql } from "drizzle-orm";
import { type Queryable, db as defaultDb } from "@/db";
import { currentRatings, matchParticipants, matches, ratingSnapshots } from "@/db/schema";
import { ConflictError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { can } from "@/lib/permissions";
import * as groupsService from "@/server/groups/service";
import { type LoggedMatch, buildLoggedMatch } from "./service";

/**
 * Undo and dispute, unified. Spec §3 (60s undo toast) and §4/§11 (disputes).
 *
 * SIMPLIFIED FROM SPEC: rather than a separate `disputed` status with its own
 * multi-party review, a dispute IS a void performed by someone with the
 * `void_matches` permission. Both paths reverse ratings identically — the
 * only difference is who is allowed to trigger it and when:
 *
 *   - any PARTICIPANT, within 60 seconds of logging  → self-serve undo
 *   - anyone with `void_matches` (admin/owner)        → any time
 *
 * This reuses the rating_snapshots audit trail instead of adding new
 * "disputed" bookkeeping, and gives admins the moderation lever spec §14.5
 * calls for without a second confirmation workflow.
 */

export const UNDO_WINDOW_MS = 60_000;

export async function voidMatch(
  matchId: string,
  actorUserId: string,
  db: Queryable = defaultDb,
): Promise<LoggedMatch> {
  return db.transaction(async (tx) => {
    const [match] = await tx.select().from(matches).where(eq(matches.id, matchId)).limit(1);
    if (!match) throw new NotFoundError("That match doesn't exist.");
    if (match.status === "voided") throw new ConflictError("That match has already been voided.");

    const role = await groupsService.roleOf(match.groupId, actorUserId, tx);
    if (!role) throw new NotFoundError("That match doesn't exist.");

    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${match.groupId}))`);

    const participants = await tx
      .select({ userId: matchParticipants.userId, finalRank: matchParticipants.finalRank })
      .from(matchParticipants)
      .where(eq(matchParticipants.matchId, matchId));

    const isParticipant = participants.some((p) => p.userId === actorUserId);
    const withinUndoWindow = Date.now() - match.createdAt.getTime() <= UNDO_WINDOW_MS;
    const allowed = (isParticipant && withinUndoWindow) || can(role, "void_matches");
    if (!allowed) {
      throw new ForbiddenError(
        "Only the players involved (within 60 seconds) or a group admin can void a match.",
      );
    }

    if (match.ratingsApplied) {
      const pool = match.matchType === "competitive" ? "competitive" : "casual";
      for (const p of participants) {
        const [snapshot] = await tx
          .select()
          .from(ratingSnapshots)
          .where(and(eq(ratingSnapshots.matchId, matchId), eq(ratingSnapshots.userId, p.userId)))
          .limit(1);
        if (!snapshot) continue;

        // Voiding must not corrupt a chain of later matches: this snapshot has
        // to still be the player's most recent for this game and pool.
        //
        // Compared by ordering inside Postgres rather than by passing
        // snapshot.createdAt back as a bound parameter. postgres.js and PGlite
        // bind a JS Date to timestamptz differently, and the round-trip could
        // shift the value by the client's UTC offset — which made a snapshot
        // look newer than itself. Ordering server-side sidesteps the
        // serialisation question entirely.
        const [latest] = await tx
          .select({ matchId: ratingSnapshots.matchId })
          .from(ratingSnapshots)
          .where(
            and(
              eq(ratingSnapshots.userId, p.userId),
              eq(ratingSnapshots.gameId, snapshot.gameId),
              eq(ratingSnapshots.groupId, snapshot.groupId),
              eq(ratingSnapshots.ratingPool, pool),
            ),
          )
          .orderBy(desc(ratingSnapshots.createdAt))
          .limit(1);

        if (latest && latest.matchId !== matchId) {
          throw new ConflictError(
            "Can't void this match — a more recent match already used the ratings it produced.",
          );
        }

        const isWin = p.finalRank === 1;
        const [current] = await tx
          .select()
          .from(currentRatings)
          .where(
            and(
              eq(currentRatings.userId, p.userId),
              eq(currentRatings.gameId, snapshot.gameId),
              eq(currentRatings.groupId, snapshot.groupId),
              eq(currentRatings.ratingPool, pool),
            ),
          )
          .limit(1);

        if (current) {
          if (current.gamesPlayed <= 1) {
            await tx.delete(currentRatings).where(
              and(
                eq(currentRatings.userId, p.userId),
                eq(currentRatings.gameId, snapshot.gameId),
                eq(currentRatings.groupId, snapshot.groupId),
                eq(currentRatings.ratingPool, pool),
              ),
            );
          } else {
            await tx
              .update(currentRatings)
              .set({
                mu: snapshot.muBefore,
                sigma: snapshot.sigmaBefore,
                displayRating: snapshot.displayBefore,
                gamesPlayed: current.gamesPlayed - 1,
                wins: current.wins - (isWin ? 1 : 0),
                losses: current.losses - (isWin ? 0 : 1),
              })
              .where(
                and(
                  eq(currentRatings.userId, p.userId),
                  eq(currentRatings.gameId, snapshot.gameId),
                  eq(currentRatings.groupId, snapshot.groupId),
                  eq(currentRatings.ratingPool, pool),
                ),
              );
          }
        }

        await tx.insert(ratingSnapshots).values({
          userId: p.userId,
          gameId: snapshot.gameId,
          groupId: snapshot.groupId,
          ratingPool: pool,
          matchId,
          muBefore: snapshot.muAfter,
          muAfter: snapshot.muBefore,
          sigmaBefore: snapshot.sigmaAfter,
          sigmaAfter: snapshot.sigmaBefore,
          displayBefore: snapshot.displayAfter,
          displayAfter: snapshot.displayBefore,
          delta: -snapshot.delta,
          isReversal: true,
        });
      }
    }

    const [voided] = await tx
      .update(matches)
      .set({ status: "voided", ratingsApplied: false })
      .where(eq(matches.id, matchId))
      .returning();

    return buildLoggedMatch(voided, tx);
  });
}
