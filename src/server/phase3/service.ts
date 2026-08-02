import { and, eq } from "drizzle-orm";
import { type Queryable, db as defaultDb } from "@/db";
import { gauntlets, ratingShields } from "@/db/schema";
import { NotFoundError, ConflictError } from "@/lib/errors";

/** Challenge someone to a Gauntlet. */
export async function createGauntlet(
  input: { challengerId: string; opponentId: string; groupId: string; gameId: string; bestOf?: number },
  db: Queryable = defaultDb,
) {
  const [existing] = await db
    .select()
    .from(gauntlets)
    .where(and(
      eq(gauntlets.groupId, input.groupId),
      eq(gauntlets.gameId, input.gameId),
      eq(gauntlets.status, "active"),
    ))
    .limit(1);

  if (existing) throw new ConflictError("There's already an active gauntlet for this game.");

  const [g] = await db
    .insert(gauntlets)
    .values({
      challengerId: input.challengerId,
      opponentId: input.opponentId,
      groupId: input.groupId,
      gameId: input.gameId,
      bestOf: input.bestOf ?? 3,
    })
    .returning();
  return g;
}

export async function getActiveGauntlet(groupId: string, gameId: string, db: Queryable = defaultDb) {
  const [g] = await db
    .select()
    .from(gauntlets)
    .where(and(
      eq(gauntlets.groupId, groupId),
      eq(gauntlets.gameId, gameId),
      eq(gauntlets.status, "active"),
    ))
    .limit(1);
  return g ?? null;
}

/** Grant a shield to a user (1 free per week, or earned). */
export async function grantShield(userId: string, groupId: string, db: Queryable = defaultDb) {
  const [s] = await db
    .insert(ratingShields)
    .values({ userId, groupId })
    .returning();
  return s;
}

/** Check if user has an unused shield. */
export async function hasShield(userId: string, groupId: string, db: Queryable = defaultDb): Promise<boolean> {
  const [s] = await db
    .select()
    .from(ratingShields)
    .where(and(
      eq(ratingShields.userId, userId),
      eq(ratingShields.groupId, groupId),
      eq(ratingShields.used, false),
    ))
    .limit(1);
  return !!s;
}

/** Consume a shield (prevents rating loss). Returns the shield id if consumed. */
export async function consumeShield(userId: string, groupId: string, matchId: string, db: Queryable = defaultDb) {
  const [s] = await db
    .select()
    .from(ratingShields)
    .where(and(
      eq(ratingShields.userId, userId),
      eq(ratingShields.groupId, groupId),
      eq(ratingShields.used, false),
    ))
    .limit(1);

  if (!s) return null;

  await db
    .update(ratingShields)
    .set({ used: true, usedAt: new Date(), matchId })
    .where(eq(ratingShields.id, s.id));

  return s.id;
}