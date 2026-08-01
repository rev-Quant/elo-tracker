import { type Queryable, db as defaultDb } from "@/db";
import { isUniqueViolation } from "@/db/errors";
import { type Game, games } from "@/db/schema";
import { ConflictError } from "@/lib/errors";
import { slugWithSuffix, slugifyWithFallback } from "@/lib/ids";
import type { CreateGameInput } from "./schemas";

/**
 * Custom games. Spec §12: "Users can add custom games via the API."
 *
 * Global catalog, not group-scoped — any signed-in user (including a guest)
 * may add one, matching the spec's lack of a permission check here.
 */
export async function createGame(
  input: CreateGameInput,
  createdByUserId: string,
  db: Queryable = defaultDb,
): Promise<Game> {
  if (input.maxPlayers !== undefined && input.maxPlayers < input.minPlayers) {
    throw new ConflictError("Max players can't be lower than min players.");
  }
  if (!input.supportsFfa && !input.supportsTeams) {
    throw new ConflictError("A game must support at least one of FFA or teams.");
  }

  const baseSlug = slugifyWithFallback(input.name, "game");

  for (let attempt = 1; attempt <= 8; attempt += 1) {
    const slug = attempt === 1 ? baseSlug : slugWithSuffix(baseSlug, attempt);
    try {
      const [game] = await db
        .insert(games)
        .values({
          name: input.name,
          slug,
          minPlayers: input.minPlayers,
          maxPlayers: input.maxPlayers ?? null,
          supportsFfa: input.supportsFfa,
          supportsTeams: input.supportsTeams,
          rankingMode: input.rankingMode,
          createdByUserId,
        })
        .returning();
      return game;
    } catch (err) {
      if (!isUniqueViolation(err, "games_slug_unique") || attempt === 8) throw err;
    }
  }
  throw new ConflictError("Could not create that game. Try a different name.");
}
