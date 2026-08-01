import { describe, expect, it } from "vitest";
import {
  BETA,
  DISPLAY_BASE,
  DISPLAY_SCALE,
  MU,
  ORDINAL_Z,
  RatingError,
  SIGMA,
  TAU,
  defaultRating,
  displayRating,
  fullRanks,
  normalizeRanks,
  ordinal,
  rateFfa,
  rateMatch,
  winnerOnlyRanks,
} from "./rating";

describe("library defaults have not drifted (spec §1)", () => {
  it("uses the spec's starting parameters", () => {
    const r = defaultRating();
    expect(r.mu).toBe(MU);
    expect(r.sigma).toBeCloseTo(SIGMA, 10);
    expect(MU).toBe(25);
    expect(SIGMA).toBeCloseTo(8.3333, 4);
    expect(BETA).toBeCloseTo(4.1667, 4);
    expect(TAU).toBeCloseTo(0.0833, 4);
  });
});

describe("ordinal + display rating", () => {
  it("computes ordinal as mu - Z*sigma", () => {
    expect(ordinal({ mu: 30, sigma: 5 })).toBeCloseTo(30 - ORDINAL_Z * 5, 10);
  });

  it("maps ordinal onto the display scale", () => {
    const r = { mu: 30, sigma: 5 };
    expect(displayRating(r)).toBeCloseTo(DISPLAY_BASE + ordinal(r) * DISPLAY_SCALE, 10);
  });

  it("gives a new player the documented starting display rating", () => {
    // With ORDINAL_Z = 2 this is 1333.33; with Z = 3 it would be exactly 1000.
    const expected = DISPLAY_BASE + (MU - ORDINAL_Z * SIGMA) * DISPLAY_SCALE;
    expect(displayRating(defaultRating())).toBeCloseTo(expected, 6);
  });
});

describe("normalizeRanks", () => {
  it("is a no-op on already-standard ranks", () => {
    expect(normalizeRanks([1, 2, 3, 4])).toEqual([1, 2, 3, 4]);
  });

  it("preserves ties using competition ranking (1224)", () => {
    expect(normalizeRanks([1, 1, 3, 4])).toEqual([1, 1, 3, 4]);
    expect(normalizeRanks([1, 2, 2])).toEqual([1, 2, 2]);
  });

  it("collapses arbitrary gaps while preserving order and ties", () => {
    expect(normalizeRanks([5, 9, 9, 2])).toEqual([2, 3, 3, 1]);
    expect(normalizeRanks([10, 20, 30])).toEqual([1, 2, 3]);
  });
});

describe("rank builders", () => {
  it("fullRanks produces a strict ordering", () => {
    expect(fullRanks(4)).toEqual([1, 2, 3, 4]);
  });

  it("winnerOnlyRanks ties everyone but the winner at 2 (spec §1)", () => {
    expect(winnerOnlyRanks(4, 0)).toEqual([1, 2, 2, 2]);
    expect(winnerOnlyRanks(3, 2)).toEqual([2, 2, 1]);
  });

  it("rejects an out-of-range winner", () => {
    expect(() => winnerOnlyRanks(3, 3)).toThrow(RatingError);
  });
});

describe("rateFfa", () => {
  it("moves the winner up and the loser down", () => {
    const [a, b] = rateFfa([
      { key: "a", rating: defaultRating(), rank: 1 },
      { key: "b", rating: defaultRating(), rank: 2 },
    ]);
    expect(a.after.mu).toBeGreaterThan(a.before.mu);
    expect(b.after.mu).toBeLessThan(b.before.mu);
    expect(a.delta).toBeGreaterThan(0);
    expect(b.delta).toBeLessThan(0);
  });

  it("is zero-sum in mu for an even 1v1", () => {
    const [a, b] = rateFfa([
      { key: "a", rating: defaultRating(), rank: 1 },
      { key: "b", rating: defaultRating(), rank: 2 },
    ]);
    expect(a.after.mu + b.after.mu).toBeCloseTo(2 * MU, 6);
  });

  it("returns results in input order, not rank order", () => {
    const out = rateFfa([
      { key: "last", rating: defaultRating(), rank: 3 },
      { key: "first", rating: defaultRating(), rank: 1 },
      { key: "middle", rating: defaultRating(), rank: 2 },
    ]);
    expect(out.map((c) => c.key)).toEqual(["last", "first", "middle"]);
    const byKey = Object.fromEntries(out.map((c) => [c.key, c]));
    expect(byKey.first.after.mu).toBeGreaterThan(byKey.middle.after.mu);
    expect(byKey.middle.after.mu).toBeGreaterThan(byKey.last.after.mu);
  });

  it("orders a 4-player FFA monotonically by finish position", () => {
    const out = rateFfa(
      ["p1", "p2", "p3", "p4"].map((key, i) => ({ key, rating: defaultRating(), rank: i + 1 })),
    );
    const mus = out.map((c) => c.after.mu);
    for (let i = 1; i < mus.length; i += 1) {
      expect(mus[i - 1]).toBeGreaterThan(mus[i]);
    }
  });

  it("treats tied players identically", () => {
    const out = rateFfa([
      { key: "a", rating: defaultRating(), rank: 1 },
      { key: "b", rating: defaultRating(), rank: 1 },
      { key: "c", rating: defaultRating(), rank: 3 },
    ]);
    const [a, b, c] = out;
    expect(a.after.mu).toBeCloseTo(b.after.mu, 10);
    expect(a.after.sigma).toBeCloseTo(b.after.sigma, 10);
    expect(a.after.mu).toBeGreaterThan(c.after.mu);
  });

  it("rewards an upset more than an expected win", () => {
    const strong = { mu: 40, sigma: 2 };
    const weak = { mu: 10, sigma: 2 };

    const upset = rateFfa([
      { key: "weak", rating: weak, rank: 1 },
      { key: "strong", rating: strong, rank: 2 },
    ]);
    const expectedResult = rateFfa([
      { key: "strong", rating: strong, rank: 1 },
      { key: "weak", rating: weak, rank: 2 },
    ]);

    const upsetGain = upset[0].after.mu - weak.mu;
    const expectedGain = expectedResult[0].after.mu - strong.mu;
    expect(upsetGain).toBeGreaterThan(expectedGain);
  });

  it("shrinks sigma as evidence accumulates", () => {
    let rating = defaultRating();
    const start = rating.sigma;
    for (let i = 0; i < 10; i += 1) {
      rating = rateFfa([
        { key: "me", rating, rank: 1 },
        { key: "them", rating: defaultRating(), rank: 2 },
      ])[0].after;
    }
    expect(rating.sigma).toBeLessThan(start);
  });
});

