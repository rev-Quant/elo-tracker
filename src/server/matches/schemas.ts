import { z } from "zod";

/** Match logging input. Spec §3 (UX) and §11. Phase 2 adds team matches. */

export const MAX_PARTICIPANTS = 32;
export const MAX_TEAMS = 8;

export const participantSchema = z.object({
  userId: z.uuid("Invalid player."),
  /** 1 = winner. Repeat a value for a tie; the server re-normalises ranks. */
  rank: z.number().int().min(1, "Placement must be 1 or higher.").max(MAX_PARTICIPANTS),
});
export type ParticipantInput = z.infer<typeof participantSchema>;

export const teamSchema = z.object({
  name: z.string().trim().max(40).optional(),
  rank: z.number().int().min(1).max(MAX_TEAMS),
  userIds: z.array(z.uuid()).min(1, "A team needs at least one player."),
});
export type TeamInput = z.infer<typeof teamSchema>;

const commonFields = {
  gameId: z.uuid("Please choose a game."),
  matchType: z.enum(["casual", "competitive"]).default("competitive"),
  playedAt: z.coerce.date().optional(),
  notes: z.string().trim().max(500, "Notes must be 500 characters or fewer.").optional(),
  idempotencyKey: z.uuid().optional(),
};

export const logMatchSchema = z
  .object({
    ...commonFields,
    teamMode: z.enum(["ffa", "teams"]).default("ffa"),
    participants: z
      .array(participantSchema)
      .max(MAX_PARTICIPANTS, `A match can have at most ${MAX_PARTICIPANTS} players.`)
      .optional(),
    teams: z.array(teamSchema).max(MAX_TEAMS, `A match can have at most ${MAX_TEAMS} teams.`).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.playedAt && value.playedAt.getTime() > Date.now() + 5 * 60_000) {
      ctx.addIssue({ code: "custom", path: ["playedAt"], message: "A match can't be played in the future." });
    }

    if (value.teamMode === "ffa") {
      const participants = value.participants ?? [];
      if (participants.length < 2) {
        ctx.addIssue({ code: "custom", path: ["participants"], message: "A match needs at least 2 players." });
        return;
      }
      const seen = new Set<string>();
      for (const [i, p] of participants.entries()) {
        if (seen.has(p.userId)) {
          ctx.addIssue({ code: "custom", path: ["participants", i, "userId"], message: "That player is listed twice." });
        }
        seen.add(p.userId);
      }
      if (new Set(participants.map((p) => p.rank)).size < 2) {
        ctx.addIssue({
          code: "custom",
          path: ["participants"],
          message: "Every player has the same placement — there's no result to record.",
        });
      }
    } else {
      const teams = value.teams ?? [];
      if (teams.length < 2) {
        ctx.addIssue({ code: "custom", path: ["teams"], message: "A team match needs at least 2 teams." });
        return;
      }
      const seen = new Set<string>();
      for (const [i, t] of teams.entries()) {
        for (const userId of t.userIds) {
          if (seen.has(userId)) {
            ctx.addIssue({ code: "custom", path: ["teams", i, "userIds"], message: "A player can only be on one team." });
          }
          seen.add(userId);
        }
      }
      if (new Set(teams.map((t) => t.rank)).size < 2) {
        ctx.addIssue({
          code: "custom",
          path: ["teams"],
          message: "Every team has the same placement — there's no result to record.",
        });
      }
    }
  });

export type LogMatchInput = z.infer<typeof logMatchSchema>;

export const matchHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
  gameId: z.uuid().optional(),
});
export type MatchHistoryQuery = z.infer<typeof matchHistoryQuerySchema>;
