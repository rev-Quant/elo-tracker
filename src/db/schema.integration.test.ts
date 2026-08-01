import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { violatedConstraint } from "@/db/errors";
import { games, groupMembers, groups, matches, users } from "@/db/schema";
import { type TestDb, createTestDb } from "@/test/db";

/**
 * Proves the generated migration applies to a real PostgreSQL server and that
 * the CHECK constraints in the schema actually fire.
 */

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
}, 60_000);
afterAll(async () => t?.close());

/**
 * Asserts the statement fails on the named constraint.
 *
 * Goes through `violatedConstraint` so the production error-introspection
 * helper is exercised here too, rather than reaching into the raw error shape.
 */
async function expectViolation(fn: () => Promise<unknown>, constraint: string) {
  let caught: unknown;
  try {
    await fn();
  } catch (err) {
    caught = err;
  }
  expect(caught, `expected a ${constraint} violation but the statement succeeded`).toBeDefined();
  expect(violatedConstraint(caught)).toBe(constraint);
}

describe("migration", () => {
  it("creates every expected table", async () => {
    // Raw client rather than the Drizzle handle: the test db is cast to the
    // production `Db` type, whose `execute` has a different result shape.
    const rows = await t.client.query<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema = 'public' order by table_name",
    );
    expect(rows.rows.map((r) => r.table_name)).toEqual([
      "current_ratings",
      "games",
      "group_members",
      "groups",
      "match_confirmations",
      "match_participants",
      "match_teams",
      "matches",
      "rating_snapshots",
      "seasons",
      "team_members",
      "team_ratings",
      "teams",
      "users",
    ]);
  });

  it("creates the partial unique indexes (qualified predicates are valid)", async () => {
    const rows = await t.client.query<{ indexname: string }>(
      "select indexname from pg_indexes where schemaname = 'public' and indexname in ('users_email_unique', 'matches_group_idempotency_unique')",
    );
    expect(rows.rows.map((r) => r.indexname).sort()).toEqual([
      "matches_group_idempotency_unique",
      "users_email_unique",
    ]);
  });
});

describe("users constraints", () => {
  it("enforces case-insensitive email uniqueness", async () => {
    await t.db.insert(users).values({ displayName: "A", email: "dup@example.com", passwordHash: "x" });
    await expectViolation(
      () =>
        t.db.insert(users).values({ displayName: "B", email: "DUP@EXAMPLE.COM", passwordHash: "x" }),
      "users_email_unique",
    );
  });

  it("allows many guests with no email", async () => {
    await t.db.insert(users).values([
      { displayName: "Guest 1", isGuest: true },
      { displayName: "Guest 2", isGuest: true },
      { displayName: "Guest 3", isGuest: true },
    ]);
    const rows = await t.db.select().from(users);
    expect(rows.filter((r) => r.isGuest).length).toBeGreaterThanOrEqual(3);
  });

  it("rejects a guest that carries credentials", async () => {
    await expectViolation(
      () =>
        t.db
          .insert(users)
          .values({ displayName: "Bad", isGuest: true, email: "g@example.com", passwordHash: "x" }),
      "users_guest_has_no_credentials",
    );
  });

  it("rejects a registered user with no email", async () => {
    await expectViolation(
      () => t.db.insert(users).values({ displayName: "Bad", isGuest: false }),
      "users_registered_has_email",
    );
  });

  it("rejects a blank display name", async () => {
    await expectViolation(
      () => t.db.insert(users).values({ displayName: "   ", isGuest: true }),
      "users_display_name_not_blank",
    );
  });
});

describe("games constraints", () => {
  it("rejects a slug that isn't kebab-case", async () => {
    await expectViolation(
      () => t.db.insert(games).values({ name: "Bad", slug: "Not A Slug" }),
      "games_slug_format",
    );
  });

  it("rejects maxPlayers below minPlayers", async () => {
    await expectViolation(
      () => t.db.insert(games).values({ name: "Bad", slug: "bad-range", minPlayers: 4, maxPlayers: 2 }),
      "games_max_gte_min",
    );
  });

  it("rejects a game supporting neither FFA nor teams", async () => {
    await expectViolation(
      () =>
        t.db
          .insert(games)
          .values({ name: "Bad", slug: "no-mode", supportsFfa: false, supportsTeams: false }),
      "games_supports_a_mode",
    );
  });
});

