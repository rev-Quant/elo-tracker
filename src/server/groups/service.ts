import { and, eq } from "drizzle-orm";
import { type Queryable, db as defaultDb } from "@/db";
import { isUniqueViolation } from "@/db/errors";
import { type Group, type GroupRole, groupMembers, groups, users } from "@/db/schema";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import {
  generateInviteCode,
  isValidInviteCode,
  normalizeInviteCode,
  slugWithSuffix,
  slugifyWithFallback,
} from "@/lib/ids";
import { canChangeRole, canRemoveMember, assertCan } from "@/lib/permissions";
import type { CreateGroupInput, JoinGroupInput } from "./schemas";

/**
 * Group lifecycle and membership. Spec §6.
 *
 * Slugs and invite codes are generated optimistically and retried on unique
 * violation. Checking for availability first would be a race under concurrency.
 */

const MAX_GENERATION_ATTEMPTS = 8;

export interface GroupWithRole {
  group: Group;
  role: GroupRole;
}

/**
 * Create a group and install the creator as its owner, atomically.
 *
 * On slug collision the next free "name-2", "name-3", ... is tried. Invite
 * codes are random, so a collision is vanishingly unlikely but still retried.
 *
 * Each attempt is a SEPARATE transaction. A failed statement aborts the
 * enclosing Postgres transaction, so retrying inside one would fail with
 * "current transaction is aborted".
 */
export async function createGroup(
  input: CreateGroupInput,
  creatorUserId: string,
  db: Queryable = defaultDb,
): Promise<Group> {
  const baseSlug = slugifyWithFallback(input.name);

  for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt += 1) {
    const slug = attempt === 1 ? baseSlug : slugWithSuffix(baseSlug, attempt);

    try {
      return await db.transaction(async (tx) => {
        const [group] = await tx
          .insert(groups)
          .values({
            name: input.name,
            slug,
            inviteCode: generateInviteCode(),
            createdBy: creatorUserId,
            isPublic: input.isPublic,
            timezone: input.timezone,
          })
          .returning();

        await tx.insert(groupMembers).values({
          groupId: group.id,
          userId: creatorUserId,
          role: "owner",
        });

        return group;
      });
    } catch (err) {
      const retryable =
        isUniqueViolation(err, "groups_slug_unique") || isUniqueViolation(err, "groups_invite_code_unique");
      if (!retryable || attempt === MAX_GENERATION_ATTEMPTS) throw err;
    }
  }

  throw new ConflictError("Could not allocate a unique group URL. Try a different name.");
}

export async function findBySlug(slug: string, db: Queryable = defaultDb): Promise<Group | null> {
  const [group] = await db.select().from(groups).where(eq(groups.slug, slug)).limit(1);
  return group ?? null;
}

export async function requireBySlug(slug: string, db: Queryable = defaultDb): Promise<Group> {
  const group = await findBySlug(slug, db);
  if (!group) throw new NotFoundError("That group doesn't exist.");
  return group;
}

/** The caller's role in a group, or null if they are not a member. */
export async function roleOf(
  groupId: string,
  userId: string,
  db: Queryable = defaultDb,
): Promise<GroupRole | null> {
  const [row] = await db
    .select({ role: groupMembers.role })
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)))
    .limit(1);
  return row?.role ?? null;
}

/**
 * Load a group by slug and assert the caller belongs to it.
 *
 * Spec §9 makes group membership the default visibility boundary for ratings,
 * match history and profiles, so almost every read path starts here.
 */
export async function requireMembership(
  slug: string,
  userId: string,
  db: Queryable = defaultDb,
): Promise<GroupWithRole> {
  const group = await requireBySlug(slug, db);
  const role = await roleOf(group.id, userId, db);
  if (!role) {
    // Deliberately "not found" rather than "forbidden": confirming that a
    // private group exists is itself a leak.
    throw new NotFoundError("That group doesn't exist.");
  }
  return { group, role };
}

