import { handler, json } from "@/lib/http";
import { voidMatch } from "@/server/matches/void";
import { currentUser } from "@/server/current-user";

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * Undo/dispute, unified. Spec §3 (60s undo) and §4/§11 (disputes) — see the
 * design note atop src/server/matches/void.ts for why these share one action.
 */
export const DELETE = handler(async (_request: Request, { params }: Params) => {
  const { id } = await params;
  const user = await currentUser();
  const result = await voidMatch(id, user.id);
  return json(result);
});
