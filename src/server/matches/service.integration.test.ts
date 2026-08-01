import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { currentRatings, matchParticipants, ratingSnapshots } from "@/db/schema";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { DISPLAY_BASE, MU, ORDINAL_Z, SIGMA, defaultRating, displayRating } from "@/lib/rating";
import * as groupsService from "@/server/groups/service";
import { type TestDb, createTestDb } from "@/test/db";
import { makeGame, makeGroupWithMembers, makeUser } from "@/test/fixtures";
import { logMatch } from "./service";

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => t?.close());

const STARTING_DISPLAY = DISPLAY_BASE + (MU - ORDINAL_Z * SIGMA) * 40;

/** Read a player's current rating row for a game in a group. */
async function ratingRow(
  groupId: string,
  gameId: string,
  userId: string,
  pool: "competitive" | "casual" = "competitive",
) {
  const [row] = await t.db
    .select()
    .from(currentRatings)
    .where(
      and(
        eq(currentRatings.groupId, groupId),
        eq(currentRatings.gameId, gameId),
        eq(currentRatings.userId, userId),
        eq(currentRatings.ratingPool, pool),
      ),
    );
  return row ?? null;
}

describe("logMatch — competitive FFA", () => {
  it("records the match as confirmed with ratings applied", async () => {
    const { group, members } = await makeGroupWithMembers(t.db, 2);
    const game = await makeGame(t.db);
    const [alice, bob] = members;

    const result = await logMatch(
      {
        gameId: game.id,
        matchType: "competitive",
        teamMode: "ffa",
        participants: [
          { userId: alice.id, rank: 1 },
          { userId: bob.id, rank: 2 },
        ],
      },
      group.slug,
      alice.id,
      t.db,
    );

    expect(result.match.status).toBe("confirmed");
    expect(result.match.ratingsApplied).toBe(true);
    expect(result.match.teamMode).toBe("ffa");
    expect(result.match.numTeams).toBeNull();
    expect(result.participants).toHaveLength(2);
  });

  it("moves the winner up and the loser down, starting from the documented baseline", async () => {
    const { group, members } = await makeGroupWithMembers(t.db, 2);
    const game = await makeGame(t.db);
    const [alice, bob] = members;

    const result = await logMatch(
      {
        gameId: game.id,
        matchType: "competitive",
        teamMode: "ffa",
        participants: [
          { userId: alice.id, rank: 1 },
          { userId: bob.id, rank: 2 },
        ],
      },
      group.slug,
      alice.id,
      t.db,
    );

    const winner = result.participants.find((p) => p.userId === alice.id)!;
    const loser = result.participants.find((p) => p.userId === bob.id)!;

    expect(winner.ratingBefore).toBeCloseTo(STARTING_DISPLAY, 4);
    expect(loser.ratingBefore).toBeCloseTo(STARTING_DISPLAY, 4);
    expect(winner.ratingDelta!).toBeGreaterThan(0);
    expect(loser.ratingDelta!).toBeLessThan(0);
    expect(winner.ratingAfter!).toBeCloseTo(winner.ratingBefore! + winner.ratingDelta!, 6);
  });

  it("persists current_ratings with win/loss counters", async () => {
    const { group, members } = await makeGroupWithMembers(t.db, 2);
    const game = await makeGame(t.db);
    const [alice, bob] = members;

    await logMatch(
      {
        gameId: game.id,
        matchType: "competitive",
        teamMode: "ffa",
        participants: [
          { userId: alice.id, rank: 1 },
          { userId: bob.id, rank: 2 },
        ],
      },
      group.slug,
      alice.id,
      t.db,
    );

    const winner = await ratingRow(group.id, game.id, alice.id);
    const loser = await ratingRow(group.id, game.id, bob.id);

    expect(winner!.gamesPlayed).toBe(1);
    expect(winner!.wins).toBe(1);
    expect(winner!.losses).toBe(0);
    expect(loser!.wins).toBe(0);
    expect(loser!.losses).toBe(1);

    // display_rating must stay consistent with the stored mu/sigma.
    expect(winner!.displayRating).toBeCloseTo(
      displayRating({ mu: winner!.mu, sigma: winner!.sigma }),
      6,
    );
    expect(winner!.displayRating).toBeGreaterThan(loser!.displayRating);
    expect(winner!.lastPlayedAt).toBeInstanceOf(Date);
  });

  it("accumulates counters across several matches", async () => {
    const { group, members } = await makeGroupWithMembers(t.db, 2);
    const game = await makeGame(t.db);
    const [alice, bob] = members;

    for (let i = 0; i < 3; i += 1) {
      await logMatch(
        {
          gameId: game.id,
          matchType: "competitive",
          teamMode: "ffa",
          participants: [
            { userId: alice.id, rank: 1 },
            { userId: bob.id, rank: 2 },
          ],
        },
        group.slug,
        alice.id,
        t.db,
      );
    }

    const winner = await ratingRow(group.id, game.id, alice.id);
    expect(winner!.gamesPlayed).toBe(3);
    expect(winner!.wins).toBe(3);
    expect(winner!.losses).toBe(0);
    expect(winner!.displayRating).toBeGreaterThan(STARTING_DISPLAY);
  });

  it("chains ratings: each match starts where the last one ended", async () => {
    const { group, members } = await makeGroupWithMembers(t.db, 2);
    const game = await makeGame(t.db);
    const [alice, bob] = members;

    const play = () =>
      logMatch(
        {
          gameId: game.id,
          matchType: "competitive",
          teamMode: "ffa",
          participants: [
            { userId: alice.id, rank: 1 },
            { userId: bob.id, rank: 2 },
          ],
        },
        group.slug,
        alice.id,
        t.db,
      );

    const first = await play();
    const second = await play();

    const firstAfter = first.participants.find((p) => p.userId === alice.id)!.ratingAfter!;
    const secondBefore = second.participants.find((p) => p.userId === alice.id)!.ratingBefore!;
    expect(secondBefore).toBeCloseTo(firstAfter, 6);
  });

  it("writes an immutable snapshot per participant", async () => {
    const { group, members } = await makeGroupWithMembers(t.db, 3);
    const game = await makeGame(t.db);

    const result = await logMatch(
      {
        gameId: game.id,
        matchType: "competitive",
        teamMode: "ffa",
        participants: members.map((m, i) => ({ userId: m.id, rank: i + 1 })),
      },
      group.slug,
      members[0].id,
      t.db,
    );

    const snapshots = await t.db
      .select()
      .from(ratingSnapshots)
      .where(eq(ratingSnapshots.matchId, result.match.id));

    expect(snapshots).toHaveLength(3);
    for (const s of snapshots) {
      expect(s.delta).toBeCloseTo(s.displayAfter - s.displayBefore, 6);
      expect(s.isReversal).toBe(false);
      expect(s.ratingPool).toBe("competitive");
      // Every rated match adds information, but tau can nudge sigma; mu must move.
      expect(s.muAfter).not.toBe(s.muBefore);
    }
  });

  it("orders a 4-player FFA correctly", async () => {
    const { group, members } = await makeGroupWithMembers(t.db, 4);
    const game = await makeGame(t.db);

    await logMatch(
      {
        gameId: game.id,
        matchType: "competitive",
        teamMode: "ffa",
        participants: members.map((m, i) => ({ userId: m.id, rank: i + 1 })),
      },
      group.slug,
      members[0].id,
      t.db,
    );

    const ratings = await Promise.all(members.map((m) => ratingRow(group.id, game.id, m.id)));
    for (let i = 1; i < ratings.length; i += 1) {
      expect(ratings[i - 1]!.displayRating).toBeGreaterThan(ratings[i]!.displayRating);
    }
  });

  it("treats tied players identically", async () => {
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

    const ra = await ratingRow(group.id, game.id, a.id);
    const rb = await ratingRow(group.id, game.id, b.id);
    expect(ra!.displayRating).toBeCloseTo(rb!.displayRating, 6);
    // Both tied players count as winners for the W/L record.
    expect(ra!.wins).toBe(1);
    expect(rb!.wins).toBe(1);
  });
});