describe("rateMatch (teams)", () => {
  it("moves both members of the winning team up", () => {
    const out = rateMatch([
      { members: [{ key: "a1", rating: defaultRating() }, { key: "a2", rating: defaultRating() }], rank: 1 },
      { members: [{ key: "b1", rating: defaultRating() }, { key: "b2", rating: defaultRating() }], rank: 2 },
    ]);
    expect(out.map((c) => c.key)).toEqual(["a1", "a2", "b1", "b2"]);
    expect(out[0].delta).toBeGreaterThan(0);
    expect(out[1].delta).toBeGreaterThan(0);
    expect(out[2].delta).toBeLessThan(0);
    expect(out[3].delta).toBeLessThan(0);
  });

  it("handles 2v2v2 multi-team ranking", () => {
    const team = (n: string) => [{ key: `${n}1`, rating: defaultRating() }, { key: `${n}2`, rating: defaultRating() }];
    const out = rateMatch([
      { members: team("a"), rank: 1 },
      { members: team("b"), rank: 2 },
      { members: team("c"), rank: 3 },
    ]);
    const mu = (k: string) => out.find((c) => c.key === k)!.after.mu;
    expect(mu("a1")).toBeGreaterThan(mu("b1"));
    expect(mu("b1")).toBeGreaterThan(mu("c1"));
  });

  it("carries a weak teammate: the weak player gains from a win", () => {
    const out = rateMatch([
      {
        members: [
          { key: "strong", rating: { mu: 40, sigma: 3 } },
          { key: "weak", rating: { mu: 12, sigma: 3 } },
        ],
        rank: 1,
      },
      {
        members: [
          { key: "avg1", rating: defaultRating() },
          { key: "avg2", rating: defaultRating() },
        ],
        rank: 2,
      },
    ]);
    expect(out.find((c) => c.key === "weak")!.after.mu).toBeGreaterThan(12);
  });
});

describe("validation", () => {
  it("rejects a match with fewer than two sides", () => {
    expect(() => rateFfa([{ key: "a", rating: defaultRating(), rank: 1 }])).toThrow(RatingError);
  });

  it("rejects an empty side", () => {
    expect(() =>
      rateMatch([{ members: [], rank: 1 }, { members: [{ key: "b", rating: defaultRating() }], rank: 2 }]),
    ).toThrow(/no members/);
  });

  it("rejects duplicate participants", () => {
    expect(() =>
      rateFfa([
        { key: "a", rating: defaultRating(), rank: 1 },
        { key: "a", rating: defaultRating(), rank: 2 },
      ]),
    ).toThrow(/duplicate participant/);
  });

  it("rejects a match where every side is tied", () => {
    expect(() =>
      rateFfa([
        { key: "a", rating: defaultRating(), rank: 1 },
        { key: "b", rating: defaultRating(), rank: 1 },
      ]),
    ).toThrow(/nothing to rate/);
  });

  it("rejects a non-integer or sub-1 rank", () => {
    expect(() =>
      rateFfa([
        { key: "a", rating: defaultRating(), rank: 0 },
        { key: "b", rating: defaultRating(), rank: 1 },
      ]),
    ).toThrow(/invalid rank/);
  });
});
