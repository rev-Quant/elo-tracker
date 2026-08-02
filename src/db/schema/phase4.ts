import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { matches } from "./matches";
import { users } from "./users";

/** Emoji reactions on matches. Spec: "quick one-click reactions on logged match items." */
export const matchReactions = pgTable(
  "match_reactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    matchId: uuid("match_id").notNull().references(() => matches.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    emoji: text("emoji").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("match_reactions_match_idx").on(t.matchId),
  ],
);