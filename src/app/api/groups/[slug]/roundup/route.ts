import { handler, json } from "@/lib/http";
import { roundup } from "@/server/groups/roundup";
import { requireMembership } from "@/server/groups/service";
import { currentUser } from "@/server/current-user";

interface Params {
  params: Promise<{ slug: string }>;
}

/** Spec §11 GET /api/groups/:slug/roundup — computed live, see roundup.ts. */
export const GET = handler(async (_request: Request, { params }: Params) => {
  const { slug } = await params;
  const user = await currentUser();
  const { group } = await requireMembership(slug, user.id);
  return json(await roundup(group.id));
});
