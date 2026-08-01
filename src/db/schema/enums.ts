import { pgEnum } from "drizzle-orm/pg-core";

/**
 * Shared enums. The spec (§2) models these as free TEXT columns with a comment
 * listing the legal values; we promote them to real Postgres enums so the
 * database enforces the domain and Drizzle can infer literal union types.
 */

/** games.ranking_mode — how a result is entered for this game. */
export const rankingModeEnum = pgEnum("ranking_mode", ["full", "winner_only", "top_n"]);

/** group_members.role — see the permission matrix in spec §6. */
export const groupRoleEnum = pgEnum("group_role", ["owner", "admin", "member", "spectator"]);

/** matches.match_type — casual matches never affect ratings (spec §1). */
export const matchTypeEnum = pgEnum("match_type", ["casual", "competitive"]);

/** matches.team_mode */
export const teamModeEnum = pgEnum("team_mode", ["ffa", "teams"]);

/** matches.status — lifecycle from spec §2.5. */
export const matchStatusEnum = pgEnum("match_status", ["pending", "confirmed", "disputed", "voided"]);

/** match_participants.status — mid-game departure policy, spec §4. */
export const participantStatusEnum = pgEnum("participant_status", ["active", "left_early", "left_excused"]);

/** current_ratings.rating_pool — 'casual' is reserved for a future release. */
export const ratingPoolEnum = pgEnum("rating_pool", ["competitive", "casual"]);
