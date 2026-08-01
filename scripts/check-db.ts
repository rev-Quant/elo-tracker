import "dotenv/config";
import postgres from "postgres";

/** Connectivity probe: confirms the DATABASE_URL works before migrating. */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");

  const sql = postgres(url, { max: 1, connect_timeout: 20, ssl: "require" });
  try {
    const [row] = await sql`select version(), current_database() as db, now() as now`;
    console.log("connected");
    console.log("  database:", row.db);
    console.log("  server:  ", String(row.version).split(",")[0]);
    console.log("  time:    ", row.now.toISOString());
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("connection failed:", err.message);
  process.exit(1);
});
