/**
 * Group permission matrix. Spec §6 "Roles & Permissions".
 *
 * Pure and synchronous: callers load the actor's role once, then ask this
 * module. Keeping it free of DB access is what makes it exhaustively testable.
 */
import { ForbiddenError } from "./errors";

export const GROUP_ROLES = ["owner", "admin", "member", "spectator"] as const;
export type GroupRole = (typeof GROUP_ROLES)[number];

export const PERMISSIONS = [
  "log_match",
  "invite",
  "remove_members",
  "void_matches",
  "delete_group",
  "create_seasons",
  /** Not in the spec's table, but every role that can log can also correct
   *  their own mistake inside the 60-second undo window (spec §3). */
  "manage_group_settings",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/** Transcribed directly from the spec §6 table. */
const MATRIX: Readonly<Record<GroupRole, readonly Permission[]>> = {
  owner: [
    "log_match",
    "invite",
    "remove_members",
    "void_matches",
    "delete_group",
    "create_seasons",
    "manage_group_settings",
  ],
  // Spec: admin has everything except delete_group.
  admin: ["log_match", "invite", "remove_members", "void_matches", "create_seasons", "manage_group_settings"],
  member: ["log_match"],
  spectator: [],
};

const MATRIX_SETS: Readonly<Record<GroupRole, ReadonlySet<Permission>>> = {
  owner: new Set(MATRIX.owner),
  admin: new Set(MATRIX.admin),
  member: new Set(MATRIX.member),
  spectator: new Set(MATRIX.spectator),
};

export function can(role: GroupRole, permission: Permission): boolean {
  return MATRIX_SETS[role].has(permission);
}

export function permissionsFor(role: GroupRole): readonly Permission[] {
  return MATRIX[role];
}

export class PermissionError extends ForbiddenError {
  constructor(
    readonly role: GroupRole,
    readonly permission: Permission,
  ) {
    super(`Role "${role}" is not allowed to ${permission.replace(/_/g, " ")}.`);
    this.name = "PermissionError";
  }
}

export function assertCan(role: GroupRole, permission: Permission): void {
  if (!can(role, permission)) throw new PermissionError(role, permission);
}

/**
 * Seniority, used for actions that target another member.
 *
 * SPEC GAP: §6 says admins "can remove members" but does not say whether an
 * admin may remove an owner or a peer admin. Left unchecked, any admin could
 * demote the owner and seize the group. Rule adopted here: you may only act on
 * a strictly more junior member. Owners are therefore unremovable by anyone
 * but themselves (see `canRemoveMember`).
 */
const SENIORITY: Readonly<Record<GroupRole, number>> = {
  owner: 3,
  admin: 2,
  member: 1,
  spectator: 0,
};

export function isMoreSeniorThan(actor: GroupRole, target: GroupRole): boolean {
  return SENIORITY[actor] > SENIORITY[target];
}

/** Can `actor` remove `target` from the group? Self-removal (leaving) is separate. */
export function canRemoveMember(actor: GroupRole, target: GroupRole): boolean {
  return can(actor, "remove_members") && isMoreSeniorThan(actor, target);
}

/** Can `actor` change `target`'s role to `newRole`? */
export function canChangeRole(actor: GroupRole, target: GroupRole, newRole: GroupRole): boolean {
  // Only owners restructure the leadership of a group.
  if (actor !== "owner") {
    // An admin may only shuffle people strictly below both themselves and the
    // rank they are assigning, i.e. between member and spectator.
    return (
      can(actor, "remove_members") && isMoreSeniorThan(actor, target) && isMoreSeniorThan(actor, newRole)
    );
  }
  // An owner may not silently demote themselves; ownership transfer is an
  // explicit, separate operation so a group is never left ownerless.
  return newRole !== "owner";
}
