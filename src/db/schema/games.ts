import { sql } from "drizzle-orm";
import { boolean, check, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { rankingModeEnum } from "./enums";
import { users } from "./users";

/**
 * Game catalog. Spec §2 / §12.
 *
 * Pre-seeded with the eight games in spec §12; users may add their own, which
 * default to `supports_ffa = true, ranking_mode = 'full'`.
 */
export const games = pgTable(
  "games",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),

    minPlayers: integer("min_players").notNull().default(2),
    maxPlayers: integer("max_players"),

    supportsTeams: boolean("supports_teams").notNull().default(false),
    supportsFfa: boolean("supports_ffa").notNull().default(true),

    rankingMode: rankingModeEnum("ranking_mode").notNull().default("full"),

    iconUrl: text("icon_url"),

    /**
     * NULL for the built-in catalog; set for user-submitted games so we can
     * attribute and moderate them. Not in the spec's DDL, but a custom game
     * with no owner is unmoderatable.
     */
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("games_min_players_at_least_2", sql`${t.minPlayers} >= 2`),
    check("games_max_gte_min", sql`${t.maxPlayers} is null or ${t.maxPlayers} >= ${t.minPlayers}`),
    // A game nobody can play in any mode is a data-entry bug.
    check("games_supports_a_mode", sql`${t.supportsTeams} or ${t.supportsFfa}`),
    check("games_slug_format", sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
  ],
);

export type Game = typeof games.$inferSelect;
export type NewGame = typeof games.$inferInsert;
