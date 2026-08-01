import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { isValidInviteCode, isValidSlug } from "@/lib/ids";
import { type TestDb, createTestDb } from "@/test/db";
import { makeUser } from "@/test/fixtures";
import {
  addMember,
  changeMemberRole,
  createGroup,
  joinByInviteCode,
  listForUser,
  listMembers,
  regenerateInviteCode,
  removeMember,
  requireMembership,
  roleOf,
} from "./service";

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => t?.close());

const newGroup = (name: string) => ({ name, isPublic: false, timezone: "UTC" });

describe("createGroup", () => {
  it("creates the group and installs the creator as owner", async () => {
    const owner = await makeUser(t.db);
    const group = await createGroup(newGroup("College Friends"), owner.id, t.db);

    expect(group.name).toBe("College Friends");
    expect(group.slug).toBe("college-friends");
    expect(isValidSlug(group.slug)).toBe(true);
    expect(isValidInviteCode(group.inviteCode)).toBe(true);
    await expect(roleOf(group.id, owner.id, t.db)).resolves.toBe("owner");
  });

  it("disambiguates a colliding slug rather than failing", async () => {
    const a = await makeUser(t.db);
    const b = await makeUser(t.db);
    const first = await createGroup(newGroup("Game Night"), a.id, t.db);
    const second = await createGroup(newGroup("Game Night"), b.id, t.db);
    const third = await createGroup(newGroup("Game Night"), b.id, t.db);

    expect(first.slug).toBe("game-night");
    expect(second.slug).toBe("game-night-2");
    expect(third.slug).toBe("game-night-3");
  });

  it("invents a slug when the name has no ASCII equivalent", async () => {
    const owner = await makeUser(t.db);
    const group = await createGroup(newGroup("🎲🎲🎲"), owner.id, t.db);
    expect(isValidSlug(group.slug)).toBe(true);
    expect(group.name).toBe("🎲🎲🎲");
  });

  it("gives every group a distinct invite code", async () => {
    const owner = await makeUser(t.db);
    const codes = new Set<string>();
    for (let i = 0; i < 10; i += 1) {
      const g = await createGroup(newGroup(`Group ${i}`), owner.id, t.db);
      codes.add(g.inviteCode);
    }
    expect(codes.size).toBe(10);
  });
});

