import type { Db } from "@/db";
import { type Game, type Group, type NewGame, type User, games } from "@/db/schema";
import { generateInviteCode, slugify } from "@/lib/ids";
import * as authService from "@/server/auth/service";
import * as groupsService from "@/server/groups/service";

/** Fixture builders shared by the service integration tests. */

let seq = 0;
const next = () => ++seq;

export async function makeUser(db: Db, displayName = `User ${next()}`): Promise<User> {
  return authService.register(
    { displayName, email: `u${next()}@example.com`, password: "a good test password" },
    db,
  );
}

export async function makeGuest(db: Db, displayName = `Guest ${next()}`): Promise<User> {
  return authService.createGuest({ displayName }, {}, db);
}

export async function makeGroup(db: Db, owner: User, name = `Group ${next()}`): Promise<Group> {
  return groupsService.createGroup({ name, isPublic: false, timezone: "UTC" }, owner.id, db);
}

export async function makeGame(db: Db, overrides: Partial<NewGame> = {}): Promise<Game> {
  const name = overrides.name ?? `Game ${next()}`;
  const [game] = await db
    .insert(games)
    .values({
      name,
      slug: overrides.slug ?? `${slugify(name)}-${next()}`,
      minPlayers: 2,
      maxPlayers: null,
      supportsFfa: true,
      supportsTeams: false,
      rankingMode: "full",
      ...overrides,
    })
    .returning();
  return game;
}

/** A group with `count` members, the first of which is the owner. */
export async function makeGroupWithMembers(
  db: Db,
  count: number,
): Promise<{ group: Group; members: User[] }> {
  const owner = await makeUser(db);
  const group = await makeGroup(db, owner);
  const members = [owner];

  for (let i = 1; i < count; i += 1) {
    const user = await makeUser(db);
    await groupsService.addMember(group.id, user.id, "member", db);
    members.push(user);
  }

  return { group, members };
}

export { generateInviteCode };
