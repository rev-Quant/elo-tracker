import { and, eq, inArray, sql } from "drizzle-orm";
import { type Queryable, db as defaultDb } from "@/db";
import {
  type Game,
  type Match,
  currentRatings,
  games,
  groupMembers,
  matchParticipants,
  matchTeams,
  matches,
  ratingSnapshots,
  users,
} from "@/db/schema";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { assertCan } from "@/lib/permissions";
import { type Rating, type RatingChange, defaultRating, displayRating, rateMatch } from "@/lib/rating";
import * as groupsService from "@/server/groups/service";
import { assertGameSupports, resolveRanks } from "./ranking";
import type { LogMatchInput } from "./schemas";

/**
 * Match logging. Spec §3, §11, §15 (teams).
 *
 * AGREED DEVIATION FROM SPEC §3: ratings are applied at log time and the match
 * goes straight to `confirmed`. Undo/dispute (src/server/matches/void.ts)
 * reverses this rather than gating it behind a confirmation quorum, so the
 * leaderboard still moves the instant a result is entered (spec §5).
 *
 * CONCURRENCY: everything runs under a per-group transaction-scoped advisory
 * lock, so two people logging simultaneously cannot read the same "before"
 * rating and lose one of the updates.
 */

export interface ParticipantResult {
  userId: string;
  displayName: string;
  finalRank: number;
  ratingBefore: number | null;
  ratingAfter: number | null;
  ratingDelta: number | null;
}

export interface LoggedMatch {
  match: Match;
  game: Game;
  participants: ParticipantResult[];
}

