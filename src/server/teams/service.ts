import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { type Queryable, db as defaultDb } from "@/db";
import { teamMembers, teamRatings, teams, users } from "@/db/schema";
import { ConflictError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { assertCan } from "@/lib/permissions";
import { DISPLAY_BASE, ORDINAL_Z, MU, SIGMA, DISPLAY_SCALE } from "@/lib/rating";
import * as groupsService from "@/server/groups/service";
import type { CreateTeamInput } from "./schemas";

/** Persistent teams. Spec §1 note & §13. Schema existed, now wired. */

export interface TeamWithMembers {
  id: string;
  name: string;
  createdBy: string;
  members: { userId: string; displayName: string }[];
  avgRating: number;
  gamesPlayed: number;
}

export async function createTeam(
  input: CreateTeamInput,
  groupSlug: string,
  creatorUserId: string,
  db: Queryable = defaultDb,
): Promise<TeamWithMembers> {
  const { group, role } = await groupsService.requireMembership(groupSlug, creatorUserId, db);
  assertCan(role, "log_match");

  const [team] = await db
    .insert(teams)
    .values({ name: input.name, groupId: group.id, createdBy: creatorUserId })
    .returning();

  await db.insert(teamMembers).values({ teamId: team.id, userId: creatorUserId });

  return { id: team.id, name: team.name, createdBy: team.createdBy, members: [], avgRating: 1000, gamesPlayed: 0 };
}

export async function addTeamMember(
  teamId: string,
  groupSlug: string,
  actorUserId: string,
  newUserId: string,
  db: Queryable = defaultDb,
) {
  const { group, role } = await groupsService.requireMembership(groupSlug, actorUserId, db);
  const [team] = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
  if (!team || team.groupId !== group.id) throw new NotFoundError("Team not found.");

  await db.insert(teamMembers).values({ teamId, userId: newUserId }).onConflictDoNothing();
  return listTeams(group.slug, actorUserId, db);
}

export async function removeTeamMember(
  teamId: string,
  groupSlug: string,
  actorUserId: string,
  memberUserId: string,
  db: Queryable = defaultDb,
) {
  const { group, role } = await groupsService.requireMembership(groupSlug, actorUserId, db);
  const [team] = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
  if (!team || team.groupId !== group.id) throw new NotFoundError("Team not found.");

  await db
    .delete(teamMembers)
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, memberUserId)));
}

export async function listTeams(
  groupSlug: string,
  userId: string,
  db: Queryable = defaultDb,
): Promise<TeamWithMembers[]> {
  const { group } = await groupsService.requireMembership(groupSlug, userId, db);

  const rows = await db
    .select({
      id: teams.id,
      name: teams.name,
      createdBy: teams.createdBy,
      userId: teamMembers.userId,
      displayName: users.displayName,
    })
    .from(teams)
    .leftJoin(teamMembers, and(eq(teamMembers.teamId, teams.id), isNull(teamMembers.leftAt)))
    .leftJoin(users, eq(users.id, teamMembers.userId))
    .where(eq(teams.groupId, group.id))
    .orderBy(teams.createdAt);

  const map = new Map<string, TeamWithMembers>();
  for (const r of rows) {
    if (!map.has(r.id)) map.set(r.id, { id: r.id, name: r.name, createdBy: r.createdBy, members: [], avgRating: 1000, gamesPlayed: 0 });
    if (r.userId && r.displayName) map.get(r.id)!.members.push({ userId: r.userId, displayName: r.displayName });
  }
  return [...map.values()];
}