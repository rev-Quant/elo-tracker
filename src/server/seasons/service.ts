import { and, desc, eq } from "drizzle-orm";
import { type Queryable, db as defaultDb } from "@/db";
import { seasons } from "@/db/schema";
import { NotFoundError } from "@/lib/errors";
import { assertCan } from "@/lib/permissions";
import * as groupsService from "@/server/groups/service";
import type { CreateSeasonInput } from "./schemas";

export async function createSeason(
  input: CreateSeasonInput,
  groupSlug: string,
  creatorUserId: string,
  db: Queryable = defaultDb,
) {
  const { group, role } = await groupsService.requireMembership(groupSlug, creatorUserId, db);
  assertCan(role, "create_seasons");

  const [season] = await db
    .insert(seasons)
    .values({ name: input.name, groupId: group.id, startsAt: input.startsAt, endsAt: input.endsAt ?? null })
    .returning();
  return season;
}

export async function listSeasons(
  groupSlug: string,
  userId: string,
  db: Queryable = defaultDb,
) {
  const { group } = await groupsService.requireMembership(groupSlug, userId, db);
  return db
    .select()
    .from(seasons)
    .where(eq(seasons.groupId, group.id))
    .orderBy(desc(seasons.startsAt));
}

export async function endSeason(
  seasonId: string,
  groupSlug: string,
  actorUserId: string,
  db: Queryable = defaultDb,
) {
  const { group, role } = await groupsService.requireMembership(groupSlug, actorUserId, db);
  assertCan(role, "create_seasons");

  const [season] = await db.select().from(seasons).where(eq(seasons.id, seasonId)).limit(1);
  if (!season || season.groupId !== group.id) throw new NotFoundError("Season not found.");

  const [updated] = await db
    .update(seasons)
    .set({ endsAt: new Date(), isActive: false })
    .where(eq(seasons.id, seasonId))
    .returning();
  return updated;
}