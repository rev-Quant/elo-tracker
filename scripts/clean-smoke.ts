import "dotenv/config";
import { inArray, like, or } from "drizzle-orm";
import { closeDb, db } from "../src/db";
import { games, groups, users } from "../src/db/schema";

/**
 * Removes rows created by scripts/smoke.ts and scripts/smoke-pages.ts.
 *
 * Order matters: groups cascade to matches/participants/ratings/snapshots,
 * which frees both the users and the custom games to be deleted.
 */
async function main() {
  const testUsers = await db
    .select({ id: users.id, displayName: users.displayName })
    .from(users)
    .where(
      or(
        like(users.email, "smoke-%@example.com"),
        like(users.email, "pages-%@example.com"),
        inArray(users.displayName, ["Charlie Guest", "Rival Rita"]),
      ),
    );

  const testGroups = await db
    .select({ id: groups.id, name: groups.name })
    .from(groups)
    .where(
      or(
        like(groups.name, "Smoke Group %"),
        like(groups.name, "Page Group %"),
        like(groups.name, "Renamed %"),
      ),
    );

  if (testGroups.length > 0) {
    await db.delete(groups).where(
      inArray(
        groups.id,
        testGroups.map((g) => g.id),
      ),
    );
  }

  const testGames = await db
    .select({ id: games.id })
    .from(games)
    .where(like(games.name, "Smoke Teams %"));
  if (testGames.length > 0) {
    await db.delete(games).where(
      inArray(
        games.id,
        testGames.map((g) => g.id),
      ),
    );
  }

  if (testUsers.length > 0) {
    await db.delete(users).where(
      inArray(
        users.id,
        testUsers.map((u) => u.id),
      ),
    );
  }

  console.log(
    `Removed ${testGroups.length} test groups, ${testGames.length} test games and ${testUsers.length} test users.`,
  );
}

main()
  .then(closeDb)
  .catch(async (err) => {
    console.error(err);
    await closeDb();
    process.exit(1);
  });
