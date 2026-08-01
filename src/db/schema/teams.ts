/**
 * Persistent teams. Spec §2 note 3 and §13.
 *
 * These tables exist so the v2 feature does not require a migration, but
 * NOTHING in Phase 1-3 reads or writes them. The OpenSkill engine always
 * operates on individuals; a persistent team's displayed rating is just the
 * average of its members' display ratings (spec §1).
 */
import { sql } from "drizzle-orm";
import {
  check,
  doublePrecision,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { games } from "./games";
import { groups } from "./groups";
import { users } from "./users";

export const teams = pgTable(
  "teams",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("teams_group_idx").on(t.groupId)],
);

export const teamMembers = pgTable(
  "team_members",
  {
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
    /** NULL = still a member. */
    leftAt: timestamp("left_at", { withTimezone: true }),
  },
  (t) => [
    primaryKey({ columns: [t.teamId, t.userId] }),
    check("team_members_left_after_joined", sql`${t.leftAt} is null or ${t.leftAt} >= ${t.joinedAt}`),
  ],
);

export const teamRatings = pgTable(
  "team_ratings",
  {
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id),
    mu: doublePrecision("mu").notNull(),
    sigma: doublePrecision("sigma").notNull(),
    displayRating: doublePrecision("display_rating").notNull(),
    gamesPlayed: integer("games_played").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.teamId, t.gameId] })],
);
