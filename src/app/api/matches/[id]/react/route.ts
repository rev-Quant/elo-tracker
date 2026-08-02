import { handler, json, parseJson } from "@/lib/http";
import { z } from "zod";
import { toggleReaction, getReactions } from "@/server/phase4/service";
import { currentUser } from "@/server/current-user";

const reactSchema = z.object({ emoji: z.string().min(1).max(4) });

interface Params { params: Promise<{ id: string }> }

export const GET = handler(async (_: Request, { params }: Params) => {
  return json(await getReactions((await params).id));
});

export const POST = handler(async (request: Request, { params }: Params) => {
  const user = await currentUser();
  const { emoji } = await parseJson(request, reactSchema);
  return json(await toggleReaction((await params).id, user.id, emoji));
});