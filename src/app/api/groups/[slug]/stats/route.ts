import { handler, json } from "@/lib/http";
import { groupStats } from "@/server/groups/stats";
import { requireMembership } from "@/server/groups/service";
import { currentUser } from "@/server/current-user";

export const GET = handler(async (_request: Request, { params }: { params: Promise<{ slug: string }> }) => {
  const { slug } = await params;
  const user = await currentUser();
  const { group } = await requireMembership(slug, user.id);
  const stats = await groupStats(group.id);
  return json(stats);
});