describe("joinByInviteCode", () => {
  it("adds the user as a member", async () => {
    const owner = await makeUser(t.db);
    const joiner = await makeUser(t.db);
    const group = await createGroup(newGroup("Joinable"), owner.id, t.db);

    const result = await joinByInviteCode({ inviteCode: group.inviteCode }, joiner.id, t.db);
    expect(result.group.id).toBe(group.id);
    expect(result.role).toBe("member");
  });

  it("accepts a sloppily typed code", async () => {
    const owner = await makeUser(t.db);
    const joiner = await makeUser(t.db);
    const group = await createGroup(newGroup("Sloppy"), owner.id, t.db);

    const typed = `  ${group.inviteCode.toLowerCase()}  `;
    await expect(joinByInviteCode({ inviteCode: typed }, joiner.id, t.db)).resolves.toMatchObject({
      role: "member",
    });
  });

  it("is idempotent and never demotes an existing member", async () => {
    const owner = await makeUser(t.db);
    const group = await createGroup(newGroup("Rejoin"), owner.id, t.db);

    // The owner following their own invite link must stay an owner.
    const result = await joinByInviteCode({ inviteCode: group.inviteCode }, owner.id, t.db);
    expect(result.role).toBe("owner");

    const members = await listMembers(group.id, t.db);
    expect(members).toHaveLength(1);
  });

  it("rejects an unknown code", async () => {
    const joiner = await makeUser(t.db);
    await expect(
      joinByInviteCode({ inviteCode: "BCDFGHJK" }, joiner.id, t.db),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rejects a malformed code without hitting the database", async () => {
    const joiner = await makeUser(t.db);
    await expect(joinByInviteCode({ inviteCode: "nope" }, joiner.id, t.db)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

describe("regenerateInviteCode", () => {
  it("issues a new code and invalidates the old one", async () => {
    const owner = await makeUser(t.db);
    const joiner = await makeUser(t.db);
    const group = await createGroup(newGroup("Rotating"), owner.id, t.db);
    const oldCode = group.inviteCode;

    const newCode = await regenerateInviteCode(group.id, "owner", t.db);
    expect(newCode).not.toBe(oldCode);
    expect(isValidInviteCode(newCode)).toBe(true);

    await expect(joinByInviteCode({ inviteCode: oldCode }, joiner.id, t.db)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(joinByInviteCode({ inviteCode: newCode }, joiner.id, t.db)).resolves.toMatchObject({
      role: "member",
    });
  });

  it("refuses a plain member (spec §6: members cannot invite)", async () => {
    const owner = await makeUser(t.db);
    const group = await createGroup(newGroup("Locked"), owner.id, t.db);
    await expect(regenerateInviteCode(group.id, "member", t.db)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});

describe("requireMembership", () => {
  it("returns the group and the caller's role", async () => {
    const owner = await makeUser(t.db);
    const group = await createGroup(newGroup("Visible"), owner.id, t.db);
    const result = await requireMembership(group.slug, owner.id, t.db);
    expect(result.group.id).toBe(group.id);
    expect(result.role).toBe("owner");
  });

  it("hides a group's existence from non-members (spec §9)", async () => {
    const owner = await makeUser(t.db);
    const outsider = await makeUser(t.db);
    const group = await createGroup(newGroup("Private"), owner.id, t.db);

    // 404 not 403: confirming the group exists is itself a leak.
    const err = await requireMembership(group.slug, outsider.id, t.db).catch((e) => e);
    expect(err).toBeInstanceOf(NotFoundError);
    expect(err.status).toBe(404);
  });

  it("404s on an unknown slug with the same error", async () => {
    const outsider = await makeUser(t.db);
    const err = await requireMembership("no-such-group", outsider.id, t.db).catch((e) => e);
    expect(err).toBeInstanceOf(NotFoundError);
  });
});

describe("removeMember", () => {
  async function setup() {
    const owner = await makeUser(t.db);
    const admin = await makeUser(t.db);
    const member = await makeUser(t.db);
    const group = await createGroup(newGroup(`Removal ${Math.random()}`), owner.id, t.db);
    await addMember(group.id, admin.id, "admin", t.db);
    await addMember(group.id, member.id, "member", t.db);
    return { owner, admin, member, group };
  }

  it("lets an owner remove a member", async () => {
    const { owner, member, group } = await setup();
    await removeMember(group.id, owner.id, "owner", member.id, t.db);
    await expect(roleOf(group.id, member.id, t.db)).resolves.toBeNull();
  });

  it("lets an admin remove a member", async () => {
    const { admin, member, group } = await setup();
    await removeMember(group.id, admin.id, "admin", member.id, t.db);
    await expect(roleOf(group.id, member.id, t.db)).resolves.toBeNull();
  });

  it("stops an admin removing the owner", async () => {
    const { owner, admin, group } = await setup();
    await expect(
      removeMember(group.id, admin.id, "admin", owner.id, t.db),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(roleOf(group.id, owner.id, t.db)).resolves.toBe("owner");
  });

  it("stops a member removing anyone", async () => {
    const { member, admin, group } = await setup();
    await expect(
      removeMember(group.id, member.id, "member", admin.id, t.db),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("lets a member leave of their own accord", async () => {
    const { member, group } = await setup();
    await removeMember(group.id, member.id, "member", member.id, t.db);
    await expect(roleOf(group.id, member.id, t.db)).resolves.toBeNull();
  });

  it("stops the owner leaving and orphaning the group", async () => {
    const { owner, group } = await setup();
    await expect(
      removeMember(group.id, owner.id, "owner", owner.id, t.db),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("404s when the target isn't in the group", async () => {
    const { owner, group } = await setup();
    const outsider = await makeUser(t.db);
    await expect(
      removeMember(group.id, owner.id, "owner", outsider.id, t.db),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("changeMemberRole", () => {
  async function setup() {
    const owner = await makeUser(t.db);
    const admin = await makeUser(t.db);
    const member = await makeUser(t.db);
    const group = await createGroup(newGroup(`Roles ${Math.random()}`), owner.id, t.db);
    await addMember(group.id, admin.id, "admin", t.db);
    await addMember(group.id, member.id, "member", t.db);
    return { owner, admin, member, group };
  }

  it("lets an owner promote a member to admin", async () => {
    const { owner, member, group } = await setup();
    await changeMemberRole(group.id, owner.id, "owner", member.id, "admin", t.db);
    await expect(roleOf(group.id, member.id, t.db)).resolves.toBe("admin");
  });

  it("lets an owner make someone a spectator", async () => {
    const { owner, member, group } = await setup();
    await changeMemberRole(group.id, owner.id, "owner", member.id, "spectator", t.db);
    await expect(roleOf(group.id, member.id, t.db)).resolves.toBe("spectator");
  });

  it("blocks an admin from minting another admin", async () => {
    const { admin, member, group } = await setup();
    await expect(
      changeMemberRole(group.id, admin.id, "admin", member.id, "admin", t.db),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("blocks implicit ownership transfer", async () => {
    const { owner, member, group } = await setup();
    await expect(
      changeMemberRole(group.id, owner.id, "owner", member.id, "owner", t.db),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("blocks changing your own role", async () => {
    const { owner, group } = await setup();
    await expect(
      changeMemberRole(group.id, owner.id, "owner", owner.id, "member", t.db),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("listMembers / listForUser", () => {
  it("lists members in join order with their roles", async () => {
    const owner = await makeUser(t.db);
    const second = await makeUser(t.db);
    const group = await createGroup(newGroup("Listing"), owner.id, t.db);
    await addMember(group.id, second.id, "member", t.db);

    const members = await listMembers(group.id, t.db);
    expect(members).toHaveLength(2);
    expect(members[0].userId).toBe(owner.id);
    expect(members[0].role).toBe("owner");
    expect(members[1].role).toBe("member");
    // Never leak emails through a member list (spec §9).
    expect(Object.keys(members[0])).not.toContain("email");
  });

  it("lists every group a user belongs to", async () => {
    const user = await makeUser(t.db);
    const a = await createGroup(newGroup("Alpha"), user.id, t.db);
    const b = await createGroup(newGroup("Beta"), user.id, t.db);

    const groups = await listForUser(user.id, t.db);
    expect(groups.map((g) => g.group.id).sort()).toEqual([a.id, b.id].sort());
    expect(groups.every((g) => g.role === "owner")).toBe(true);
  });

  it("returns nothing for a user with no groups", async () => {
    const loner = await makeUser(t.db);
    await expect(listForUser(loner.id, t.db)).resolves.toEqual([]);
  });
});
