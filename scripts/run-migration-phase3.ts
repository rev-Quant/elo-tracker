import "dotenv/config";
import { readFileSync } from "fs";
import { join } from "path";
import postgres from "postgres";

const url = process.env.DATABASE_URL!;

async function main() {
  const sql = postgres(url, { max: 1, ssl: "require" });

  // Create the new tables from the generated migration
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS "gauntlets" (
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

    CREATE TABLE IF NOT EXISTS "rating_shields" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "user_id" uuid NOT NULL,
      "group_id" uuid NOT NULL,
      "used" boolean DEFAULT false NOT NULL,
      "earned_at" timestamp with time zone DEFAULT now() NOT NULL,
      "used_at" timestamp with time zone,
      "match_id" uuid
    );

    CREATE INDEX IF NOT EXISTS "gauntlets_status_idx" ON "gauntlets" ("status");
    CREATE INDEX IF NOT EXISTS "rating_shields_user_group_idx" ON "rating_shields" ("user_id", "group_id");
  `);

  console.log("Phase 3 tables created");
  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });