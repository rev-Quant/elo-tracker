import "dotenv/config";
import postgres from "postgres";

const url = process.env.DATABASE_URL!;

async function main() {
  const sql = postgres(url, { max: 1, ssl: "require" });

  // Match reactions table
  await sql.unsafe(`CREATE TABLE IF NOT EXISTS "match_reactions" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "match_id" uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    "user_id" uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    "emoji" text NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
  )`);
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS "match_reactions_match_idx" ON "match_reactions" ("match_id")`);

  // Photo column on matches
  await sql.unsafe(`ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "photo_url" text`);

  // Global leaderboard opt-in
  await sql.unsafe(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "show_on_global_leaderboard" boolean DEFAULT false NOT NULL`);

  console.log("Phase 4 schema applied");
  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });