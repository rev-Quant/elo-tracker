import { cookies } from "next/headers";
import { env } from "@/lib/env";
import { UnauthorizedError as BaseUnauthorizedError } from "@/lib/errors";
import { SESSION_MAX_AGE_SECONDS, type SessionClaims, type TokenCodec, createTokenCodec } from "./token";

/**
 * Cookie-backed sessions.
 *
 * Reading works anywhere (Server Component, Route Handler, Server Action).
 * WRITING (`startSession` / `endSession`) only works in a Route Handler or
 * Server Action — Next.js forbids mutating cookies while rendering.
 */

export const SESSION_COOKIE = "elo_session";

let cached: TokenCodec | null = null;
function codec(): TokenCodec {
  cached ??= createTokenCodec(env().AUTH_SECRET);
  return cached;
}

/** Issue a session cookie. Route Handlers and Server Actions only. */
export async function startSession(claims: SessionClaims): Promise<void> {
  const token = await codec().sign(claims);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    // Allows the cookie to survive the cross-site navigation from a shared
    // invite link (WhatsApp, Discord) while still blocking CSRF on POSTs.
    sameSite: "lax",
    secure: env().NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

/** Clear the session cookie. Route Handlers and Server Actions only. */
export async function endSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

/** The current session, or null if signed out / expired / tampered. */
export async function getSession(): Promise<SessionClaims | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return codec().verify(token);
}

export class UnauthorizedError extends BaseUnauthorizedError {}

/** The current session, or throw a 401-flavoured error. */
export async function requireSession(): Promise<SessionClaims> {
  const session = await getSession();
  if (!session) throw new UnauthorizedError();
  return session;
}

export type { SessionClaims };
