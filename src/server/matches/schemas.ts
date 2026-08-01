import { z } from "zod";

/**
 * Match logging input. Spec §3 (UX) and §11 (POST /api/groups/:slug/matches).
 *
 * Phase 1 is competitive + casual FFA only; `teamMode` is accepted but
 * restricted to "ffa" so the wire format does not have to change in Phase 2.
 */

export const MAX_PARTICIPANTS = 32;

export const participantSchema = z.object({
  userId: z.uuid("Invalid player."),
  /**
   * 1 = winner. Repeat a value to express a tie. The server re-normalises
   * these into standard competition ranking, so gaps are tolerated.
   */
  rank: z.number().int().min(1, "Placement must be 1 or higher.").max(MAX_PARTICIPANTS),
});
export type ParticipantInput = z.infer<typeof participantSchema>;

export const logMatchSchema = z
  .object({
    gameId: z.uuid("Please choose a game."),

    matchType: z.enum(["casual", "competitive"]).default("competitive"),

    // Phase 1: FFA only. Team mode arrives in Phase 2 (spec §15).
    teamMode: z.literal("ffa").default("ffa"),

    participants: z
      .array(participantSchema)
      .min(2, "A match needs at least 2 players.")
      .max(MAX_PARTICIPANTS, `A match can have at most ${MAX_PARTICIPANTS} players.`),

    /** Recorder's local time, already converted to UTC by the client (spec §10). */
    playedAt: z.coerce.date().optional(),

    notes: z.string().trim().max(500, "Notes must be 500 characters or fewer.").optional(),

    /** Client-generated, de-duplicates retried submissions (spec §10). */
    idempotencyKey: z.uuid().optional(),
  })
  .superRefine((value, ctx) => {
    const seen = new Set<string>();
    for (const [i, p] of value.participants.entries()) {
      if (seen.has(p.userId)) {
        ctx.addIssue({
          code: "custom",
          path: ["participants", i, "userId"],
          message: "That player is listed twice.",
        });
      }
      seen.add(p.userId);
    }

    if (new Set(value.participants.map((p) => p.rank)).size < 2) {
      ctx.addIssue({
        code: "custom",
        path: ["participants"],
        message: "Every player has the same placement — there's no result to record.",
      });
    }

    if (value.playedAt && value.playedAt.getTime() > Date.now() + 5 * 60_000) {
      ctx.addIssue({
        code: "custom",
        path: ["playedAt"],
        message: "A match can't be played in the future.",
      });
    }
  });

export type LogMatchInput = z.infer<typeof logMatchSchema>;

export const matchHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
  gameId: z.uuid().optional(),
});
export type MatchHistoryQuery = z.infer<typeof matchHistoryQuerySchema>;