describe("matches constraints", () => {
  async function fixture() {
    const [user] = await t.db
      .insert(users)
      .values({ displayName: "Owner", isGuest: true })
      .returning();
    const [group] = await t.db
      .insert(groups)
      .values({
        name: "G",
        slug: `g-${Math.random().toString(36).slice(2, 8)}`,
        inviteCode: Math.random().toString(36).slice(2, 10).toUpperCase(),
        createdBy: user.id,
      })
      .returning();
    const [game] = await t.db
      .insert(games)
      .values({ name: "Gm", slug: `gm-${Math.random().toString(36).slice(2, 8)}` })
      .returning();
    await t.db.insert(groupMembers).values({ groupId: group.id, userId: user.id, role: "owner" });
    return { user, group, game };
  }

  it("rejects FFA carrying a team count", async () => {
    const { user, group, game } = await fixture();
    await expectViolation(
      () =>
        t.db.insert(matches).values({
          gameId: game.id,
          groupId: group.id,
          teamMode: "ffa",
          numTeams: 2,
          recordedBy: user.id,
        }),
      "matches_num_teams_matches_mode",
    );
  });

  it("rejects team mode without a team count", async () => {
    // Regression: the first version of this CHECK evaluated to NULL for this
    // row (NULL >= 2 is NULL), and a CHECK only rejects on FALSE, so the
    // invalid row was silently accepted.
    const { user, group, game } = await fixture();
    await expectViolation(
      () =>
        t.db.insert(matches).values({
          gameId: game.id,
          groupId: group.id,
          teamMode: "teams",
          numTeams: null,
          recordedBy: user.id,
        }),
      "matches_num_teams_matches_mode",
    );
  });

  it("rejects team mode with fewer than 2 teams", async () => {
    const { user, group, game } = await fixture();
    await expectViolation(
      () =>
        t.db.insert(matches).values({
          gameId: game.id,
          groupId: group.id,
          teamMode: "teams",
          numTeams: 1,
          recordedBy: user.id,
        }),
      "matches_num_teams_matches_mode",
    );
  });

  it("accepts a valid team match", async () => {
    const { user, group, game } = await fixture();
    const [row] = await t.db
      .insert(matches)
      .values({
        gameId: game.id,
        groupId: group.id,
        teamMode: "teams",
        numTeams: 2,
        recordedBy: user.id,
      })
      .returning();
    expect(row.numTeams).toBe(2);
  });

  it("accepts a valid FFA match", async () => {
    const { user, group, game } = await fixture();
    const [row] = await t.db
      .insert(matches)
      .values({
        gameId: game.id,
        groupId: group.id,
        teamMode: "ffa",
        recordedBy: user.id,
      })
      .returning();
    expect(row.numTeams).toBeNull();
    expect(row.status).toBe("pending");
    expect(row.ratingsApplied).toBe(false);
  });

  it("enforces idempotency-key uniqueness per group", async () => {
    const { user, group, game } = await fixture();
    const key = "11111111-1111-4111-8111-111111111111";
    const base = {
      gameId: game.id,
      groupId: group.id,
      teamMode: "ffa" as const,
      recordedBy: user.id,
      idempotencyKey: key,
    };
    await t.db.insert(matches).values(base);
    await expectViolation(
      () => t.db.insert(matches).values(base),
      "matches_group_idempotency_unique",
    );
  });

  it("allows unlimited matches with a null idempotency key", async () => {
    const { user, group, game } = await fixture();
    const base = {
      gameId: game.id,
      groupId: group.id,
      teamMode: "ffa" as const,
      recordedBy: user.id,
      idempotencyKey: null,
    };
    await t.db.insert(matches).values([base, base, base]);
    const rows = await t.db.select().from(matches);
    expect(rows.length).toBeGreaterThanOrEqual(3);
  });
});