/** Join via an invite code. Spec §6 "Invite link". */
export async function joinByInviteCode(
  input: JoinGroupInput,
  userId: string,
  db: Queryable = defaultDb,
): Promise<GroupWithRole> {
  const code = normalizeInviteCode(input.inviteCode);
  if (!isValidInviteCode(code)) throw new NotFoundError("That invite code isn't valid.");

  const [group] = await db.select().from(groups).where(eq(groups.inviteCode, code)).limit(1);
  if (!group) throw new NotFoundError("That invite code isn't valid.");

  const existing = await roleOf(group.id, userId, db);
  if (existing) return { group, role: existing };

  await db
    .insert(groupMembers)
    .values({ groupId: group.id, userId, role: "member" })
    // Two taps on the same invite link should be idempotent, not an error.
    .onConflictDoNothing();

  const role = (await roleOf(group.id, userId, db)) ?? "member";
  return { group, role };
}

/** Rotate the invite code, invalidating every previously shared link. Spec §6. */
export async function regenerateInviteCode(
  groupId: string,
  actorRole: GroupRole,
  db: Queryable = defaultDb,
): Promise<string> {
  assertCan(actorRole, "invite");

  for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt += 1) {
    const code = generateInviteCode();
    try {
      await db.update(groups).set({ inviteCode: code }).where(eq(groups.id, groupId));
      return code;
    } catch (err) {
      if (!isUniqueViolation(err, "groups_invite_code_unique") || attempt === MAX_GENERATION_ATTEMPTS) throw err;
    }
  }
  throw new ConflictError("Could not generate a new invite code. Please try again.");
}

export interface MemberSummary {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  isGuest: boolean;
  role: GroupRole;
  joinedAt: Date;
}

export async function listMembers(groupId: string, db: Queryable = defaultDb): Promise<MemberSummary[]> {
  return db
    .select({
      userId: users.id,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
      isGuest: users.isGuest,
      role: groupMembers.role,
      joinedAt: groupMembers.joinedAt,
    })
    .from(groupMembers)
    .innerJoin(users, eq(users.id, groupMembers.userId))
    .where(eq(groupMembers.groupId, groupId))
    .orderBy(groupMembers.joinedAt);
}

/** Groups the user belongs to, most recently joined first. */
export async function listForUser(userId: string, db: Queryable = defaultDb): Promise<GroupWithRole[]> {
  const rows = await db
    .select({ group: groups, role: groupMembers.role })
    .from(groupMembers)
    .innerJoin(groups, eq(groups.id, groupMembers.groupId))
    .where(eq(groupMembers.userId, userId))
    .orderBy(groupMembers.joinedAt);
  return rows;
}

/**
 * Add a guest player to a group so they can appear in matches.
 * Guests are members with the lowest useful role.
 */
export async function addMember(
  groupId: string,
  userId: string,
  role: GroupRole = "member",
  db: Queryable = defaultDb,
): Promise<void> {
  await db.insert(groupMembers).values({ groupId, userId, role }).onConflictDoNothing();
}

export async function removeMember(
  groupId: string,
  actorUserId: string,
  actorRole: GroupRole,
  targetUserId: string,
  db: Queryable = defaultDb,
): Promise<void> {
  // Leaving of your own accord is always allowed, except for the owner, who
  // would leave the group headless.
  if (actorUserId === targetUserId) {
    if (actorRole === "owner") {
      throw new ForbiddenError("Transfer ownership before leaving the group.");
    }
    await db
      .delete(groupMembers)
      .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, targetUserId)));
    return;
  }

  const targetRole = await roleOf(groupId, targetUserId, db);
  if (!targetRole) throw new NotFoundError("That person isn't in this group.");

  if (!canRemoveMember(actorRole, targetRole)) {
    throw new ForbiddenError("You don't have permission to remove that member.");
  }

  await db
    .delete(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, targetUserId)));
}

export async function changeMemberRole(
  groupId: string,
  actorUserId: string,
  actorRole: GroupRole,
  targetUserId: string,
  newRole: GroupRole,
  db: Queryable = defaultDb,
): Promise<void> {
  if (actorUserId === targetUserId) {
    throw new ValidationError("You can't change your own role.");
  }

  const targetRole = await roleOf(groupId, targetUserId, db);
  if (!targetRole) throw new NotFoundError("That person isn't in this group.");

  if (!canChangeRole(actorRole, targetRole, newRole)) {
    throw new ForbiddenError("You don't have permission to make that change.");
  }

  await db
    .update(groupMembers)
    .set({ role: newRole })
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, targetUserId)));
}
