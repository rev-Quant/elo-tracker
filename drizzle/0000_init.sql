CREATE TYPE "public"."group_role" AS ENUM('owner', 'admin', 'member', 'spectator');--> statement-breakpoint
CREATE TYPE "public"."match_status" AS ENUM('pending', 'confirmed', 'disputed', 'voided');--> statement-breakpoint
CREATE TYPE "public"."match_type" AS ENUM('casual', 'competitive');--> statement-breakpoint
CREATE TYPE "public"."participant_status" AS ENUM('active', 'left_early', 'left_excused');--> statement-breakpoint
CREATE TYPE "public"."ranking_mode" AS ENUM('full', 'winner_only', 'top_n');--> statement-breakpoint
CREATE TYPE "public"."rating_pool" AS ENUM('competitive', 'casual');--> statement-breakpoint
CREATE TYPE "public"."team_mode" AS ENUM('ffa', 'teams');--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "password_reset_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"display_name" text NOT NULL,
	"email" text,
	"password_hash" text,
	"avatar_url" text,
	"is_guest" boolean DEFAULT false NOT NULL,
	"created_by_user_id" uuid,
	"email_verified_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_guest_has_no_credentials" CHECK (not "users"."is_guest" or ("users"."email" is null and "users"."password_hash" is null)),
	CONSTRAINT "users_registered_has_email" CHECK ("users"."is_guest" or "users"."deleted_at" is not null or "users"."email" is not null),
	CONSTRAINT "users_display_name_not_blank" CHECK (length(btrim("users"."display_name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "games" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"min_players" integer DEFAULT 2 NOT NULL,
	"max_players" integer,
	"supports_teams" boolean DEFAULT false NOT NULL,
	"supports_ffa" boolean DEFAULT true NOT NULL,
	"ranking_mode" "ranking_mode" DEFAULT 'full' NOT NULL,
	"icon_url" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "games_slug_unique" UNIQUE("slug"),
	CONSTRAINT "games_min_players_at_least_2" CHECK ("games"."min_players" >= 2),
	CONSTRAINT "games_max_gte_min" CHECK ("games"."max_players" is null or "games"."max_players" >= "games"."min_players"),
	CONSTRAINT "games_supports_a_mode" CHECK ("games"."supports_teams" or "games"."supports_ffa"),
	CONSTRAINT "games_slug_format" CHECK ("games"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);
--> statement-breakpoint
CREATE TABLE "group_members" (
	"group_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "group_role" DEFAULT 'member' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "group_members_group_id_user_id_pk" PRIMARY KEY("group_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"invite_code" text NOT NULL,
	"created_by" uuid NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "groups_slug_unique" UNIQUE("slug"),
	CONSTRAINT "groups_invite_code_unique" UNIQUE("invite_code"),
	CONSTRAINT "groups_name_not_blank" CHECK (length(btrim("groups"."name")) > 0),
	CONSTRAINT "groups_slug_format" CHECK ("groups"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);
--> statement-breakpoint
CREATE TABLE "seasons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"name" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "seasons_ends_after_starts" CHECK ("seasons"."ends_at" is null or "seasons"."ends_at" > "seasons"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "match_confirmations" (
	"match_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"confirmed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_confirmations_match_id_user_id_pk" PRIMARY KEY("match_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "match_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid NOT NULL,
	"match_team_id" uuid,
	"user_id" uuid NOT NULL,
	"final_rank" integer,
	"raw_score" integer,
	"rating_before" double precision,
	"rating_after" double precision,
	"rating_delta" double precision,
	"status" "participant_status" DEFAULT 'active' NOT NULL,
	"left_at_move" integer,
	CONSTRAINT "match_participants_rank_positive" CHECK ("match_participants"."final_rank" is null or "match_participants"."final_rank" >= 1),
	CONSTRAINT "match_participants_left_at_move_requires_departure" CHECK ("match_participants"."left_at_move" is null or "match_participants"."status" <> 'active')
);
--> statement-breakpoint
CREATE TABLE "match_teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid NOT NULL,
	"team_index" integer NOT NULL,
	"team_name" text,
	"result_rank" integer,
	CONSTRAINT "match_teams_index_non_negative" CHECK ("match_teams"."team_index" >= 0),
	CONSTRAINT "match_teams_rank_positive" CHECK ("match_teams"."result_rank" is null or "match_teams"."result_rank" >= 1)
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"season_id" uuid,
	"match_type" "match_type" DEFAULT 'competitive' NOT NULL,
	"team_mode" "team_mode" NOT NULL,
	"num_teams" integer,
	"recorded_by" uuid NOT NULL,
	"played_at" timestamp with time zone DEFAULT now() NOT NULL,
	"duration_seconds" integer,
	"notes" text,
	"status" "match_status" DEFAULT 'pending' NOT NULL,
	"ratings_applied" boolean DEFAULT false NOT NULL,
	"idempotency_key" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "matches_num_teams_matches_mode" CHECK (("matches"."team_mode" = 'ffa' and "matches"."num_teams" is null) or ("matches"."team_mode" = 'teams' and "matches"."num_teams" is not null and "matches"."num_teams" >= 2)),
	CONSTRAINT "matches_duration_positive" CHECK ("matches"."duration_seconds" is null or "matches"."duration_seconds" > 0)
);
--> statement-breakpoint
CREATE TABLE "current_ratings" (
	"user_id" uuid NOT NULL,
	"game_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"rating_pool" "rating_pool" DEFAULT 'competitive' NOT NULL,
	"mu" double precision NOT NULL,
	"sigma" double precision NOT NULL,
	"display_rating" double precision NOT NULL,
	"games_played" integer DEFAULT 0 NOT NULL,
	"wins" integer DEFAULT 0 NOT NULL,
	"losses" integer DEFAULT 0 NOT NULL,
	"last_played_at" timestamp with time zone,
	CONSTRAINT "current_ratings_user_id_game_id_group_id_rating_pool_pk" PRIMARY KEY("user_id","game_id","group_id","rating_pool"),
	CONSTRAINT "current_ratings_sigma_positive" CHECK ("current_ratings"."sigma" > 0),
	CONSTRAINT "current_ratings_counts_non_negative" CHECK ("current_ratings"."games_played" >= 0 and "current_ratings"."wins" >= 0 and "current_ratings"."losses" >= 0)
);
--> statement-breakpoint
CREATE TABLE "rating_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"game_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"rating_pool" "rating_pool" DEFAULT 'competitive' NOT NULL,
	"match_id" uuid NOT NULL,
	"mu_before" double precision NOT NULL,
	"mu_after" double precision NOT NULL,
	"sigma_before" double precision NOT NULL,
	"sigma_after" double precision NOT NULL,
	"display_before" double precision NOT NULL,
	"display_after" double precision NOT NULL,
	"delta" double precision NOT NULL,
	"is_reversal" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_members" (
	"team_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone,
	CONSTRAINT "team_members_team_id_user_id_pk" PRIMARY KEY("team_id","user_id"),
	CONSTRAINT "team_members_left_after_joined" CHECK ("team_members"."left_at" is null or "team_members"."left_at" >= "team_members"."joined_at")
);
--> statement-breakpoint
CREATE TABLE "team_ratings" (
	"team_id" uuid NOT NULL,
	"game_id" uuid NOT NULL,
	"mu" double precision NOT NULL,
	"sigma" double precision NOT NULL,
	"display_rating" double precision NOT NULL,
	"games_played" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "team_ratings_team_id_game_id_pk" PRIMARY KEY("team_id","game_id")
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gauntlets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"challenger_id" uuid NOT NULL,
	"opponent_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"game_id" uuid NOT NULL,
	"best_of" integer DEFAULT 3 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"challenger_wins" integer DEFAULT 0 NOT NULL,
	"opponent_wins" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "rating_shields" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"used" boolean DEFAULT false NOT NULL,
	"earned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"used_at" timestamp with time zone,
	"match_id" uuid
);
--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seasons" ADD CONSTRAINT "seasons_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_confirmations" ADD CONSTRAINT "match_confirmations_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_confirmations" ADD CONSTRAINT "match_confirmations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_participants" ADD CONSTRAINT "match_participants_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_participants" ADD CONSTRAINT "match_participants_match_team_id_match_teams_id_fk" FOREIGN KEY ("match_team_id") REFERENCES "public"."match_teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_participants" ADD CONSTRAINT "match_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_teams" ADD CONSTRAINT "match_teams_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "current_ratings" ADD CONSTRAINT "current_ratings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "current_ratings" ADD CONSTRAINT "current_ratings_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "current_ratings" ADD CONSTRAINT "current_ratings_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rating_snapshots" ADD CONSTRAINT "rating_snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rating_snapshots" ADD CONSTRAINT "rating_snapshots_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rating_snapshots" ADD CONSTRAINT "rating_snapshots_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rating_snapshots" ADD CONSTRAINT "rating_snapshots_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_ratings" ADD CONSTRAINT "team_ratings_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_ratings" ADD CONSTRAINT "team_ratings_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gauntlets" ADD CONSTRAINT "gauntlets_challenger_id_users_id_fk" FOREIGN KEY ("challenger_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gauntlets" ADD CONSTRAINT "gauntlets_opponent_id_users_id_fk" FOREIGN KEY ("opponent_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gauntlets" ADD CONSTRAINT "gauntlets_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gauntlets" ADD CONSTRAINT "gauntlets_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rating_shields" ADD CONSTRAINT "rating_shields_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rating_shields" ADD CONSTRAINT "rating_shields_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "password_reset_tokens_user_idx" ON "password_reset_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree (lower("email")) WHERE "users"."email" is not null;--> statement-breakpoint
CREATE INDEX "users_display_name_idx" ON "users" USING btree ("display_name");--> statement-breakpoint
CREATE INDEX "group_members_user_idx" ON "group_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "seasons_group_idx" ON "seasons" USING btree ("group_id");--> statement-breakpoint
CREATE UNIQUE INDEX "match_participants_match_user_unique" ON "match_participants" USING btree ("match_id","user_id");--> statement-breakpoint
CREATE INDEX "match_participants_user_idx" ON "match_participants" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "match_participants_team_idx" ON "match_participants" USING btree ("match_team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "match_teams_match_index_unique" ON "match_teams" USING btree ("match_id","team_index");--> statement-breakpoint
CREATE INDEX "matches_group_played_at_idx" ON "matches" USING btree ("group_id","played_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "matches_group_game_idx" ON "matches" USING btree ("group_id","game_id");--> statement-breakpoint
CREATE INDEX "matches_status_idx" ON "matches" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "matches_group_idempotency_unique" ON "matches" USING btree ("group_id","idempotency_key") WHERE "matches"."idempotency_key" is not null;--> statement-breakpoint
CREATE INDEX "current_ratings_leaderboard_idx" ON "current_ratings" USING btree ("group_id","game_id","rating_pool","display_rating" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "rating_snapshots_user_game_group_idx" ON "rating_snapshots" USING btree ("user_id","game_id","group_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "rating_snapshots_match_idx" ON "rating_snapshots" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX "teams_group_idx" ON "teams" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "gauntlets_status_idx" ON "gauntlets" USING btree ("status");--> statement-breakpoint
CREATE INDEX "rating_shields_user_group_idx" ON "rating_shields" USING btree ("user_id","group_id");