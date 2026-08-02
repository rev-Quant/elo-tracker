import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { games } from "./games";
import { groups } from "./groups";
import { users } from "./users";

/** Rating Shields — prevents rating loss from a single match. Spec §7. */
export const ratingShields = pgTable(
  "rating_shields",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    used: boolean("used").notNull().default(false),
    earnedAt: timestamp("earned_at", { withTimezone: true }).notNull().defaultNow(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    matchId: uuid("match_id"),
  },
  (t) => [index("rating_shields_user_group_idx").on(t.userId, t.groupId)],
);

/** Gauntlets — best-of-N async challenges. Spec §6. */
export const gauntlets = pgTable(
  "gauntlets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    challengerId: uuid("challenger_id")
      .notNull()
      .references(() => users.id),
    opponentId: uuid("opponent_id")
      .notNull()
      .references(() => users.id),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id),
    bestOf: integer("best_of").notNull().default(3),
    status: text("status").notNull().default("active"),
    challengerWins: integer("challenger_wins").notNull().default(0),
    opponentWins: integer("opponent_wins").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [index("gauntlets_status_idx").on(t.status)],
);

/**
 * Schema additions for Phase 3 features.
 * Run: npx tsx --env-file=.env.local scripts/run-migration.ts
 */