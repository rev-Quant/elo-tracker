import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as schema from "./schema";

/**
 * Postgres client.
 *
 * postgres.js over TCP rather than Neon's HTTP driver, because match logging
 * must run inside a real interactive transaction (insert match + participants
 * + snapshots + upsert ratings, all or nothing). The HTTP driver cannot do it.
 *
 * Initialisation is LAZY. Route modules import `db` at module scope, and
 * Next.js evaluates those modules while collecting page data at build time —
 * so eager construction would make `next build` require a live DATABASE_URL.
 * The proxy defers `env()` until the first actual query.
 */

export type Db = PostgresJsDatabase<typeof schema>;
/** The handle passed to db.transaction(tx => ...). */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
/** Anything a service can query against, so services compose inside a transaction. */
export type Queryable = Db | Tx;

// Cached on globalThis so Next.js hot reloads do not leak a pool per edit.
const globalForDb = globalThis as unknown as {
  __eloSql?: ReturnType<typeof postgres>;
  __eloDb?: Db;
};

function client(): ReturnType<typeof postgres> {
  globalForDb.__eloSql ??= postgres(env().DATABASE_URL, {
    // Neon's pooled endpoint does its own pooling; keep ours small.
    max: 10,
    idle_timeout: 20,
    connect_timeout: 15,
    ssl: "require",
  });
  return globalForDb.__eloSql;
}

function instance(): Db {
  globalForDb.__eloDb ??= drizzle(client(), { schema, casing: "snake_case" });
  return globalForDb.__eloDb;
}

export const db: Db = new Proxy({} as Db, {
  get(_target, property) {
    const real = instance();
    const value = Reflect.get(real, property) as unknown;
    return typeof value === "function" ? value.bind(real) : value;
  },
});

/** Close the pool. For scripts; the server keeps its connection for its lifetime. */
export async function closeDb(): Promise<void> {
  if (globalForDb.__eloSql) {
    await globalForDb.__eloSql.end();
    globalForDb.__eloSql = undefined;
    globalForDb.__eloDb = undefined;
  }
}

export { schema };
