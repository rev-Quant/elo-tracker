import { aliasedTable, and, desc, eq, ne, sql } from "drizzle-orm";
import { type Queryable, db as defaultDb } from "@/db";
import { currentRatings, matchParticipants, matches, users } from "@/db/schema";
import { predictWin, type Rating } from "@/lib/rating";

/**
 * Nemesis System — identifies the player whose rating is closest to yours
 * and who you've played most frequently. Spec §3 of the growth playbook.
 */

export interface NemesisInfo {
  userId: string;
  displayName: string;
  opponentRating: number;
  myRating: number;
  myWins: number;
  myLosses: number;
  totalGames: number;
  /** Positive = I'm ahead, negative = they're ahead. */
  gap: number;
  /** Is this person my nemesis (negative record) or prey (positive)? */
  isNemesis: boolean;
}

export async function findNemesis(
  userId: string,
  groupId: string,
  gameId?: string,
  db: Queryable = defaultDb,
): Promise<NemesisInfo | null> {
  // Get my current rating for the game
  const myRating = await getRating(userId, groupId, gameId, db);
  if (!myRating) return null;

  // Find opponent with most head-to-head matches and closest rating
  const me = aliasedTable(matchParticipants, "me");
  const them = aliasedTable(matchParticipants, "them");
  const m = aliasedTable(matches, "m");

  const h2h = await db
    .select({
      opponentId: them.userId,
      opponentName: users.displayName,
      myWins: sql<number>`count(*) filter (where ${me.finalRank} < ${them.finalRank})::int`,
      myLosses: sql<number>`count(*) filter (where ${me.finalRank} > ${them.finalRank})::int`,
      total: sql<number>`count(*)::int`,
    })
    .from(me)
    .innerJoin(them, and(eq(them.matchId, me.matchId), ne(them.userId, me.userId)))
    .innerJoin(m, and(eq(m.id, me.matchId), eq(m.status, "confirmed"), eq(m.matchType, "competitive")))
    .innerJoin(users, eq(users.id, them.userId))
    .where(
      and(
        eq(me.userId, userId),
        eq(m.groupId, groupId),
        gameId ? eq(m.gameId, gameId) : undefined,
      ),
    )
    .groupBy(them.userId, users.displayName)
    .orderBy(desc(sql`count(*)`))
    .limit(20);

  if (h2h.length === 0) return null;

  // Score each opponent: closeness of rating × frequency of play
  let best: NemesisInfo | null = null;
  let bestScore = -Infinity;

  for (const opp of h2h) {
    const oppRating = await getRating(opp.opponentId, groupId, gameId, db);
    if (!oppRating) continue;

    const ratingDiff = Math.abs(myRating.displayRating - oppRating.displayRating);
    // Score: prefer close ratings and high frequency. Closer rating = better.
    const score = opp.total * 10 - ratingDiff * 0.5;
    if (score > bestScore) {
      bestScore = score;
      best = {
        userId: opp.opponentId,
        displayName: opp.opponentName,
        opponentRating: oppRating.displayRating,
        myRating: myRating.displayRating,
        myWins: opp.myWins,
        myLosses: opp.myLosses,
        totalGames: opp.total,
        gap: opp.myWins - opp.myLosses,
        isNemesis: opp.myWins < opp.myLosses,
      };
    }
  }

  return best;
}

async function getRating(
  userId: string,
  groupId: string,
  gameId: string | undefined,
  db: Queryable,
): Promise<{ mu: number; sigma: number; displayRating: number } | null> {
  if (!gameId) {
    // Aggregate across all games in the group
    const rows = await db
      .select({ mu: currentRatings.mu, sigma: currentRatings.sigma, displayRating: currentRatings.displayRating })
      .from(currentRatings)
      .where(
        and(
          eq(currentRatings.userId, userId),
          eq(currentRatings.groupId, groupId),
          eq(currentRatings.ratingPool, "competitive"),
        ),
      );
    if (rows.length === 0) return null;
    const avg = rows.reduce((a, r) => a + r.displayRating, 0) / rows.length;
    return { mu: rows[0].mu, sigma: rows[0].sigma, displayRating: avg };
  }

  const [row] = await db
    .select({ mu: currentRatings.mu, sigma: currentRatings.sigma, displayRating: currentRatings.displayRating })
    .from(currentRatings)
    .where(
      and(
        eq(currentRatings.userId, userId),
        eq(currentRatings.groupId, groupId),
        eq(currentRatings.gameId, gameId),
        eq(currentRatings.ratingPool, "competitive"),
      ),
    );
  return row ?? null;
}

/**
 * Oracle win prediction. Uses OpenSkill's predictWin.
 * Returns probability [0-1] for each participant.
 */
export function predictMatch(
  participants: { userId: string; rating: { mu: number; sigma: number } }[],
): { userId: string; winProb: number }[] {
  if (participants.length < 2) return participants.map((p) => ({ userId: p.userId, winProb: 0.5 }));

  // For each player, predict win against all others and average
  return participants.map((p) => {
    const probs = participants
      .filter((o) => o.userId !== p.userId)
      .map((o) => {
        // predictWin(teamA, teamB) returns probability team A wins
        const prob = predictWin([p.rating], [o.rating]);
        // Normalize to pairwise probability
        return prob;
      });
    const avg = probs.reduce((a, b) => a + b, 0) / (probs.length || 1);
    return { userId: p.userId, winProb: avg };
  });
}