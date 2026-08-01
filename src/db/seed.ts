/**
 * Seeds the pre-loaded game catalog from spec §12.
 *
 * Idempotent: re-running updates existing rows by slug rather than duplicating.
 *   npm run db:seed
 */
import { sql as raw } from "drizzle-orm";
import { closeDb, db } from "./index";
import { type NewGame, games } from "./schema";

const CATALOG: NewGame[] = [
  {
    name: "Sequence",
    slug: "sequence",
    minPlayers: 2,
    maxPlayers: 12,
    supportsTeams: true,
    supportsFfa: true,
    rankingMode: "full",
  },
  {
    name: "Monopoly Deal",
    slug: "monopoly-deal",
    minPlayers: 2,
    maxPlayers: 5,
    supportsTeams: false,
    supportsFfa: true,
    rankingMode: "winner_only",
  },
  {
    name: "Pool (8-ball)",
    slug: "pool-8-ball",
    minPlayers: 2,
    maxPlayers: 4,
    supportsTeams: true,
    // Spec §12 marks Pool as teams-only (FFA ✗).
    supportsFfa: false,
    rankingMode: "full",
  },
  {
    name: "Catan",
    slug: "catan",
    minPlayers: 3,
    maxPlayers: 4,
    supportsTeams: false,
    supportsFfa: true,
    rankingMode: "full",
  },
  {
    name: "Codenames",
    slug: "codenames",
    minPlayers: 4,
    maxPlayers: 8,
    supportsTeams: true,
    supportsFfa: false,
    rankingMode: "winner_only",
  },
  {
    name: "Chess",
    slug: "chess",
    minPlayers: 2,
    maxPlayers: 2,
    supportsTeams: false,
    supportsFfa: true,
    rankingMode: "full",
  },
  {
    name: "Coup",
    slug: "coup",
    minPlayers: 3,
    maxPlayers: 6,
    supportsTeams: false,
    supportsFfa: true,
    rankingMode: "full",
  },
  {
    name: "Ticket to Ride",
    slug: "ticket-to-ride",
    minPlayers: 2,
    maxPlayers: 5,
    supportsTeams: false,
    supportsFfa: true,
    rankingMode: "full",
  },
];

async function main() {
  const rows = await db
    .insert(games)
    .values(CATALOG)
    .onConflictDoUpdate({
      target: games.slug,
      set: {
        name: raw`excluded.name`,
        minPlayers: raw`excluded.min_players`,
        maxPlayers: raw`excluded.max_players`,
        supportsTeams: raw`excluded.supports_teams`,
        supportsFfa: raw`excluded.supports_ffa`,
        rankingMode: raw`excluded.ranking_mode`,
      },
    })
    .returning({ slug: games.slug, name: games.name });

  console.log(`Seeded ${rows.length} games:`);
  for (const r of rows) console.log(`  - ${r.name} (${r.slug})`);
}

main()
  .then(() => closeDb())
  .catch(async (err) => {
    console.error(err);
    await closeDb();
    process.exit(1);
  });
