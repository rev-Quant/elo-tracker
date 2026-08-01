import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";
import { promisify } from "node:util";

// `promisify` resolves to scrypt's 3-argument overload, so the options-taking
// form has to be re-declared explicitly.
const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
) => Promise<Buffer>;

/**
 * Password hashing with scrypt from Node's standard library.
 *
 * Deliberately dependency-free: `bcrypt` needs a native toolchain on Windows
 * and `bcryptjs` is a slow pure-JS reimplementation. scrypt is memory-hard,
 * built in, and has no install step.
 *
 * Encoded form:  scrypt$N$r$p$<salt-b64>$<hash-b64>
 * The parameters are stored per-hash so they can be raised later without
 * invalidating existing passwords (see `needsRehash`).
 */

const N = 32_768; // CPU/memory cost. 2^15.
const R = 8; // block size
const P = 1; // parallelisation
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

// scrypt needs roughly 128 * N * r bytes; Node's default maxmem (32 MiB) is
// just under what N=2^15, r=8 requires, so raise it explicitly.
const MAX_MEM = 128 * N * R * 2;

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 200;

export class PasswordError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PasswordError";
  }
}

/** Throws PasswordError if the password fails basic policy. */
export function assertPasswordPolicy(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new PasswordError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  // bcrypt-style truncation bugs do not apply to scrypt, but an unbounded
  // password is a cheap denial-of-service vector against a memory-hard KDF.
  if (password.length > MAX_PASSWORD_LENGTH) {
    throw new PasswordError(`Password must be at most ${MAX_PASSWORD_LENGTH} characters.`);
  }
}

export async function hashPassword(password: string): Promise<string> {
  assertPasswordPolicy(password);
  const salt = randomBytes(SALT_LENGTH);
  const derived = await scryptAsync(password.normalize("NFKC"), salt, KEY_LENGTH, {
    N,
    r: R,
    p: P,
    maxmem: MAX_MEM,
  });
  return ["scrypt", N, R, P, salt.toString("base64"), derived.toString("base64")].join("$");
}

/**
 * Constant-time verification. Returns false (never throws) for malformed
 * stored hashes, so a corrupt row cannot be distinguished from a wrong password.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parsed = parse(stored);
  if (!parsed) return false;

  let derived: Buffer;
  try {
    derived = await scryptAsync(password.normalize("NFKC"), parsed.salt, parsed.hash.length, {
      N: parsed.n,
      r: parsed.r,
      p: parsed.p,
      maxmem: Math.max(MAX_MEM, 128 * parsed.n * parsed.r * 2),
    });
  } catch {
    return false;
  }

  if (derived.length !== parsed.hash.length) return false;
  return timingSafeEqual(derived, parsed.hash);
}

/** True if the stored hash used weaker parameters than we now require. */
export function needsRehash(stored: string): boolean {
  const parsed = parse(stored);
  if (!parsed) return true;
  return parsed.n < N || parsed.r < R || parsed.p < P;
}

interface Parsed {
  n: number;
  r: number;
  p: number;
  salt: Buffer;
  hash: Buffer;
}

function parse(stored: string): Parsed | null {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return null;

  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!isPositiveInt(n) || !isPositiveInt(r) || !isPositiveInt(p)) return null;
  // N must be a power of two greater than 1, or scrypt throws.
  if ((n & (n - 1)) !== 0 || n < 2) return null;
  // Refuse absurd parameters from a tampered row rather than allocating GBs.
  if (n > 1 << 22 || r > 64 || p > 16) return null;

  try {
    const salt = Buffer.from(parts[4], "base64");
    const hash = Buffer.from(parts[5], "base64");
    if (salt.length === 0 || hash.length === 0) return null;
    return { n, r, p, salt, hash };
  } catch {
    return null;
  }
}

function isPositiveInt(v: number): boolean {
  return Number.isInteger(v) && v > 0;
}
