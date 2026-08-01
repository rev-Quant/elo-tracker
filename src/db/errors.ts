/**
 * Postgres error introspection.
 *
 * Relying on DB constraints and catching the violation is safer than a
 * check-then-insert, which races under concurrency. The SQLSTATE is exposed as
 * `code`; the failing constraint's name is spelled `constraint_name` by
 * postgres.js (production) but `constraint` by node-postgres and PGlite
 * (tests), so both are checked.
 *
 * Drizzle wraps driver errors in a DrizzleQueryError, so the `cause` chain is
 * walked as well.
 */

/** https://www.postgresql.org/docs/current/errcodes-appendix.html */
const UNIQUE_VIOLATION = "23505";
const CHECK_VIOLATION = "23514";
const FOREIGN_KEY_VIOLATION = "23503";
const NOT_NULL_VIOLATION = "23502";

interface PgErrorish {
  code?: unknown;
  constraint?: unknown;
  constraint_name?: unknown;
  cause?: unknown;
}

/** Walk the cause chain, since Drizzle wraps driver errors. */
function* chain(err: unknown): Generator<PgErrorish> {
  let current = err;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    if (typeof current !== "object") return;
    yield current as PgErrorish;
    current = (current as PgErrorish).cause;
  }
}

/** SQLSTATE of the underlying Postgres error, if there is one. */
export function sqlState(err: unknown): string | null {
  for (const link of chain(err)) {
    if (typeof link.code === "string") return link.code;
  }
  return null;
}

/** The name of the violated constraint, if the error carries one. */
export function violatedConstraint(err: unknown): string | null {
  for (const link of chain(err)) {
    if (typeof link.constraint_name === "string") return link.constraint_name;
    if (typeof link.constraint === "string") return link.constraint;
  }
  return null;
}

function matches(err: unknown, expected: string, constraint?: string): boolean {
  if (sqlState(err) !== expected) return false;
  if (constraint === undefined) return true;
  return violatedConstraint(err) === constraint;
}

/** True if the error is a unique-constraint violation, optionally a specific one. */
export function isUniqueViolation(err: unknown, constraint?: string): boolean {
  return matches(err, UNIQUE_VIOLATION, constraint);
}

export function isCheckViolation(err: unknown, constraint?: string): boolean {
  return matches(err, CHECK_VIOLATION, constraint);
}

export function isForeignKeyViolation(err: unknown, constraint?: string): boolean {
  return matches(err, FOREIGN_KEY_VIOLATION, constraint);
}

export function isNotNullViolation(err: unknown): boolean {
  return matches(err, NOT_NULL_VIOLATION);
}
