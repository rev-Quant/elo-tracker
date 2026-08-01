import { randomInt } from "node:crypto";

/**
 * Slug and invite-code generation.
 *
 * Both `groups.slug` and `games.slug` carry a CHECK constraint of
 * ^[a-z0-9]+(-[a-z0-9]+)*$ — `slugify` is the only sanctioned way to produce a
 * value that satisfies it.
 */

export const MAX_SLUG_LENGTH = 60;

export class SlugError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SlugError";
  }
}

/**
 * Convert arbitrary user input into a URL-safe slug.
 *
 * Accented Latin characters are folded to ASCII ("Café" -> "cafe") rather than
 * dropped, so non-English group names still produce a readable URL. Scripts
 * with no ASCII fallback (CJK, Cyrillic, emoji) reduce to nothing, in which
 * case the caller must supply a fallback — see `slugifyWithFallback`.
 */
export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    // Strip combining marks left behind by NFKD, folding "é" -> "e".
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG_LENGTH)
    // A trailing hyphen can reappear after the slice.
    .replace(/-+$/g, "");
}

/** Slugify, falling back to a random token when the input yields nothing. */
export function slugifyWithFallback(input: string, prefix = "group"): string {
  const slug = slugify(input);
  return slug || `${prefix}-${randomToken(6)}`;
}

/**
 * Append a numeric discriminator, keeping the result within MAX_SLUG_LENGTH.
 * Used to resolve collisions: "game-night", "game-night-2", "game-night-3".
 */
export function slugWithSuffix(slug: string, n: number): string {
  if (!Number.isInteger(n) || n < 2) throw new SlugError(`suffix must be an integer >= 2, got ${n}`);
  const suffix = `-${n}`;
  const base = slug.slice(0, MAX_SLUG_LENGTH - suffix.length).replace(/-+$/g, "");
  return `${base}${suffix}`;
}

export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) && slug.length <= MAX_SLUG_LENGTH;
}

/**
 * Alphabet for human-transcribed codes: no 0/O, 1/I/L, or vowels.
 * Removing vowels also makes it very unlikely to generate a real word.
 */
const CODE_ALPHABET = "BCDFGHJKMNPQRSTVWXYZ23456789";
export const INVITE_CODE_LENGTH = 8;

/**
 * Invite code for /join/<code>. Spec §6.
 *
 * 28^8 ≈ 3.8e11 possibilities, drawn from a CSPRNG, so codes are not
 * enumerable in practice. Uniqueness is still enforced by a DB constraint;
 * the caller retries on conflict.
 */
export function generateInviteCode(length = INVITE_CODE_LENGTH): string {
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return out;
}

/**
 * Normalise a code a human typed or pasted: strip surrounding whitespace and
 * any separators they added, then upper-case it.
 *
 * Deliberately does NOT try to "correct" ambiguous characters. The alphabet
 * already excludes 0/O/1/I/L, so a code containing one of those was mistyped,
 * and guessing which real character was meant would silently look up the wrong
 * group. Let `isValidInviteCode` reject it and tell the user.
 */
export function normalizeInviteCode(input: string): string {
  return input.trim().toUpperCase().replace(/[\s-]/g, "");
}

export function isValidInviteCode(code: string): boolean {
  return code.length === INVITE_CODE_LENGTH && [...code].every((c) => CODE_ALPHABET.includes(c));
}

/** Lowercase alphanumeric token, for slug fallbacks. */
export function randomToken(length: number): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < length; i += 1) out += alphabet[randomInt(alphabet.length)];
  return out;
}
