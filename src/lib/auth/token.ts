import { SignJWT, jwtVerify } from "jose";

/**
 * Session token codec.
 *
 * Pure and framework-free so it can be unit tested without a Next.js request
 * context. The cookie wiring lives in ./session.ts.
 *
 * Sessions are stateless JWTs rather than DB rows. That is the right trade for
 * Phase 1 (no session table, no read on every request), but it means a token
 * cannot be revoked before it expires. If forced logout / "sign out everywhere"
 * is needed later, add a `users.session_epoch` integer, embed it in the token,
 * and reject tokens whose epoch is stale.
 */

const ALG = "HS256";

/** 30 days, in seconds. Game nights are infrequent; do not log people out. */
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export interface SessionClaims {
  /** users.id */
  userId: string;
  /** Mirrors users.is_guest so the UI can prompt an upgrade without a DB read. */
  isGuest: boolean;
}

export class SessionTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SessionTokenError";
  }
}

export interface TokenCodec {
  sign(claims: SessionClaims, options?: { maxAgeSeconds?: number }): Promise<string>;
  /** Returns null for any invalid, tampered, or expired token. Never throws. */
  verify(token: string): Promise<SessionClaims | null>;
}

export function createTokenCodec(secret: string): TokenCodec {
  if (secret.length < 32) {
    throw new SessionTokenError("session secret must be at least 32 characters");
  }
  const key = new TextEncoder().encode(secret);

  return {
    async sign(claims, options) {
      const maxAge = options?.maxAgeSeconds ?? SESSION_MAX_AGE_SECONDS;
      const now = Math.floor(Date.now() / 1000);
      return new SignJWT({ isGuest: claims.isGuest })
        .setProtectedHeader({ alg: ALG })
        .setSubject(claims.userId)
        .setIssuedAt(now)
        .setNotBefore(now)
        .setExpirationTime(now + maxAge)
        .sign(key);
    },

    async verify(token) {
      if (!token) return null;
      try {
        const { payload } = await jwtVerify(token, key, {
          // Pinning the algorithm is what stops an attacker swapping the
          // header to "none" or to an asymmetric alg.
          algorithms: [ALG],
        });

        if (typeof payload.sub !== "string" || payload.sub.length === 0) return null;
        if (typeof payload.isGuest !== "boolean") return null;

        return { userId: payload.sub, isGuest: payload.isGuest };
      } catch {
        // Expired, malformed, wrong signature — all indistinguishable to callers.
        return null;
      }
    },
  };
}
