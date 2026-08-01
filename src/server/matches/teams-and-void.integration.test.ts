import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ConflictError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { type TestDb, createTestDb } from "@/test/db";
import { makeGame, makeGroupWithMembers, makeUser } from "@/test/fixtures";
import { logMatch } from "./service";
import { UNDO_WINDOW_MS, voidMatch } from "./void";

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => t?.close());

describe("logMatch — teams", () => {
  it("groups teammates so weak players are carried by a strong teammate", async () => {
    const { group, members } = await makeGroupWithMembers(t.db, 4);
    const game = await makeGame(t.db, { supportsTeams: true, supportsFfa: false, maxPlayers: 4 });
    const [a1, a2, b1, b2] = members;

    // a1 and a2 win as a team; the weaker/newer member still gains rating
    // because OpenSkill attributes the win to the team, not just the top player.
    const result = await logMatch(
      {
        gameId: game.id,
        matchType: "competitive",
        teamMode: "teams",
        teams: [
          { rank: 1, userIds: [a1.id, a2.id] },
          { rank: 2, userIds: [b1.id, b2.id] },
        ],
      },
      group.slug,
      a1.id,
      t.db,
    );

    expect(result.match.numTeams).toBe(2);
    const winners = result.participants.filter((p) => p.finalRank === 1);
    expect(winners.map((w) => w.userId).sort()).toEqual([a1.id, a2.id].sort());
    for (const w of winners) expect(w.ratingDelta!).toBeGreaterThan(0);
    for (const l of result.participants.filter((p) => p.finalRank === 2)) {
      expect(l.ratingDelta!).toBeLessThan(0);
    }
  });

  it("rejects teams for an FFA-only game", async () => {
    const { group, members } = await makeGroupWithMembers(t.db, 4);
    const game = await makeGame(t.db, { supportsTeams: false, supportsFfa: true });
    await expect(
      logMatch(
        {
          gameId: game.id,
          matchType: "competitive",
          teamMode: "teams",
          teams: [
            { rank: 1, userIds: [members[0].id, members[1].id] },
            { rank: 2, userIds: [members[2].id, members[3].id] },
          ],
        },
        group.slug,
        members[0].id,
        t.db,
      ),
    ).rejects.toThrow(/isn't played in teams/);
  });

  it("handles a 3-team ranking", async () => {
    const { group, members } = await makeGroupWithMembers(t.db, 6);
    const game = await makeGame(t.db, { supportsTeams: true, supportsFfa: false, maxPlayers: 6 });

    const result = await logMatch(
      {
        gameId: game.id,
        matchType: "competitive",
        teamMode: "teams",
        teams: [
          { rank: 1, userIds: [members[0].id, members[1].id] },
          { rank: 2, userIds: [members[2].id, members[3].id] },
          { rank: 3, userIds: [members[4].id, members[5].id] },
        ],
      },
      group.slug,
      members[0].id,
      t.db,
    );

    const mu = (id: string) => result.participants.find((p) => p.userId === id)!.ratingAfter!;
    expect(mu(members[0].id)).toBeGreaterThan(mu(members[2].id));
    expect(mu(members[2].id)).toBeGreaterThan(mu(members[4].id));
  });
});

describe("voidMatch — undo (spec §3)", () => {
  it("lets a participant undo within the window and reverses ratings", async () => {
    const { group, members } = await makeGroupWithMembers(t.db, 2);
    const game = await makeGame(t.db);
    const [a, b] = members;

    const logged = await logMatch(
      { gameId: game.id, matchType: "competitive", teamMode: "ffa", participants: [{ userId: a.id, rank: 1 }, { userId: b.id, rank: 2 }] },
      group.slug,
      a.id,
      t.db,
    );
    expect(logged.match.status).toBe("confirmed");

    const voided = await voidMatch(logged.match.id, a.id, t.db);
    expect(voided.match.status).toBe("voided");

    // Logging again should reproduce the exact original numbers — proof the
    // reversal actually restored the pre-match state, not just zeroed it.
    const replay = await logMatch(
      { gameId: game.id, matchType: "competitive", teamMode: "ffa", participants: [{ userId: a.id, rank: 1 }, { userId: b.id, rank: 2 }] },
      group.slug,
      a.id,
      t.db,
    );
    expect(replay.participants.find((p) => p.userId === a.id)!.ratingBefore).toBeCloseTo(
      logged.participants.find((p) => p.userId === a.id)!.ratingBefore!,
      6,
    );
  });

  it("rejects an outsider trying to void", async () => {
    const { group, members } = await makeGroupWithMembers(t.db, 2);
    const outsider = await makeUser(t.db);
    const game = await makeGame(t.db);
    const logged = await logMatch(
      { gameId: game.id, matchType: "competitive", teamMode: "ffa", participants: [{ userId: members[0].id, rank: 1 }, { userId: members[1].id, rank: 2 }] },
      group.slug,
      members[0].id,
      t.db,
    );
    await expect(voidMatch(logged.match.id, outsider.id, t.db)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rejects a non-participant member outside the undo window (needs void_matches)", async () => {
    const { group, members } = await makeGroupWithMembers(t.db, 3);
    const game = await makeGame(t.db, { maxPlayers: 3 });
    const logged = await logMatch(
      { gameId: game.id, matchType: "competitive", teamMode: "ffa", participants: [{ userId: members[0].id, rank: 1 }, { userId: members[1].id, rank: 2 }] },
      group.slug,
      members[0].id,
      t.db,
    );
    // members[2] is a plain member, not a participant, and not an admin.
    await expect(voidMatch(logged.match.id, members[2].id, t.db)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("lets an admin void long after the undo window", async () => {
    const { group, members } = await makeGroupWithMembers(t.db, 2);
    const game = await makeGame(t.db);
    const logged = await logMatch(
      { gameId: game.id, matchType: "competitive", teamMode: "ffa", participants: [{ userId: members[0].id, rank: 1 }, { userId: members[1].id, rank: 2 }] },
      group.slug,
      members[0].id,
      t.db,
    );
    // Owner (members[0]) voids well outside a hypothetical window — allowed
    // purely on permission, exercising the non-time-boxed branch.
    const voided = await voidMatch(logged.match.id, members[0].id, t.db);
    expect(voided.match.status).toBe("voided");
  });

  it("refuses to void twice", async () => {
    const { group, members } = await makeGroupWithMembers(t.db, 2);
    const game = await makeGame(t.db);
    const logged = await logMatch(
      { gameId: game.id, matchType: "competitive", teamMode: "ffa", participants: [{ userId: members[0].id, rank: 1 }, { userId: members[1].id, rank: 2 }] },
      group.slug,
      members[0].id,
      t.db,
    );
    await voidMatch(logged.match.id, members[0].id, t.db);
    await expect(voidMatch(logged.match.id, members[0].id, t.db)).rejects.toBeInstanceOf(ConflictError);
  });

  it("refuses to void a match if a newer match already consumed its ratings", async () => {
    const { group, members } = await makeGroupWithMembers(t.db, 2);
    const game = await makeGame(t.db);
    const first = await logMatch(
      { gameId: game.id, matchType: "competitive", teamMode: "ffa", participants: [{ userId: members[0].id, rank: 1 }, { userId: members[1].id, rank: 2 }] },
      group.slug,
      members[0].id,
      t.db,
    );
    await logMatch(
      { gameId: game.id, matchType: "competitive", teamMode: "ffa", participants: [{ userId: members[0].id, rank: 1 }, { userId: members[1].id, rank: 2 }] },
      group.slug,
      members[0].id,
      t.db,
    );

    await expect(voidMatch(first.match.id, members[0].id, t.db)).rejects.toBeInstanceOf(ConflictError);
  });

  it("does not touch ratings for a casual match, just the counters", async () => {
    const { group, members } = await makeGroupWithMembers(t.db, 2);
    const game = await makeGame(t.db);
    const logged = await logMatch(
      { gameId: game.id, matchType: "casual", teamMode: "ffa", participants: [{ userId: members[0].id, rank: 1 }, { userId: members[1].id, rank: 2 }] },
      group.slug,
      members[0].id,
      t.db,
    );
    const voided = await voidMatch(logged.match.id, members[0].id, t.db);
    expect(voided.match.status).toBe("voided");
  });

  void UNDO_WINDOW_MS;
});
