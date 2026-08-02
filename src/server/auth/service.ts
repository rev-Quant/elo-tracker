import { and, eq, isNull, sql } from "drizzle-orm";
import { type Queryable, db as defaultDb } from "@/db";
import { isUniqueViolation } from "@/db/errors";
import { type User, users } from "@/db/schema";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { ConflictError, NotFoundError, UnauthorizedError } from "@/lib/errors";
import type { ClaimGuestInput, CreateGuestInput, LoginInput, RegisterInput } from "./schemas";
import { generateVerificationToken } from "./tokens";

/**
 * Account lifecycle. Spec §6 "Account Creation" and §11 /api/auth/*.
 *
 * Guests are ordinary rows with `is_guest = true` (see the deviation note in
 * src/db/schema/users.ts), so claiming an account is an UPDATE rather than a
 * data migration — all match history and ratings are already attached.
 *
 * Every function takes an optional `db` so callers can pass a transaction
 * handle and compose these with other writes.
 */

/** Columns safe to hand to a client. Never includes email or password_hash. */
export interface PublicUser {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  isGuest: boolean;
}

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    isGuest: user.isGuest,
  };
}

const EMAIL_TAKEN = "That email is already registered. Try signing in instead.";

export async function register(input: RegisterInput, db: Queryable = defaultDb): Promise<{ user: User; verifyToken: string }> {
  const passwordHash = await hashPassword(input.password);

  try {
    const [user] = await db
      .insert(users)
      .values({
        displayName: input.displayName,
        email: input.email,
        passwordHash,
        isGuest: false,
      })
      .returning();
    const verifyToken = await generateVerificationToken();
    return { user, verifyToken };
  } catch (err) {
    if (isUniqueViolation(err, "users_email_unique")) throw new ConflictError(EMAIL_TAKEN);
    throw err;
  }
}

/**
 * A hash of a fixed dummy password, compared against when no account matches
 * so that the unknown-email path costs the same as the wrong-password path.
 * Computed once, lazily, so importing this module stays cheap.
 */
let dummyHashPromise: Promise<string> | null = null;
function dummyHash(): Promise<string> {
  dummyHashPromise ??= hashPassword("dummy-password-for-constant-time-login");
  return dummyHashPromise;
}

/**
 * Verify credentials.
 *
 * Returns an identical error whether the email is unknown, the account is a
 * guest (no password), or the password is wrong — and always performs exactly
 * one scrypt comparison — so the response neither states nor reveals by timing
 * whether an account exists.
 */
export async function login(input: LoginInput, db: Queryable = defaultDb): Promise<User> {
  const [user] = await db
    .select()
    .from(users)
    .where(and(sql`lower(${users.email}) = ${input.email}`, isNull(users.deletedAt)))
    .limit(1);

  const passwordMatches = await verifyPassword(input.password, user?.passwordHash ?? (await dummyHash()));

  if (!user || !user.passwordHash || !passwordMatches) {
    throw new UnauthorizedError("Incorrect email or password.");
  }
  return user;
}

/**
 * Create a guest player. Spec §3: "Logging a guest creates a guest user row."
 *
 * `createdByUserId` records who added them, which is what later lets a host
 * vouch for / promote that guest.
 */
export async function createGuest(
  input: CreateGuestInput,
  options: { createdByUserId?: string } = {},
  db: Queryable = defaultDb,
): Promise<User> {
  const [user] = await db
    .insert(users)
    .values({
      displayName: input.displayName,
      isGuest: true,
      createdByUserId: options.createdByUserId ?? null,
    })
    .returning();
  return user;
}

/**
 * Upgrade a guest to a full account, preserving their id and therefore all of
 * their match history and ratings. Spec §6.
 *
 * Row-locked so two people racing to claim the same guest cannot both win.
 */
export async function claimGuest(input: ClaimGuestInput, db: Queryable = defaultDb): Promise<User> {
  const passwordHash = await hashPassword(input.password);

  return db.transaction(async (tx) => {
    const [guest] = await tx
      .select()
      .from(users)
      .where(eq(users.id, input.guestUserId))
      .for("update")
      .limit(1);

    if (!guest || guest.deletedAt) throw new NotFoundError("That guest profile no longer exists.");
    if (!guest.isGuest) throw new ConflictError("That profile has already been claimed.");

    try {
      const [claimed] = await tx
        .update(users)
        .set({
          email: input.email,
          passwordHash,
          isGuest: false,
          createdByUserId: null,
        })
        .where(eq(users.id, guest.id))
        .returning();
      return claimed;
    } catch (err) {
      if (isUniqueViolation(err, "users_email_unique")) throw new ConflictError(EMAIL_TAKEN);
      throw err;
    }
  });
}

export async function findById(id: string, db: Queryable = defaultDb): Promise<User | null> {
  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, id), isNull(users.deletedAt)))
    .limit(1);
  return user ?? null;
}

/** Resolve the signed-in user, rejecting sessions whose account has been deleted. */
export async function requireUser(userId: string, db: Queryable = defaultDb): Promise<User> {
  const user = await findById(userId, db);
  if (!user) throw new UnauthorizedError("Your session is no longer valid. Please sign in again.");
  return user;
}
