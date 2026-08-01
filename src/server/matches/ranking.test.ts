import { describe, expect, it } from "vitest";
import type { Game } from "@/db/schema";
import { ValidationError } from "@/lib/errors";
import { assertGameSupports, resolveRanks } from "./ranking";

const p = (userId: string, rank: number) => ({ userId, rank });

describe("resolveRanks — full ranking", () => {
  it("passes a clean ordering straight through", () => {
    expect(resolveRanks([p("a", 1), p("b", 2), p("c", 3)], "full")).toEqual([
      { userId: "a", finalRank: 1 },
      { userId: "b", finalRank: 2 },
      { userId: "c", finalRank: 3 },
    ]);
  });

  it("preserves ties as competition ranking", () => {
    expect(resolveRanks([p("a", 1), p("b", 1), p("c", 3)], "full")).toEqual([
      { userId: "a", finalRank: 1 },
      { userId: "b", finalRank: 1 },
      { userId: "c", finalRank: 3 },
    ]);
  });

  it("closes gaps a client left behind", () => {
    expect(resolveRanks([p("a", 10), p("b", 20), p("c", 30)], "full")).toEqual([
      { userId: "a", finalRank: 1 },
      { userId: "b", finalRank: 2 },
      { userId: "c", finalRank: 3 },
    ]);
  });

  it("does not depend on input order", () => {
    expect(resolveRanks([p("c", 3), p("a", 1), p("b", 2)], "full")).toEqual([
      { userId: "c", finalRank: 3 },
      { userId: "a", finalRank: 1 },
      { userId: "b", finalRank: 2 },
    ]);
  });

  it("rejects an all-tied result", () => {
    expect(() => resolveRanks([p("a", 1), p("b", 1)], "full")).toThrow(ValidationError);
  });

  it("rejects a match with fewer than 2 players", () => {
    expect(() => resolveRanks([p("a", 1)], "full")).toThrow(ValidationError);
  });
});

describe("resolveRanks — winner_only (spec §1)", () => {
  it("collapses everyone but the winner to rank 2", () => {
    expect(resolveRanks([p("a", 1), p("b", 2), p("c", 3), p("d", 4)], "winner_only")).toEqual([
      { userId: "a", finalRank: 1 },
      { userId: "b", finalRank: 2 },
      { userId: "c", finalRank: 2 },
      { userId: "d", finalRank: 2 },
    ]);
  });

  it("discards the 2nd/3rd ordering the client happened to send", () => {
    const out = resolveRanks([p("a", 5), p("b", 1), p("c", 9)], "winner_only");
    expect(out).toEqual([
      { userId: "a", finalRank: 2 },
      { userId: "b", finalRank: 1 },
      { userId: "c", finalRank: 2 },
    ]);
  });

  it("rejects two players sharing the winning placement", () => {
    expect(() => resolveRanks([p("a", 1), p("b", 1), p("c", 2)], "winner_only")).toThrow(
      /exactly one/i,
    );
  });

  it("handles a 2-player winner-only game", () => {
    expect(resolveRanks([p("a", 2), p("b", 1)], "winner_only")).toEqual([
      { userId: "a", finalRank: 2 },
      { userId: "b", finalRank: 1 },
    ]);
  });
});

describe("resolveRanks — top_n falls back to full (documented spec gap)", () => {
  it("behaves identically to full ranking", () => {
    expect(resolveRanks([p("a", 1), p("b", 2), p("c", 3)], "top_n")).toEqual(
      resolveRanks([p("a", 1), p("b", 2), p("c", 3)], "full"),
    );
  });
});

const game = (overrides: Partial<Game>): Game =>
  ({
    id: "g",
    name: "Test Game",
    slug: "test-game",
    minPlayers: 2,
    maxPlayers: 4,
    supportsTeams: false,
    supportsFfa: true,
    rankingMode: "full",
    iconUrl: null,
    createdByUserId: null,
    createdAt: new Date(),
    ...overrides,
  }) as Game;

describe("assertGameSupports", () => {
  it("accepts a valid player count", () => {
    expect(() => assertGameSupports(game({}), "ffa", 3)).not.toThrow();
  });

  it("rejects too few players", () => {
    expect(() => assertGameSupports(game({ minPlayers: 3 }), "ffa", 2)).toThrow(/at least 3/);
  });

  it("rejects too many players", () => {
    expect(() => assertGameSupports(game({ maxPlayers: 4 }), "ffa", 5)).toThrow(/at most 4/);
  });

  it("allows an unbounded player count when maxPlayers is null", () => {
    expect(() => assertGameSupports(game({ maxPlayers: null }), "ffa", 50)).not.toThrow();
  });

  it("rejects FFA for a teams-only game (e.g. Pool, Codenames)", () => {
    expect(() =>
      assertGameSupports(game({ supportsFfa: false, supportsTeams: true, name: "Pool" }), "ffa", 2),
    ).toThrow(/isn't played free-for-all/);
  });

  it("rejects teams for an FFA-only game", () => {
    expect(() => assertGameSupports(game({ supportsTeams: false }), "teams", 4)).toThrow(
      /isn't played in teams/,
    );
  });
});
