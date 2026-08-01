import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ForbiddenError } from "@/lib/errors";
import { type TestDb, createTestDb } from "@/test/db";
import { makeGame, makeGroupWithMembers, makeUser } from "@/test/fixtures";
import { computeBadges } from "@/server/users/badges";
import { createGame } from "@/server/games/service";
import { roundup } from "@/server/groups/roundup";
import { updateGroup, deleteGroup, requireMembership } from "@/server/groups/service";
import { logMatch } from "@/server/matches/service";

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => t?.close());

async function play(slug: string, gameId: string, winner: string, loser: string, times = 1) {
  for (let i = 0; i < times; i += 1) {
    await logMatch(
      { gameId, matchType: "competitive", teamMode: "ffa", participants: [{ userId: winner, rank: 1 }, { userId: loser, rank: 2 }] },
      slug,
      winner,
      t.db,
    );
  }
}

describe("computeBadges", () => {
  it("awards first_win after one win and streak_5 after five", async () => {
    const { group, members } = await makeGroupWithMembers(t.db, 2);
    const game = await makeGame(t.db);
    const [a, b] = members;

    await play(group.slug, game.id, a.id, b.id, 1);
    let badges = await computeBadges(a.id, group.id, t.db);
    expect(badges.map((x) => x.id)).toContain("first_win");
    expect(badges.map((x) => x.id)).not.toContain("streak_5");

    await play(group.slug, game.id, a.id, b.id, 4);
    badges = await computeBadges(a.id, group.id, t.db);
    expect(badges.map((x) => x.id)).toContain("streak_5");
  });

  it("awards giant_slayer for beating a much higher-rated opponent", async () => {
    const { group, members } = await makeGroupWithMembers(t.db, 3);
    const game = await makeGame(t.db, { maxPlayers: 3 });
    const [strong, weak, filler] = members;

    // Build a rating gap, then have the weak player win once.
    await play(group.slug, game.id, strong.id, filler.id, 6);
    const badgesBefore = await computeBadges(weak.id, group.id, t.db);
    expect(badgesBefore.map((x) => x.id)).not.toContain("giant_slayer");

    await play(group.slug, game.id, weak.id, strong.id, 1);
    const badges = await computeBadges(weak.id, group.id, t.db);
    expect(badges.map((x) => x.id)).toContain("giant_slayer");
  });

  it("is empty for someone who hasn't played", async () => {
    const { group, members } = await makeGroupWithMembers(t.db, 2);
    expect(await computeBadges(members[1].id, group.id, t.db)).toEqual([]);
  });
});

describe("roundup", () => {
  it("summarises the week's matches", async () => {
    const { group, members } = await makeGroupWithMembers(t.db, 3);
    const game = await makeGame(t.db, { maxPlayers: 3 });
    const [a, b, c] = members;

    await play(group.slug, game.id, a.id, b.id, 3);

    const report = await roundup(group.id, t.db);
    expect(report.totalMatches).toBe(3);
    expect(report.mostWins?.userId).toBe(a.id);
    expect(report.mostWins?.wins).toBe(3);
    expect(report.biggestGain?.userId).toBe(a.id);
    // c played nothing this week.
    expect(report.quiet.map((q) => q.userId)).toContain(c.id);
  });

  it("is zeroed for a group with no recent activity", async () => {
    const { group } = await makeGroupWithMembers(t.db, 2);
    const report = await roundup(group.id, t.db);
    expect(report.totalMatches).toBe(0);
    expect(report.mostWins).toBeNull();
    expect(report.quiet).toHaveLength(2);
  });
});

describe("createGame (spec §12 custom games)", () => {
  it("creates a game any signed-in user can then log", async () => {
    const user = await makeUser(t.db);
    const game = await createGame(
      { name: "Backgammon", minPlayers: 2, supportsFfa: true, supportsTeams: false, rankingMode: "full" },
      user.id,
      t.db,
    );
    expect(game.slug).toBe("backgammon");
    expect(game.createdByUserId).toBe(user.id);
  });

  it("disambiguates a colliding name", async () => {
    const user = await makeUser(t.db);
    const a = await createGame({ name: "Uno Dup", minPlayers: 2, supportsFfa: true, supportsTeams: false, rankingMode: "full" }, user.id, t.db);
    const b = await createGame({ name: "Uno Dup", minPlayers: 2, supportsFfa: true, supportsTeams: false, rankingMode: "full" }, user.id, t.db);
    expect(a.slug).not.toBe(b.slug);
  });
});

describe("group settings (spec §6 customization)", () => {
  it("lets an owner rename the group and toggle discoverability", async () => {
    const { group, members } = await makeGroupWithMembers(t.db, 2);
    const { role } = await requireMembership(group.slug, members[0].id, t.db);
    const updated = await updateGroup(group.id, role, { name: "Renamed", isPublic: true }, t.db);
    expect(updated.name).toBe("Renamed");
    expect(updated.isPublic).toBe(true);
  });

  it("blocks a plain member from changing settings", async () => {
    const { group, members } = await makeGroupWithMembers(t.db, 2);
    const { role } = await requireMembership(group.slug, members[1].id, t.db);
    await expect(updateGroup(group.id, role, { name: "Nope" }, t.db)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("lets only the owner delete the group", async () => {
    const { group, members } = await makeGroupWithMembers(t.db, 2);
    const memberRole = (await requireMembership(group.slug, members[1].id, t.db)).role;
    await expect(deleteGroup(group.id, memberRole, t.db)).rejects.toBeInstanceOf(ForbiddenError);

    const ownerRole = (await requireMembership(group.slug, members[0].id, t.db)).role;
    await deleteGroup(group.id, ownerRole, t.db);
  });
});
