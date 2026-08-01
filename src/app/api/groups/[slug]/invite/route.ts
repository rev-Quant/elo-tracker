import { handler, json } from "@/lib/http";
import { regenerateInviteCode, requireMembership } from "@/server/groups/service";
import { currentUser } from "@/server/current-user";

interface Params {
  params: Promise<{ slug: string }>;
}

/** Rotate the invite code, invalidating every previously shared link. Spec §6. */
export const POST = handler(async (_request: Request, { params }: Params) => {
  const { slug } = await params;
  const user = await currentUser();
  const { group, role } = await requireMembership(slug, user.id);
  const inviteCode = await regenerateInviteCode(group.id, role);
  return json({ inviteCode });
});