describe("logMatch — winner_only games (spec §1)", () => {
  it("collapses placings so only the winner is distinguished", async () => {
    const { group, members } = await makeGroupWithMembers(t.db, 4);
    const game = await makeGame(t.db, { rankingMode: "winner_only", maxPlayers: 5 });

    const result = await logMatch(
      {
        gameId: game.id,
        matchType: "competitive",
        teamMode: "ffa",
        participants: members.map((m, i) => ({ userId: m.id, rank: i + 1 })),
      },
      group.slug,
      members[0].id,
      t.db,
    );

    const stored = await t.db
      .select()
      .from(matchParticipants)
      .where(eq(matchParticipants.matchId, result.match.id));

    expect(stored.filter((p) => p.finalRank === 1)).toHaveLength(1);
    expect(stored.filter((p) => p.finalRank === 2)).toHaveLength(3);

    // The three losers are indistinguishable, so their deltas must be equal.
    const loserDeltas = stored.filter((p) => p.finalRank === 2).map((p) => p.ratingDelta!);
    for (const d of loserDeltas) expect(d).toBeCloseTo(loserDeltas[0], 6);
  });
});

describe("logMatch — casual matches (spec §11)", () => {
  it("does not touch the competitive pool and writes no snapshots", async () => {
    const { group, members } = await makeGroupWithMembers(t.db, 2);
    const game = await makeGame(t.db);
    const [alice, bob] = members;

    const result = await logMatch(
      {
        gameId: game.id,
        matchType: "casual",
        teamMode: "ffa",
        participants: [
          { userId: alice.id, rank: 1 },
          { userId: bob.id, rank: 2 },
        ],
      },
      group.slug,
      alice.id,
      t.db,
    );

    expect(result.match.status).toBe("confirmed");
    expect(result.match.ratingsApplied).toBe(false);

    for (const p of result.participants) {
      expect(p.ratingBefore).toBeNull();
      expect(p.ratingAfter).toBeNull();
      expect(p.ratingDelta).toBeNull();
    }

    const snapshots = await t.db
      .select()
      .from(ratingSnapshots)
      .where(eq(ratingSnapshots.matchId, result.match.id));
    expect(snapshots).toHaveLength(0);

    // No competitive rating row was created at all.
    expect(await ratingRow(group.id, game.id, alice.id, "competitive")).toBeNull();

    // Stats are still tracked, in the casual pool.
    const casual = await ratingRow(group.id, game.id, alice.id, "casual");
    expect(casual!.gamesPlayed).toBe(1);
    expect(casual!.wins).toBe(1);
    expect(casual!.mu).toBeCloseTo(defaultRating().mu, 10);
  });

  it("leaves an existing competitive rating untouched", async () => {
    const { group, members } = await makeGroupWithMembers(t.db, 2);
    const game = await makeGame(t.db);
    const [alice, bob] = members;

    const participants = [
      { userId: alice.id, rank: 1 },
      { userId: bob.id, rank: 2 },
    ];

    await logMatch(
      { gameId: game.id, matchType: "competitive", teamMode: "ffa", participants },
      group.slug,
      alice.id,
      t.db,
    );
    const before = await ratingRow(group.id, game.id, alice.id);

    await logMatch(
      { gameId: game.id, matchType: "casual", teamMode: "ffa", participants },
      group.slug,
      alice.id,
      t.db,
    );
    const after = await ratingRow(group.id, game.id, alice.id);

    expect(after!.displayRating).toBe(before!.displayRating);
    expect(after!.gamesPlayed).toBe(before!.gamesPlayed);
  });
});

