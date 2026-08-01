import { asc } from "drizzle-orm";
import { db } from "@/db";
import { games } from "@/db/schema";
import { handler, json, parseJson } from "@/lib/http";
import { createGameSchema } from "@/server/games/schemas";
import { createGame } from "@/server/games/service";
import { currentUser } from "@/server/current-user";

/** Game catalog. Spec §11 GET /api/games. */
export const GET = handler(async () => {
  const catalog = await db.select().from(games).orderBy(asc(games.name));
  return json({ games: catalog });
});

/** Add a custom game. Spec §12: "Users can add custom games via the API." */
export const POST = handler(async (request: Request) => {
  const user = await currentUser();
  const input = await parseJson(request, createGameSchema);
  const game = await createGame(input, user.id);
  return json({ game }, { status: 201 });
});