export async function logMatch(
  input: LogMatchInput,
  groupSlug: string,
  recorderUserId: string,
  db: Queryable = defaultDb,
): Promise<LoggedMatch> {
  const { group, role } = await groupsService.requireMembership(groupSlug, recorderUserId, db);
  assertCan(role, "log_match");

  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${group.id}))`);

    if (input.idempotencyKey) {
      const existing = await findByIdempotencyKey(group.id, input.idempotencyKey, tx);
      if (existing) return existing;
    }

    const [game] = await tx.select().from(games).where(eq(games.id, input.gameId)).limit(1);
    if (!game) throw new NotFoundError("That game doesn't exist.");

    // Build a uniform view regardless of ffa/teams: every user gets a
    // finalRank and, for teams, a teamIndex used only to group them.
    const plan =
      input.teamMode === "ffa"
        ? planFfa(input.participants ?? [], game)
        : planTeams(input.teams ?? [], game);

    await assertAllAreMembers(group.id, plan.userIds, tx);

    const isCompetitive = input.matchType === "competitive";
    // Casual play lives in its own pool so it never moves the competitive
    // leaderboard (spec §1: "No rating impact. Flagged only.").
    const pool = isCompetitive ? "competitive" : "casual";

    const before = await loadRatings(group.id, game.id, plan.userIds, pool, tx);

    const [match] = await tx
      .insert(matches)
      .values({
        gameId: game.id,
        groupId: group.id,
        matchType: input.matchType,
        teamMode: input.teamMode,
        numTeams: input.teamMode === "teams" ? plan.teams!.length : null,
        recordedBy: recorderUserId,
        playedAt: input.playedAt ?? new Date(),
        notes: input.notes ?? null,
        status: "confirmed",
        ratingsApplied: isCompetitive,
        idempotencyKey: input.idempotencyKey ?? null,
      })
      .returning();

    // matchTeams rows, so teammates share a row for display and disputes.
    const teamRowId = new Map<number, string>();
    if (plan.teams) {
      for (const [teamIndex, team] of plan.teams.entries()) {
        const [row] = await tx
          .insert(matchTeams)
          .values({ matchId: match.id, teamIndex, teamName: team.name ?? null, resultRank: team.rank })
          .returning({ id: matchTeams.id });
        teamRowId.set(teamIndex, row.id);
      }
    }

    const changes: Map<string, RatingChange<string>> | null = isCompetitive
      ? new Map(
          rateMatch(
            plan.sides.map((side) => ({
              rank: side.rank,
              members: side.userIds.map((userId) => ({ key: userId, rating: before.get(userId)! })),
            })),
          ).map((c) => [c.key, c]),
        )
      : null;

    const now = new Date();

    for (const userId of plan.userIds) {
      const finalRank = plan.rankOf.get(userId)!;
      const isWin = finalRank === 1;
      const change = changes?.get(userId);
      const priorRating = before.get(userId)!;
      const teamIndex = plan.teamIndexOf?.get(userId);

      await tx.insert(matchParticipants).values({
        matchId: match.id,
        userId,
        finalRank,
        matchTeamId: teamIndex !== undefined ? teamRowId.get(teamIndex) : null,
        ratingBefore: change?.displayBefore ?? null,
        ratingAfter: change?.displayAfter ?? null,
        ratingDelta: change?.delta ?? null,
      });

      if (change) {
        await tx.insert(ratingSnapshots).values({
          userId,
          gameId: game.id,
          groupId: group.id,
          ratingPool: pool,
          matchId: match.id,
          muBefore: change.before.mu,
          muAfter: change.after.mu,
          sigmaBefore: change.before.sigma,
          sigmaAfter: change.after.sigma,
          displayBefore: change.displayBefore,
          displayAfter: change.displayAfter,
          delta: change.delta,
        });
      }

      const after = change?.after ?? priorRating;
      await tx
        .insert(currentRatings)
        .values({
          userId,
          gameId: game.id,
          groupId: group.id,
          ratingPool: pool,
          mu: after.mu,
          sigma: after.sigma,
          displayRating: displayRating(after),
          gamesPlayed: 1,
          wins: isWin ? 1 : 0,
          losses: isWin ? 0 : 1,
          lastPlayedAt: now,
        })
        .onConflictDoUpdate({
          target: [
            currentRatings.userId,
            currentRatings.gameId,
            currentRatings.groupId,
            currentRatings.ratingPool,
          ],
          set: {
            mu: sql`excluded.mu`,
            sigma: sql`excluded.sigma`,
            displayRating: sql`excluded.display_rating`,
            gamesPlayed: sql`${currentRatings.gamesPlayed} + 1`,
            wins: sql`${currentRatings.wins} + ${isWin ? 1 : 0}`,
            losses: sql`${currentRatings.losses} + ${isWin ? 0 : 1}`,
            lastPlayedAt: sql`excluded.last_played_at`,
          },
        });
    }

    return buildResult(match, game, tx);
  });
}

/** Uniform shape both planners produce, consumed by the loop above. */
interface MatchPlan {
  userIds: string[];
  rankOf: Map<string, number>;
  /** Sides passed straight to the OpenSkill engine: one per player (ffa) or per team. */
  sides: { rank: number; userIds: string[] }[];
  teams?: { name?: string; rank: number }[];
  teamIndexOf?: Map<string, number>;
}

function planFfa(participants: { userId: string; rank: number }[], game: Game): MatchPlan {
  assertGameSupports(game, "ffa", participants.length);
  const ranked = resolveRanks(participants, game.rankingMode);
  return {
    userIds: ranked.map((r) => r.userId),
    rankOf: new Map(ranked.map((r) => [r.userId, r.finalRank])),
    sides: ranked.map((r) => ({ rank: r.finalRank, userIds: [r.userId] })),
  };
}

function planTeams(
  teams: { name?: string; rank: number; userIds: string[] }[],
  game: Game,
): MatchPlan {
  const userIds = teams.flatMap((t) => t.userIds);
  assertGameSupports(game, "teams", userIds.length);

  // Reuse the individual ranking resolver by keying on team index — it
  // already handles ties and closes gaps (spec §1).
  const resolved = resolveRanks(
    teams.map((t, i) => ({ userId: String(i), rank: t.rank })),
    game.rankingMode,
  );
  const rankByTeamIndex = new Map(resolved.map((r) => [Number(r.userId), r.finalRank]));

  const rankOf = new Map<string, number>();
  const teamIndexOf = new Map<string, number>();
  for (const [i, team] of teams.entries()) {
    for (const userId of team.userIds) {
      rankOf.set(userId, rankByTeamIndex.get(i)!);
      teamIndexOf.set(userId, i);
    }
  }

  return {
    userIds,
    rankOf,
    sides: teams.map((t, i) => ({ rank: rankByTeamIndex.get(i)!, userIds: t.userIds })),
    teams: teams.map((t, i) => ({ name: t.name, rank: rankByTeamIndex.get(i)! })),
    teamIndexOf,
  };
}

/** All participants must belong to the group. Spec §9 makes the group the trust boundary. */
async function assertAllAreMembers(groupId: string, userIds: string[], db: Queryable): Promise<void> {
  const rows = await db
    .select({ userId: groupMembers.userId })
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), inArray(groupMembers.userId, userIds)));

  const present = new Set(rows.map((r) => r.userId));
  const missing = userIds.filter((id) => !present.has(id));
  if (missing.length > 0) {
    throw new ValidationError(
      missing.length === 1
        ? "One of those players isn't in this group."
        : `${missing.length} of those players aren't in this group.`,
    );
  }
}

/** Current ratings for the given players, defaulting anyone who hasn't played yet. */
async function loadRatings(
  groupId: string,
  gameId: string,
  userIds: string[],
  pool: "competitive" | "casual",
  db: Queryable,
): Promise<Map<string, Rating>> {
  const rows = await db
    .select({ userId: currentRatings.userId, mu: currentRatings.mu, sigma: currentRatings.sigma })
    .from(currentRatings)
    .where(
      and(
        eq(currentRatings.groupId, groupId),
        eq(currentRatings.gameId, gameId),
        eq(currentRatings.ratingPool, pool),
        inArray(currentRatings.userId, userIds),
      ),
    );

  const map = new Map<string, Rating>(rows.map((r) => [r.userId, { mu: r.mu, sigma: r.sigma }]));
  for (const userId of userIds) {
    if (!map.has(userId)) map.set(userId, defaultRating());
  }
  return map;
}

async function findByIdempotencyKey(
  groupId: string,
  key: string,
  db: Queryable,
): Promise<LoggedMatch | null> {
  const [match] = await db
    .select()
    .from(matches)
    .where(and(eq(matches.groupId, groupId), eq(matches.idempotencyKey, key)))
    .limit(1);
  if (!match) return null;

  const [game] = await db.select().from(games).where(eq(games.id, match.gameId)).limit(1);
  return buildResult(match, game, db);
}

/** Load a match's game and participants. Used by void.ts after a status change. */
export async function buildLoggedMatch(match: Match, db: Queryable): Promise<LoggedMatch> {
  const [game] = await db.select().from(games).where(eq(games.id, match.gameId)).limit(1);
  return buildResult(match, game, db);
}

async function buildResult(match: Match, game: Game, db: Queryable): Promise<LoggedMatch> {
  const participants = await db
    .select({
      userId: matchParticipants.userId,
      displayName: users.displayName,
      finalRank: matchParticipants.finalRank,
      ratingBefore: matchParticipants.ratingBefore,
      ratingAfter: matchParticipants.ratingAfter,
      ratingDelta: matchParticipants.ratingDelta,
    })
    .from(matchParticipants)
    .innerJoin(users, eq(users.id, matchParticipants.userId))
    .where(eq(matchParticipants.matchId, match.id))
    .orderBy(matchParticipants.finalRank);

  return {
    match,
    game,
    participants: participants.map((p) => ({ ...p, finalRank: p.finalRank ?? 0 })),
  };
}
