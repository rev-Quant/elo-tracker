import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Users. Spec §2.
 *
 * SPEC DEVIATION (agreed): guests are ordinary `users` rows with
 * `is_guest = true` and they DO earn ratings. The spec's alternative
 * (`match_participants.guest_name` as a bare string) makes the §6
 * guest-claim flow unimplementable, because there would be no row to migrate.
 * `guest_name` is therefore dropped from `match_participants`.
 *
 * Claiming a guest account = setting email/password_hash and flipping
 * `is_guest` to false. All match history and ratings carry over untouched.
 */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    displayName: text("display_name").notNull(),

    /** Always stored lower-cased. NULL for guests. */
    email: text("email"),

    /** scrypt hash, see src/lib/auth/password.ts. NULL for guests and OAuth users. */
    passwordHash: text("password_hash"),

    avatarUrl: text("avatar_url"),

    isGuest: boolean("is_guest").notNull().default(false),

    /** Which registered user created this guest, for attribution and claim checks. */
    createdByUserId: uuid("created_by_user_id").references((): AnyPgColumn => users.id, {
      onDelete: "set null",
    }),

    /** Set when email is verified. NULL until then. */
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),

    /**
     * Soft delete (spec §10 "Account deletion"). Deleting anonymises
     * display_name and clears credentials but retains match rows.
     */
    deletedAt: timestamp("deleted_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Case-insensitive uniqueness. Emails are normalised to lower case on write;
    // the lower() index makes that a hard guarantee rather than a convention.
    uniqueIndex("users_email_unique").on(sql`lower(${t.email})`).where(sql`${t.email} is not null`),

    index("users_display_name_idx").on(t.displayName),

    // A guest has no credentials.
    check(
      "users_guest_has_no_credentials",
      sql`not ${t.isGuest} or (${t.email} is null and ${t.passwordHash} is null)`,
    ),

    // A live, non-guest account must be reachable by email.
    check(
      "users_registered_has_email",
      sql`${t.isGuest} or ${t.deletedAt} is not null or ${t.email} is not null`,
    ),

    check("users_display_name_not_blank", sql`length(btrim(${t.displayName})) > 0`),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

/** One-time tokens for password reset. Expire after 1 hour. */
export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("password_reset_tokens_user_idx").on(t.userId)],
);
