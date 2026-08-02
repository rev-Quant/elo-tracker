import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { matchStatusEnum, matchTypeEnum, participantStatusEnum, teamModeEnum } from "./enums";
import { games } from "./games";
import { groups, seasons } from "./groups";
import { users } from "./users";

/** Matches — the core event. Spec §2. */
export const matches = pgTable(
  "matches",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),

    /** v2. Always NULL in Phase 1. */
    seasonId: uuid("season_id").references(() => seasons.id, { onDelete: "set null" }),

    matchType: matchTypeEnum("match_type").notNull().default("competitive"),
    teamMode: teamModeEnum("team_mode").notNull(),

    /** NULL for FFA, >= 2 for team mode. Enforced by check constraint below. */
    numTeams: integer("num_teams"),

    recordedBy: uuid("recorded_by")
      .notNull()
      .references(() => users.id),

    playedAt: timestamp("played_at", { withTimezone: true }).notNull().defaultNow(),
    durationSeconds: integer("duration_seconds"),
    notes: text("notes"),
    /** Base64-encoded photo attachment (spec v2). */
    photoUrl: text("photo_url"),

    status: matchStatusEnum("status").notNull().default("pending"),

    /**
     * True once this match's rating deltas have been applied to
     * `current_ratings`. Decoupled from `status` because (per the agreed
     * deviation from spec §3) Phase 1 applies ratings immediately at log time
     * rather than waiting for a confirmation quorum. Voiding a match flips
     * this back to false after the deltas are reversed.
     */
    ratingsApplied: boolean("ratings_applied").notNull().default(false),

    /** Client-generated key that de-duplicates retried submissions (spec §10). */
    idempotencyKey: uuid("idempotency_key"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    /** Referenced by spec §10 for client sync but missing from the spec's DDL. */
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("matches_group_played_at_idx").on(t.groupId, t.playedAt.desc()),
    index("matches_group_game_idx").on(t.groupId, t.gameId),
    index("matches_status_idx").on(t.status),

    // Idempotency is scoped per group; NULLs are ignored by the unique index.
    uniqueIndex("matches_group_idempotency_unique")
      .on(t.groupId, t.idempotencyKey)
      .where(sql`${t.idempotencyKey} is not null`),

    // NOTE the explicit `num_teams is not null`. Without it, a 'teams' row with
    // a NULL num_teams makes the second branch evaluate to NULL, and a CHECK
    // constraint only rejects on FALSE — never on NULL. The invalid row would
    // be accepted. Covered by src/db/schema.integration.test.ts.
    check(
      "matches_num_teams_matches_mode",
      sql`(${t.teamMode} = 'ffa' and ${t.numTeams} is null) or (${t.teamMode} = 'teams' and ${t.numTeams} is not null and ${t.numTeams} >= 2)`,
    ),
    check(
      "matches_duration_positive",
      sql`${t.durationSeconds} is null or ${t.durationSeconds} > 0`,
    ),
  ],
);

/** Ad-hoc teams within a single match. Empty for `team_mode = 'ffa'`. Spec §2. */
export const matchTeams = pgTable(
  "match_teams",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    matchId: uuid("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    /** Stable 0-based ordering for display. */
    teamIndex: integer("team_index").notNull(),
    teamName: text("team_name"),
    /** 1 = winner. Ties allowed by repeating a value. */
    resultRank: integer("result_rank"),
  },
  (t) => [
    uniqueIndex("match_teams_match_index_unique").on(t.matchId, t.teamIndex),
    check("match_teams_index_non_negative", sql`${t.teamIndex} >= 0`),
    check("match_teams_rank_positive", sql`${t.resultRank} is null or ${t.resultRank} >= 1`),
  ],
);

/**
 * Participants. Spec §2.
 *
 * SPEC DEVIATION (agreed): `guest_name` and the `user_or_guest` CHECK are gone.
 * Every participant is a real `users` row; unregistered players are users with
 * `is_guest = true`. See src/db/schema/users.ts for the rationale.
 *
 * SPEC CLARIFICATION: the spec's pseudocode mixes OpenSkill `ordinal()` (0-50)
 * with `rating_before` when computing a delta. Here all three rating_* columns
 * hold the DISPLAY rating (~850-1850), which is what the UI renders. The raw
 * mu/sigma live in `rating_snapshots`.
 */
export const matchParticipants = pgTable(
  "match_participants",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    matchId: uuid("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),

    /** NULL in FFA. */
    matchTeamId: uuid("match_team_id").references(() => matchTeams.id, { onDelete: "set null" }),

    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),

    /** Position among all players, 1 = winner. Ties repeat a value. */
    finalRank: integer("final_rank"),

    /** Only used by games whose ranking_mode needs a score. Unused in v1. */
    rawScore: integer("raw_score"),

    ratingBefore: doublePrecision("rating_before"),
    ratingAfter: doublePrecision("rating_after"),
    ratingDelta: doublePrecision("rating_delta"),

    status: participantStatusEnum("status").notNull().default("active"),
    leftAtMove: integer("left_at_move"),
  },
  (t) => [
    // A player appears at most once per match.
    uniqueIndex("match_participants_match_user_unique").on(t.matchId, t.userId),
    index("match_participants_user_idx").on(t.userId),
    index("match_participants_team_idx").on(t.matchTeamId),

    check("match_participants_rank_positive", sql`${t.finalRank} is null or ${t.finalRank} >= 1`),
    check(
      "match_participants_left_at_move_requires_departure",
      sql`${t.leftAtMove} is null or ${t.status} <> 'active'`,
    ),
  ],
);

/** Confirmations for competitive matches. Spec §3. Wired up in Phase 2. */
export const matchConfirmations = pgTable(
  "match_confirmations",
  {
    matchId: uuid("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.matchId, t.userId] })],
);

export type Match = typeof matches.$inferSelect;
export type NewMatch = typeof matches.$inferInsert;
export type MatchTeam = typeof matchTeams.$inferSelect;
export type MatchParticipant = typeof matchParticipants.$inferSelect;
export type NewMatchParticipant = typeof matchParticipants.$inferInsert;
