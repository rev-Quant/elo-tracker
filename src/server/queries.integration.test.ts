import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type TestDb, createTestDb } from "@/test/db";
import { makeGame, makeGroupWithMembers } from "@/test/fixtures";
import { daysSinceLastMatch, gamesPlayedBy, leaderboard } from "@/server/groups/queries";
import { history } from "@/server/matches/queries";
import { logMatch } from "@/server/matches/service";
import { profile } from "@/server/users/queries";

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => t?.close());

/** Alice beats Bob `times` times at `gameId`. */
async function aliceBeatsBob(
  slug: string,
  gameId: string,
  alice: string,
  bob: string,
  times = 1,
  matchType: "competitive" | "casual" = "competitive",
) {
  for (let i = 0; i < times; i += 1) {
    await logMatch(
      {
        gameId,
        matchType,
        teamMode: "ffa",
        participants: [
          { userId: alice, rank: 1 },
          { userId: bob, rank: 2 },
        ],
      },
      slug,
      alice,
      t.db,
    );
  }
}

describe("leaderboard", () => {
  it("is empty before anyone plays", async () => {
    const { group } = await makeGroupWithMembers(t.db, 2);
    const game = await makeGame(t.db);
    await expect(leaderboard(group.id, game.id, t.db)).resolves.toEqual([]);
  });

  it("orders by rating with the winner first", async () => {
    const { group, members } = await makeGroupWithMembers(t.db, 2);
    const game = await makeGame(t.db);
    const [alice, bob] = members;
    await aliceBeatsBob(group.slug, game.id, alice.id, bob.id, 2);

    const board = await leaderboard(group.id, game.id, t.db);
    expect(board.map((e) => e.userId)).toEqual([alice.id, bob.id]);
    expect(board[0].rank).toBe(1);
    expect(board[1].rank).toBe(2);
    expect(board[0].wins).toBe(2);
    expect(board[1].losses).toBe(2);
  });

  it("gives tied players the same rank", async () => {
    const { group, members } = await makeGroupWithMembers(t.db, 3);
    const game = await makeGame(t.db);
    const [a, b, c] = members;
    await logMatch(
      {
        gameId: game.id,
        matchType: "competitive",
        teamMode: "ffa",
        participants: [
          { userId: a.id, rank: 1 },
          { userId: b.id, rank: 1 },
          { userId: c.id, rank: 3 },
        ],
      },
      group.slug,
      a.id,
      t.db,
    );

    const board = await leaderboard(group.id, game.id, t.db);
    expect(board[0].rank).toBe(1);
    expect(board[1].rank).toBe(1);
    expect(board[2].rank).toBe(3);
  });

  it("excludes casual play from the competitive board", async () => {
    const { group, members } = await makeGroupWithMembers(t.db, 2);
    const game = await makeGame(t.db);
    const [alice, bob] = members;
    await aliceBeatsBob(group.slug, game.id, alice.id, bob.id, 1, "casual");
    await expect(leaderboard(group.id, game.id, t.db)).resolves.toEqual([]);
  });
});

describe("gamesPlayedBy", () => {
  it("ranks the group's games by how often they're played", async () => {
    const { group, members } = await makeGroupWithMembers(t.db, 2);
    const popular = await makeGame(t.db);
    const rare = await makeGame(t.db);
    const [alice, bob] = members;

    await aliceBeatsBob(group.slug, popular.id, alice.id, bob.id, 3);
    await aliceBeatsBob(group.slug, rare.id, alice.id, bob.id, 1);

    const list = await gamesPlayedBy(group.id, t.db);
    expect(list[0].id).toBe(popular.id);
    expect(list[0].matchCount).toBe(3);
    expect(list[1].matchCount).toBe(1);
  });
});

