/**
 * Vitest global setup.
 *
 * `src/db/index.ts` validates the environment at module scope, so importing
 * any service would throw without these. postgres.js only opens a socket on
 * the first query, so this creates a client that is never actually used —
 * integration tests pass an explicit PGlite handle instead.
 */
process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.AUTH_SECRET ??= "test-auth-secret-that-is-long-enough-for-hs256";
// NODE_ENV is typed readonly and Vitest already sets it to "test".
