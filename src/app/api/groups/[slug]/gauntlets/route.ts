import { handler, json, parseJson } from "@/lib/http";
import { z } from "zod";
import { createGauntlet, getActiveGauntlet } from "@/server/phase3/service";
import { currentUser } from "@/server/current-user";
import { requireMembership } from "@/server/groups/service";

const schema = z.object({ opponentId: z.uuid(), gameId: z.uuid(), bestOf: z.number().int().min(3).max(7).default(3) });

interface Params { params: Promise<{ slug: string }> }

export const GET = handler(async (request: Request, { params }: Params) => {
  const { slug } = await params;
  const user = await currentUser();
  await requireMembership(slug, user.id);
  const gameId = new URL(request.url).searchParams.get("gameId") ?? "";
  const active = gameId ? await getActiveGauntlet(user.id, gameId) : null;
  return json({ gauntlet: active });
});

export const POST = handler(async (request: Request, { params }: Params) => {
  const { slug } = await params;
  const user = await currentUser();
  const { group } = await requireMembership(slug, user.id);
  const input = await parseJson(request, schema);
  const gauntlet = await createGauntlet({ ...input, challengerId: user.id, groupId: group.id });
  return json({ gauntlet }, { status: 201 });
});