import { handler, json, parseJson, parseQuery } from "@/lib/http";
import { requireMembership } from "@/server/groups/service";
import { history } from "@/server/matches/queries";
import { logMatchSchema, matchHistoryQuerySchema } from "@/server/matches/schemas";
import { logMatch } from "@/server/matches/service";
import { currentUser } from "@/server/current-user";

interface Params {
  params: Promise<{ slug: string }>;
}

/** Spec §11 GET /api/groups/:slug/matches — paginated history. */
export const GET = handler(async (request: Request, { params }: Params) => {
  const { slug } = await params;
  const user = await currentUser();
  const { group } = await requireMembership(slug, user.id);

  const query = parseQuery(request, matchHistoryQuerySchema);
  const page = await history(group.id, query);
  return json(page);
});

/** Spec §11 POST /api/groups/:slug/matches — log a match. */
export const POST = handler(async (request: Request, { params }: Params) => {
  const { slug } = await params;
  const user = await currentUser();
  const input = await parseJson(request, logMatchSchema);
  const result = await logMatch(input, slug, user.id);
  return json(result, { status: 201 });
});
