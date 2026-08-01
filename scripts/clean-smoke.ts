import "dotenv/config";
import { inArray, like, or } from "drizzle-orm";
import { closeDb, db } from "../src/db";
import { groups, users } from "../src/db/schema";

/**
 * Removes rows created by scripts/smoke.ts and scripts/smoke-pages.ts.
 *
 * Groups are deleted first: matches, participants, ratings, snapshots and
 * memberships all cascade from them, which frees the users to be deleted.
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
    .where(or(like(groups.name, "Smoke Group %"), like(groups.name, "Page Group %")));

  if (testGroups.length > 0) {
    await db.delete(groups).where(
      inArray(
        groups.id,
        testGroups.map((g) => g.id),
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

  console.log(`Removed ${testGroups.length} test groups and ${testUsers.length} test users.`);
}

main()
  .then(closeDb)
  .catch(async (err) => {
    console.error(err);
    await closeDb();
    process.exit(1);
  });
