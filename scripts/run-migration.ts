import "dotenv/config";
import { readFileSync } from "fs";
import { join } from "path";
import postgres from "postgres";

const url = process.env.DATABASE_URL!;

async function main() {
  const sql = postgres(url, { max: 1, ssl: "require" });
  const migration = readFileSync(join(process.cwd(), "drizzle/0001_email_verify_reset.sql"), "utf8");
  await sql.unsafe(migration);
  console.log("Migration applied successfully");
  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });