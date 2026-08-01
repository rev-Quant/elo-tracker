import type { Game } from "@/db/schema";
import { ValidationError } from "@/lib/errors";
import { normalizeRanks } from "@/lib/rating";

/**
 * Turn the placements a client submitted into the canonical `final_rank`
 * values we persist and feed to OpenSkill.
 *
 * Pure, so it can be exhaustively tested without a database.
 */

export interface RankedParticipant {
  userId: string;
  finalRank: number;
}

export type RankingMode = Game["rankingMode"];

/**
 * SPEC GAP: §2 defines a 'top_n' ranking mode but never says what n is, how a
 * client submits it, or how players outside the top n should be rated. No game
 * in the §12 catalog uses it. It is therefore treated exactly like 'full'
 * until the product decides what it means.
 */
export function resolveRanks(
  participants: readonly { userId: string; rank: number }[],
  mode: RankingMode,
): RankedParticipant[] {
  if (participants.length < 2) {
    throw new ValidationError("A match needs at least 2 players.");
  }

  if (mode === "winner_only") {
    return resolveWinnerOnly(participants);
  }

  const normalized = normalizeRanks(participants.map((p) => p.rank));
  if (new Set(normalized).size < 2) {
    throw new ValidationError("Every player has the same placement — there's no result to record.");
  }
  return participants.map((p, i) => ({ userId: p.userId, finalRank: normalized[i] }));
}

/**
 * Winner-only games (Monopoly Deal, Codenames). Spec §1: "Winner gets rank 1.
 * All other players get rank 2 (tied). No 2nd/3rd parsing."
 *
 * The lowest submitted placement identifies the winner, so a client that
 * simply sends a full ordering still produces the correct result.
 */
function resolveWinnerOnly(
  participants: readonly { userId: string; rank: number }[],
): RankedParticipant[] {
  const best = Math.min(...participants.map((p) => p.rank));
  const winners = participants.filter((p) => p.rank === best);

  if (winners.length !== 1) {
    throw new ValidationError("This game records a single winner. Please pick exactly one.");
  }

  return participants.map((p) => ({
    userId: p.userId,
    finalRank: p.rank === best ? 1 : 2,
  }));
}

/** Enforce the game's player-count bounds and supported modes. Spec §12. */
export function assertGameSupports(
  game: Game,
  teamMode: "ffa" | "teams",
  participantCount: number,
): void {
  if (teamMode === "ffa" && !game.supportsFfa) {
    throw new ValidationError(`${game.name} isn't played free-for-all. Record it as teams instead.`);
  }
  if (teamMode === "teams" && !game.supportsTeams) {
    throw new ValidationError(`${game.name} isn't played in teams.`);
  }
  if (participantCount < game.minPlayers) {
    throw new ValidationError(`${game.name} needs at least ${game.minPlayers} players.`);
  }
  if (game.maxPlayers !== null && participantCount > game.maxPlayers) {
    throw new ValidationError(`${game.name} supports at most ${game.maxPlayers} players.`);
  }
}