describe("history", () => {
  it("returns newest first with participants attached", async () => {
    const { group, members } = await makeGroupWithMembers(t.db, 2);
    const game = await makeGame(t.db);
    const [alice, bob] = members;
    await aliceBeatsBob(group.slug, game.id, alice.id, bob.id, 3);

    const page = await history(group.id, {}, t.db);
    expect(page.matches).toHaveLength(3);
    expect(page.nextCursor).toBeNull();
    expect(page.matches[0].participants).toHaveLength(2);
    expect(page.matches[0].participants[0].finalRank).toBe(1);
    expect(page.matches[0].game.id).toBe(game.id);
  });

  it("pages with a keyset cursor and never repeats a row", async () => {
    const { group, members } = await makeGroupWithMembers(t.db, 2);
    const game = await makeGame(t.db);
    const [alice, bob] = members;
    await aliceBeatsBob(group.slug, game.id, alice.id, bob.id, 5);

    const first = await history(group.id, { limit: 2 }, t.db);
    expect(first.matches).toHaveLength(2);
    expect(first.nextCursor).not.toBeNull();

    const second = await history(group.id, { limit: 2, cursor: first.nextCursor! }, t.db);
    const ids = new Set([...first.matches, ...second.matches].map((m) => m.id));
    expect(ids.size).toBe(4);
  });

  it("filters by game", async () => {
    const { group, members } = await makeGroupWithMembers(t.db, 2);
    const chess = await makeGame(t.db);
    const catan = await makeGame(t.db);
    const [alice, bob] = members;
    await aliceBeatsBob(group.slug, chess.id, alice.id, bob.id, 2);
    await aliceBeatsBob(group.slug, catan.id, alice.id, bob.id, 1);

    const page = await history(group.id, { gameId: chess.id }, t.db);
    expect(page.matches).toHaveLength(2);
    expect(page.matches.every((m) => m.game.id === chess.id)).toBe(true);
  });
});

describe("daysSinceLastMatch", () => {
  it("is null for a group that has never played", async () => {
    const { group } = await makeGroupWithMembers(t.db, 2);
    await expect(daysSinceLastMatch(group.id, t.db)).resolves.toBeNull();
  });

  it("is 0 the day a match is logged", async () => {
    const { group, members } = await makeGroupWithMembers(t.db, 2);
    const game = await makeGame(t.db);
    await aliceBeatsBob(group.slug, game.id, members[0].id, members[1].id);
    await expect(daysSinceLastMatch(group.id, t.db)).resolves.toBe(0);
  });
});

describe("profile", () => {
  it("breaks down rating and standing per game", async () => {
    const { group, members } = await makeGroupWithMembers(t.db, 2);
    const game = await makeGame(t.db);
    const [alice, bob] = members;
    await aliceBeatsBob(group.slug, game.id, alice.id, bob.id, 2);

    const p = await profile(alice.id, group.id, t.db);
    expect(p.user.id).toBe(alice.id);
    expect(p.games).toHaveLength(1);
    expect(p.games[0].rank).toBe(1);
    expect(p.games[0].outOf).toBe(2);
    expect(p.games[0].wins).toBe(2);
    expect(p.games[0].losses).toBe(0);

    const loser = await profile(bob.id, group.id, t.db);
    expect(loser.games[0].rank).toBe(2);
    expect(loser.games[0].outOf).toBe(2);
  });

  it("lists the ten most recent matches with win flags", async () => {
    const { group, members } = await makeGroupWithMembers(t.db, 2);
    const game = await makeGame(t.db);
    const [alice, bob] = members;
    await aliceBeatsBob(group.slug, game.id, alice.id, bob.id, 12);

    const p = await profile(alice.id, group.id, t.db);
    expect(p.recentMatches).toHaveLength(10);
    expect(p.recentMatches.every((m) => m.won)).toBe(true);
    expect(p.recentMatches[0].ratingDelta).not.toBeNull();
  });

  it("identifies a nemesis and prey from head-to-head records", async () => {
    const { group, members } = await makeGroupWithMembers(t.db, 3);
    const game = await makeGame(t.db, { maxPlayers: 4 });
    const [me, strong, weak] = members;

    // Lose 3 to `strong`, beat `weak` 3 times.
    for (let i = 0; i < 3; i += 1) {
      await aliceBeatsBob(group.slug, game.id, strong.id, me.id);
      await aliceBeatsBob(group.slug, game.id, me.id, weak.id);
    }

    const p = await profile(me.id, group.id, t.db);
    expect(p.nemesis?.opponentId).toBe(strong.id);
    expect(p.nemesis?.losses).toBe(3);
    expect(p.prey?.opponentId).toBe(weak.id);
    expect(p.prey?.wins).toBe(3);
  });

  it("names no nemesis when there is no losing record", async () => {
    const { group, members } = await makeGroupWithMembers(t.db, 2);
    const game = await makeGame(t.db);
    const [alice, bob] = members;
    await aliceBeatsBob(group.slug, game.id, alice.id, bob.id, 3);

    const p = await profile(alice.id, group.id, t.db);
    expect(p.nemesis).toBeNull();
    expect(p.prey?.opponentId).toBe(bob.id);
  });

  it("is empty but valid for a player who hasn't played", async () => {
    const { group, members } = await makeGroupWithMembers(t.db, 2);
    const p = await profile(members[1].id, group.id, t.db);
    expect(p.games).toEqual([]);
    expect(p.recentMatches).toEqual([]);
    expect(p.nemesis).toBeNull();
    expect(p.prey).toBeNull();
  });
});
