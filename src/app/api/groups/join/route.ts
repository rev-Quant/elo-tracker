import { handler, json, parseJson } from "@/lib/http";
import { joinGroupSchema } from "@/server/groups/schemas";
import { joinByInviteCode } from "@/server/groups/service";
import { currentUser } from "@/server/current-user";

/** Join via invite code. Spec §6 / §11 POST /api/groups/:slug/join. */
export const POST = handler(async (request: Request) => {
  const user = await currentUser();
  const input = await parseJson(request, joinGroupSchema);
  const { group, role } = await joinByInviteCode(input, user.id);
  return json({ group, role });
});
