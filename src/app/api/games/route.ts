import { asc } from "drizzle-orm";
import { db } from "@/db";
import { games } from "@/db/schema";
import { handler, json } from "@/lib/http";

/** Game catalog. Spec §11 GET /api/games. */
export const GET = handler(async () => {
  const catalog = await db.select().from(games).orderBy(asc(games.name));
  return json({ games: catalog });
});