describe("logMatch — idempotency (spec §10)", () => {
  it("returns the original match instead of logging twice", async () => {
    const { group, members } = await makeGroupWithMembers(t.db, 2);
    const game = await makeGame(t.db);
    const [alice, bob] = members;
    const key = "22222222-2222-4222-8222-222222222222";

    const input = {
      gameId: game.id,
      matchType: "competitive" as const,
      teamMode: "ffa" as const,
      participants: [
        { userId: alice.id, rank: 1 },
        { userId: bob.id, rank: 2 },
      ],
      idempotencyKey: key,
    };

    const first = await logMatch(input, group.slug, alice.id, t.db);
    const second = await logMatch(input, group.slug, alice.id, t.db);

    expect(second.match.id).toBe(first.match.id);

    // Critically, the rating must not have been applied twice.
    const rating = await ratingRow(group.id, game.id, alice.id);
    expect(rating!.gamesPlayed).toBe(1);
  });
});

describe("logMatch — validation", () => {
  it("rejects a player who isn't in the group", async () => {
    const { group, members } = await makeGroupWithMembers(t.db, 2);
    const game = await makeGame(t.db);
    const outsider = await makeUser(t.db);

    await expect(
      logMatch(
        {
          gameId: game.id,
          matchType: "competitive",
          teamMode: "ffa",
          participants: [
            { userId: members[0].id, rank: 1 },
            { userId: outsider.id, rank: 2 },
          ],
        },
        group.slug,
        members[0].id,
        t.db,
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects a spectator trying to log (spec §6)", async () => {
    const { group, members } = await makeGroupWithMembers(t.db, 2);
    const game = await makeGame(t.db);
    const [owner, other] = members;
    await groupsService.changeMemberRole(group.id, owner.id, "owner", other.id, "spectator", t.db);

    await expect(
      logMatch(
        {
          gameId: game.id,
          matchType: "competitive",
          teamMode: "ffa",
          participants: [
            { userId: owner.id, rank: 1 },
            { userId: other.id, rank: 2 },
          ],
        },
        group.slug,
        other.id,
        t.db,
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("rejects a non-member trying to log", async () => {
    const { group, members } = await makeGroupWithMembers(t.db, 2);
    const game = await makeGame(t.db);
    const outsider = await makeUser(t.db);

    await expect(
      logMatch(
        {
          gameId: game.id,
          matchType: "competitive",
          teamMode: "ffa",
          participants: members.map((m, i) => ({ userId: m.id, rank: i + 1 })),
        },
        group.slug,
        outsider.id,
        t.db,
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rejects too few players for the game", async () => {
    const { group, members } = await makeGroupWithMembers(t.db, 2);
    const game = await makeGame(t.db, { minPlayers: 3 });

    await expect(
      logMatch(
        {
          gameId: game.id,
          matchType: "competitive",
          teamMode: "ffa",
          participants: members.map((m, i) => ({ userId: m.id, rank: i + 1 })),
        },
        group.slug,
        members[0].id,
        t.db,
      ),
    ).rejects.toThrow(/at least 3 players/);
  });

  it("rejects FFA for a teams-only game", async () => {
    const { group, members } = await makeGroupWithMembers(t.db, 2);
    const game = await makeGame(t.db, { supportsFfa: false, supportsTeams: true, name: "Pool" });

    await expect(
      logMatch(
        {
          gameId: game.id,
          matchType: "competitive",
          teamMode: "ffa",
          participants: members.map((m, i) => ({ userId: m.id, rank: i + 1 })),
        },
        group.slug,
        members[0].id,
        t.db,
      ),
    ).rejects.toThrow(/free-for-all/);
  });

  it("404s on an unknown game", async () => {
    const { group, members } = await makeGroupWithMembers(t.db, 2);
    await expect(
      logMatch(
        {
          gameId: "00000000-0000-4000-8000-000000000000",
          matchType: "competitive",
          teamMode: "ffa",
          participants: members.map((m, i) => ({ userId: m.id, rank: i + 1 })),
        },
        group.slug,
        members[0].id,
        t.db,
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rolls back everything when a match fails partway", async () => {
    const { group, members } = await makeGroupWithMembers(t.db, 2);
    const game = await makeGame(t.db, { minPlayers: 5 });

    await expect(
      logMatch(
        {
          gameId: game.id,
          matchType: "competitive",
          teamMode: "ffa",
          participants: members.map((m, i) => ({ userId: m.id, rank: i + 1 })),
        },
        group.slug,
        members[0].id,
        t.db,
      ),
    ).rejects.toThrow();

    // No orphaned rating rows.
    expect(await ratingRow(group.id, game.id, members[0].id)).toBeNull();
  });
});

describe("logMatch — rating isolation", () => {
  it("keeps ratings separate per game", async () => {
    const { group, members } = await makeGroupWithMembers(t.db, 2);
    const chess = await makeGame(t.db);
    const catan = await makeGame(t.db);
    const [alice, bob] = members;

    await logMatch(
      {
        gameId: chess.id,
        matchType: "competitive",
        teamMode: "ffa",
        participants: [
          { userId: alice.id, rank: 1 },
          { userId: bob.id, rank: 2 },
        ],
      },
      group.slug,
      alice.id,
      t.db,
    );

    expect(await ratingRow(group.id, chess.id, alice.id)).not.toBeNull();
    expect(await ratingRow(group.id, catan.id, alice.id)).toBeNull();
  });

  it("keeps ratings separate per group (spec §2.1)", async () => {
    const owner = await makeUser(t.db);
    const other = await makeUser(t.db);
    const game = await makeGame(t.db);

    const groupA = await makeGroupWithMembers(t.db, 2);
    const groupB = await makeGroupWithMembers(t.db, 2);

    await logMatch(
      {
        gameId: game.id,
        matchType: "competitive",
        teamMode: "ffa",
        participants: [
          { userId: groupA.members[0].id, rank: 1 },
          { userId: groupA.members[1].id, rank: 2 },
        ],
      },
      groupA.group.slug,
      groupA.members[0].id,
      t.db,
    );

    expect(await ratingRow(groupA.group.id, game.id, groupA.members[0].id)).not.toBeNull();
    expect(await ratingRow(groupB.group.id, game.id, groupA.members[0].id)).toBeNull();
    void owner;
    void other;
  });
});
