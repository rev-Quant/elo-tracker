/**
 * Rating engine — OpenSkill (Plackett-Luce).
 *
 * Spec ref: §1 "Rating Engine".
 *
 * The underlying `openskill` package already defaults to exactly the parameters
 * the spec asks for (mu=25, sigma=25/3, beta=25/6, tau=25/300) and to the
 * Plackett-Luce model, so we pass no overrides. They are re-exported here as
 * named constants purely so the values are greppable and assertable in tests.
 */
import { ordinal as osOrdinal, rate as osRate, rating as osRating, predictWin } from "openskill";
export { osOrdinal, osRate, osRating, predictWin };
import type { Rating } from "openskill";

export type { Rating };

/** Library defaults, restated so tests can assert they have not drifted. */
export const MU = 25;
export const SIGMA = 25 / 3;
export const BETA = 25 / 6;
export const TAU = 25 / 300;

/**
 * Conservative-estimate multiplier: ordinal = mu - Z * sigma.
 *
 * Spec §1 specifies Z = 2, which puts a brand-new player at a display rating
 * of 1333. We use the `openskill` default of Z = 3 instead, which puts them at
 * exactly 1000 — the Elo-familiar number the spec says it is aiming for, and
 * one less place where we diverge from the library. Flip this single constant
 * to go back.
 */
export const ORDINAL_Z = 3;

/** display = DISPLAY_BASE + ordinal * DISPLAY_SCALE  (spec §1) */
export const DISPLAY_BASE = 1000;
export const DISPLAY_SCALE = 40;

/** A fresh, never-played rating. */
export function defaultRating(): Rating {
  return osRating();
}

/** Conservative skill estimate: mu - Z * sigma. */
export function ordinal(r: Rating): number {
  return osOrdinal(r, { z: ORDINAL_Z });
}

/** Elo-familiar number shown in the UI. Cached in the DB, never the source of truth. */
export function displayRating(r: Rating): number {
  return DISPLAY_BASE + ordinal(r) * DISPLAY_SCALE;
}

/**
 * One "side" of a match, in the OpenSkill sense.
 * FFA: one side per player. Team mode: one side per team.
 * `rank` is 1-based, lower is better, ties are expressed by repeating a value.
 */
export interface Side<K> {
  members: { key: K; rating: Rating }[];
  rank: number;
}

export interface RatingChange<K> {
  key: K;
  before: Rating;
  after: Rating;
  displayBefore: number;
  displayAfter: number;
  /** displayAfter - displayBefore */
  delta: number;
}

/**
 * Normalise arbitrary rank values into standard competition ranking
 * (1, 2, 2, 4 — "1224"). Accepts any comparable ordering and collapses gaps
 * introduced by callers, while preserving ties.
 *
 * Ranks are only ever used ordinally by OpenSkill, but normalising keeps what
 * we persist to `final_rank` consistent and human-readable.
 */
export function normalizeRanks(ranks: number[]): number[] {
  const sorted = [...new Set(ranks)].sort((a, b) => a - b);
  const countAtOrBelow = new Map<number, number>();
  let seen = 0;
  for (const value of sorted) {
    countAtOrBelow.set(value, seen + 1);
    seen += ranks.filter((r) => r === value).length;
  }
  return ranks.map((r) => countAtOrBelow.get(r)!);
}

/** Ranks for a fully-ordered finish: [1, 2, 3, ... n]. */
export function fullRanks(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i + 1);
}

/**
 * Ranks for a `winner_only` game (spec §1): the winner is rank 1, everybody
 * else is tied at rank 2. No 2nd/3rd place parsing.
 */
export function winnerOnlyRanks(n: number, winnerIndex: number): number[] {
  if (n < 2) throw new RatingError("winner-only ranking needs at least 2 sides");
  if (winnerIndex < 0 || winnerIndex >= n) {
    throw new RatingError(`winnerIndex ${winnerIndex} out of range for ${n} sides`);
  }
  return Array.from({ length: n }, (_, i) => (i === winnerIndex ? 1 : 2));
}

export class RatingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RatingError";
  }
}

/**
 * Run a rated match and return the before/after for every member of every side.
 *
 * Results are returned in input order (side order, then member order within a
 * side). `openskill.rate` sorts internally and unwinds, so callers do not need
 * to pre-sort by rank.
 */
export function rateMatch<K>(sides: Side<K>[]): RatingChange<K>[] {
  if (sides.length < 2) {
    throw new RatingError(`a rated match needs at least 2 sides, got ${sides.length}`);
  }
  for (const [i, side] of sides.entries()) {
    if (side.members.length === 0) {
      throw new RatingError(`side ${i} has no members`);
    }
    if (!Number.isInteger(side.rank) || side.rank < 1) {
      throw new RatingError(`side ${i} has invalid rank ${side.rank}; must be an integer >= 1`);
    }
  }

  const seen = new Set<K>();
  for (const side of sides) {
    for (const m of side.members) {
      if (seen.has(m.key)) {
        throw new RatingError(`duplicate participant ${String(m.key)} in match`);
      }
      seen.add(m.key);
    }
  }

  const ranks = normalizeRanks(sides.map((s) => s.rank));
  if (new Set(ranks).size < 2) {
    throw new RatingError("every side has the same rank; nothing to rate");
  }

  const teams = sides.map((s) => s.members.map((m) => m.rating));
  const rated = osRate(teams, { rank: ranks });

  const changes: RatingChange<K>[] = [];
  for (const [i, side] of sides.entries()) {
    for (const [j, member] of side.members.entries()) {
      const before = member.rating;
      const after = rated[i][j];
      const displayBefore = displayRating(before);
      const displayAfter = displayRating(after);
      changes.push({
        key: member.key,
        before,
        after,
        displayBefore,
        displayAfter,
        delta: displayAfter - displayBefore,
      });
    }
  }
  return changes;
}

/** Convenience wrapper for free-for-all: one player per side. */
export function rateFfa<K>(players: { key: K; rating: Rating; rank: number }[]): RatingChange<K>[] {
  return rateMatch(players.map((p) => ({ members: [{ key: p.key, rating: p.rating }], rank: p.rank })));
}
