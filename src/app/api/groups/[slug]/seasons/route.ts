import { handler, json, parseJson } from "@/lib/http";
import { createSeasonSchema } from "@/server/seasons/schemas";
import { createSeason, listSeasons, endSeason } from "@/server/seasons/service";
import { currentUser } from "@/server/current-user";

interface Params { params: Promise<{ slug: string }> }

export const GET = handler(async (_: Request, { params }: Params) => {
  const { slug } = await params;
  const user = await currentUser();
  return json({ seasons: await listSeasons(slug, user.id) });
});

export const POST = handler(async (request: Request, { params }: Params) => {
  const { slug } = await params;
  const user = await currentUser();
  const input = await parseJson(request, createSeasonSchema);
  return json({ season: await createSeason(input, slug, user.id) }, { status: 201 });
});