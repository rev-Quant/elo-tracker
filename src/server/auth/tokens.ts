import { randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { type Queryable, db as defaultDb } from "@/db";
import { passwordResetTokens, users } from "@/db/schema";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";

const RESET_TOKEN_BYTES = 32;
const RESET_EXPIRY_HOURS = 1;

export function generateResetToken(): string {
  return randomBytes(RESET_TOKEN_BYTES).toString("base64url");
}

export function generateVerificationToken(): string {
  return randomBytes(24).toString("base64url");
}

export async function createResetToken(userId: string, db: Queryable = defaultDb): Promise<string> {
  const token = generateResetToken();
  const expiresAt = new Date(Date.now() + RESET_EXPIRY_HOURS * 60 * 60 * 1000);
  await db.insert(passwordResetTokens).values({ userId, token, expiresAt });
  return token;
}

export async function consumeResetToken(token: string, db: Queryable = defaultDb): Promise<string> {
  const [row] = await db
    .select()
    .from(passwordResetTokens)
    .where(and(eq(passwordResetTokens.token, token), gt(passwordResetTokens.expiresAt, new Date())))
    .limit(1);
  if (!row) throw new NotFoundError("This reset link is invalid or has expired.");
  await db.delete(passwordResetTokens).where(eq(passwordResetTokens.id, row.id));
  return row.userId;
}

export async function verifyEmail(userId: string, db: Queryable = defaultDb): Promise<void> {
  const [target] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!target) throw new NotFoundError("Invalid verification link.");
  if (target.emailVerifiedAt) return; // Already verified, idempotent
  await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, userId));
}

export async function requestPasswordReset(email: string, db: Queryable = defaultDb) {
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user || !user.email) return null; // Don't reveal if email exists
  const token = await createResetToken(user.id, db);
  return { userId: user.id, email: user.email, token };
}

export async function resetPassword(token: string, newPassword: string, db: Queryable = defaultDb) {
  const userId = await consumeResetToken(token, db);

  const { hashPassword } = await import("@/lib/auth/password");
  const passwordHash = await hashPassword(newPassword);

  await db.update(users).set({ passwordHash }).where(eq(users.id, userId));
}