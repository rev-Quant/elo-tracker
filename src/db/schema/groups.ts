import { sql } from "drizzle-orm";
import { boolean, check, index, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { groupRoleEnum } from "./enums";
import { users } from "./users";

/** Groups — the core social unit. Spec §2 / §6. */
export const groups = pgTable(
  "groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),

    /** Short shareable code behind /join/<code>. Regenerable (spec §6). */
    inviteCode: text("invite_code").notNull().unique(),

    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),

    /** Appears in public discovery (spec §6). */
    isPublic: boolean("is_public").notNull().default(false),

    /**
     * Group-local timezone, used to decide week boundaries for the weekly
     * roundup (spec §10 "Time Zones"). Defaults to the creator's zone.
     */
    timezone: text("timezone").notNull().default("UTC"),

    /** Set when a group is archived after 180 days of inactivity (spec §10). */
    archivedAt: timestamp("archived_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("groups_name_not_blank", sql`length(btrim(${t.name})) > 0`),
    check("groups_slug_format", sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
  ],
);

/** Group membership + role. Permission matrix lives in src/lib/permissions.ts. */
export const groupMembers = pgTable(
  "group_members",
  {
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: groupRoleEnum("role").notNull().default("member"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.groupId, t.userId] }),
    // Leaderboard and member-list reads are always "all groups for a user".
    index("group_members_user_idx").on(t.userId),
  ],
);

/**
 * Seasons. Spec §2.6 — schema exists in v1, the feature ships in v2.
 * Nothing in Phase 1 reads or writes this table.
 */
export const seasons = pgTable(
  "seasons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    isActive: boolean("is_active").notNull().default(true),
  },
  (t) => [
    index("seasons_group_idx").on(t.groupId),
    check("seasons_ends_after_starts", sql`${t.endsAt} is null or ${t.endsAt} > ${t.startsAt}`),
  ],
);

export type Group = typeof groups.$inferSelect;
export type NewGroup = typeof groups.$inferInsert;
export type GroupMember = typeof groupMembers.$inferSelect;
export type GroupRole = GroupMember["role"];
export type Season = typeof seasons.$inferSelect;
