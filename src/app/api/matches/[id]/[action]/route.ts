import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { matchConfirmations, matches } from "@/db/schema";
import { handler, json } from "@/lib/http";
import { ForbiddenError } from "@/lib/errors";
import { currentUser } from "@/server/current-user";

interface Params { params: Promise<{ id: string; action: string }> }

export const POST = handler(async (_: Request, { params }: Params) => {
  const { id, action } = await params;
  if (action !== "confirm" && action !== "dispute") throw new ForbiddenError("Invalid action.");
  const user = await currentUser();

  if (action === "confirm") {
    await db.insert(matchConfirmations).values({ matchId: id, userId: user.id }).onConflictDoNothing();
  } else {
    await db.update(matches).set({ status: "disputed" }).where(and(eq(matches.id, id)));
  }

  return json({ ok: true });
});