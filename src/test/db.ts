import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import type { Db } from "@/db";
import * as schema from "@/db/schema";

/**
 * In-process Postgres for integration tests.
 *
 * PGlite is a real PostgreSQL build (18.x) compiled to WASM, so constraints,
 * transactions, advisory locks and upserts behave exactly as they will on
 * Neon. That makes these genuine integration tests rather than mocks, with no
 * external service to stand up.
 *
 * Each call to `createTestDb()` gets its own isolated in-memory database.
 */

const MIGRATIONS_DIR = join(process.cwd(), "drizzle");

/** Read the generated migration files in journal order. */
function migrationSql(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => readFileSync(join(MIGRATIONS_DIR, f), "utf8"));
}

export interface TestDb {
  /**
   * Typed as the application's `Db` so services can be called directly.
   *
   * The cast is sound: both are Drizzle PgDatabase instances over the same
   * schema and produce identical SQL. Only the driver underneath differs
   * (PGlite here, postgres.js in production), and the two expose different
   * TypeScript types for their query-result HKT.
   */
  db: Db;
  client: PGlite;
  close(): Promise<void>;
}

export async function createTestDb(): Promise<TestDb> {
  const client = await PGlite.create();

  for (const sql of migrationSql()) {
    // drizzle-kit separates statements with this marker; splitting lets a
    // failure point at the individual statement that broke.
    for (const statement of sql.split("--> statement-breakpoint")) {
      const trimmed = statement.trim();
      if (trimmed) await client.exec(trimmed);
    }
  }

  const db = drizzle(client, { schema, casing: "snake_case" }) as unknown as Db;

  return {
    db,
    client,
    close: () => client.close(),
  };
}
