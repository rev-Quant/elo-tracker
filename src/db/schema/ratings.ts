import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  pgTable,
  primaryKey,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { ratingPoolEnum } from "./enums";
import { games } from "./games";
import { groups } from "./groups";
import { matches } from "./matches";
import { users } from "./users";

/**
 * Materialised current rating per (user, game, group, pool). Spec §2.
 *
 * SPEC DEVIATION (agreed): `group_id` is NOT NULL.
 *
 * The spec declares PRIMARY KEY (user_id, game_id, group_id, rating_pool) with
 * a nullable group_id meaning "global rating". That does not work in Postgres:
 * NULLs compare as distinct in unique constraints, so a user could accumulate
 * unlimited duplicate global rows. Since nothing in Phase 1-3 reads a global
 * rating, global ratings are dropped from v1. When the opt-in cross-group
 * leaderboard lands (spec §13, v2), add a separate `global_ratings` table
 * rather than re-introducing a nullable PK column.
 */
export const currentRatings = pgTable(
  "current_ratings",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    ratingPool: ratingPoolEnum("rating_pool").notNull().default("competitive"),

    mu: doublePrecision("mu").notNull(),
    sigma: doublePrecision("sigma").notNull(),

    /** Cache of 1000 + (mu - Z*sigma) * 40. Derived; mu/sigma are the truth. */
    displayRating: doublePrecision("display_rating").notNull(),

    /** Counts every match in this pool, including casual ones (spec §11). */
    gamesPlayed: integer("games_played").notNull().default(0),
    wins: integer("wins").notNull().default(0),
    losses: integer("losses").notNull().default(0),

    lastPlayedAt: timestamp("last_played_at", { withTimezone: true }),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.gameId, t.groupId, t.ratingPool] }),

    // The leaderboard query: one game, one group, ordered by rating.
    index("current_ratings_leaderboard_idx").on(
      t.groupId,
      t.gameId,
      t.ratingPool,
      t.displayRating.desc(),
    ),

    check("current_ratings_sigma_positive", sql`${t.sigma} > 0`),
    check("current_ratings_counts_non_negative", sql`${t.gamesPlayed} >= 0 and ${t.wins} >= 0 and ${t.losses} >= 0`),
  ],
);

/**
 * Immutable audit trail of every rating change. Spec §2.4.
 *
 * One row per (participant, confirmed competitive match). Never updated.
 * Voiding a match writes a compensating row rather than deleting history.
 */
export const ratingSnapshots = pgTable(
  "rating_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    ratingPool: ratingPoolEnum("rating_pool").notNull().default("competitive"),

    matchId: uuid("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),

    muBefore: doublePrecision("mu_before").notNull(),
    muAfter: doublePrecision("mu_after").notNull(),
    sigmaBefore: doublePrecision("sigma_before").notNull(),
    sigmaAfter: doublePrecision("sigma_after").notNull(),
    displayBefore: doublePrecision("display_before").notNull(),
    displayAfter: doublePrecision("display_after").notNull(),
    delta: doublePrecision("delta").notNull(),

    /**
     * False for the reversal rows written when a match is voided, so the
     * rating history chart can distinguish a real result from an undo.
     */
    isReversal: boolean("is_reversal").notNull().default(false),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("rating_snapshots_user_game_group_idx").on(t.userId, t.gameId, t.groupId, t.createdAt.desc()),
    index("rating_snapshots_match_idx").on(t.matchId),
  ],
);

export type CurrentRating = typeof currentRatings.$inferSelect;
export type NewCurrentRating = typeof currentRatings.$inferInsert;
export type RatingSnapshot = typeof ratingSnapshots.$inferSelect;
export type NewRatingSnapshot = typeof ratingSnapshots.$inferInsert;
