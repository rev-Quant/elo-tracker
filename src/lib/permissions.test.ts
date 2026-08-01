import { describe, expect, it } from "vitest";
import {
  GROUP_ROLES,
  type GroupRole,
  PERMISSIONS,
  type Permission,
  PermissionError,
  assertCan,
  can,
  canChangeRole,
  canRemoveMember,
  isMoreSeniorThan,
} from "./permissions";

/**
 * The spec §6 table, transcribed independently of the implementation so that
 * this really is a check rather than a restatement.
 *
 * Columns: log | invite | remove | void | delete group | seasons
 */
const SPEC_TABLE: Record<GroupRole, Record<string, boolean>> = {
  owner: { log_match: true, invite: true, remove_members: true, void_matches: true, delete_group: true, create_seasons: true },
  admin: { log_match: true, invite: true, remove_members: true, void_matches: true, delete_group: false, create_seasons: true },
  member: { log_match: true, invite: false, remove_members: false, void_matches: false, delete_group: false, create_seasons: false },
  spectator: { log_match: false, invite: false, remove_members: false, void_matches: false, delete_group: false, create_seasons: false },
};

describe("permission matrix matches spec §6 exactly", () => {
  for (const role of GROUP_ROLES) {
    for (const [permission, expected] of Object.entries(SPEC_TABLE[role])) {
      it(`${role} ${expected ? "can" : "cannot"} ${permission}`, () => {
        expect(can(role, permission as Permission)).toBe(expected);
      });
    }
  }

  it("covers every declared permission for every role", () => {
    for (const role of GROUP_ROLES) {
      for (const permission of PERMISSIONS) {
        expect(typeof can(role, permission)).toBe("boolean");
      }
    }
  });

  it("gives spectators nothing at all", () => {
    expect(PERMISSIONS.filter((p) => can("spectator", p))).toEqual([]);
  });
});

describe("assertCan", () => {
  it("is silent when allowed", () => {
    expect(() => assertCan("member", "log_match")).not.toThrow();
  });

  it("throws a 403-flavoured PermissionError when denied", () => {
    try {
      assertCan("spectator", "log_match");
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(PermissionError);
      expect((err as PermissionError).status).toBe(403);
      expect((err as PermissionError).role).toBe("spectator");
      expect((err as PermissionError).permission).toBe("log_match");
    }
  });
});

describe("seniority", () => {
  it("orders owner > admin > member > spectator", () => {
    expect(isMoreSeniorThan("owner", "admin")).toBe(true);
    expect(isMoreSeniorThan("admin", "member")).toBe(true);
    expect(isMoreSeniorThan("member", "spectator")).toBe(true);
    expect(isMoreSeniorThan("admin", "owner")).toBe(false);
    expect(isMoreSeniorThan("admin", "admin")).toBe(false);
  });
});

describe("canRemoveMember (spec gap: admin vs owner)", () => {
  it("lets an owner remove admins, members and spectators", () => {
    expect(canRemoveMember("owner", "admin")).toBe(true);
    expect(canRemoveMember("owner", "member")).toBe(true);
    expect(canRemoveMember("owner", "spectator")).toBe(true);
  });

  it("stops an admin from removing the owner (group takeover guard)", () => {
    expect(canRemoveMember("admin", "owner")).toBe(false);
  });

  it("stops an admin from removing a peer admin", () => {
    expect(canRemoveMember("admin", "admin")).toBe(false);
  });

  it("lets an admin remove members and spectators", () => {
    expect(canRemoveMember("admin", "member")).toBe(true);
    expect(canRemoveMember("admin", "spectator")).toBe(true);
  });

  it("stops members and spectators removing anyone", () => {
    for (const target of GROUP_ROLES) {
      expect(canRemoveMember("member", target)).toBe(false);
      expect(canRemoveMember("spectator", target)).toBe(false);
    }
  });

  it("never lets an owner be removed by anyone but an owner", () => {
    expect(canRemoveMember("admin", "owner")).toBe(false);
    expect(canRemoveMember("member", "owner")).toBe(false);
    expect(canRemoveMember("spectator", "owner")).toBe(false);
  });
});

describe("canChangeRole", () => {
  it("lets an owner promote a member to admin", () => {
    expect(canChangeRole("owner", "member", "admin")).toBe(true);
  });

  it("lets an owner demote an admin", () => {
    expect(canChangeRole("owner", "admin", "member")).toBe(true);
  });

  it("blocks creating a second owner implicitly (transfer is explicit)", () => {
    expect(canChangeRole("owner", "admin", "owner")).toBe(false);
  });

  it("lets an admin toggle a member to spectator and back", () => {
    expect(canChangeRole("admin", "member", "spectator")).toBe(true);
    expect(canChangeRole("admin", "spectator", "member")).toBe(true);
  });

  it("blocks an admin from minting another admin", () => {
    expect(canChangeRole("admin", "member", "admin")).toBe(false);
  });

  it("blocks an admin from touching the owner", () => {
    expect(canChangeRole("admin", "owner", "member")).toBe(false);
  });

  it("blocks members and spectators entirely", () => {
    expect(canChangeRole("member", "spectator", "member")).toBe(false);
    expect(canChangeRole("spectator", "member", "spectator")).toBe(false);
  });
});
