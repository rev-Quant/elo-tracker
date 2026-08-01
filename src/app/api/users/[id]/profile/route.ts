import { ValidationError } from "@/lib/errors";
import { handler, json } from "@/lib/http";
import { requireMembership } from "@/server/groups/service";
import { profile } from "@/server/users/queries";
import { currentUser } from "@/server/current-user";

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * Spec §11 GET /api/users/:id/profile.
 *
 * Profiles are scoped to a group (spec §9 makes group membership the
 * visibility boundary), so `?group=<slug>` is required and the caller must
 * belong to it.
 */
export const GET = handler(async (request: Request, { params }: Params) => {
  const { id } = await params;
  const viewer = await currentUser();

  const slug = new URL(request.url).searchParams.get("group");
  if (!slug) throw new ValidationError("A group must be specified to view a profile.");

  // Throws 404 if the viewer isn't a member, so this also authorises the read.
  const { group } = await requireMembership(slug, viewer.id);

  return json(await profile(id, group.id));
});
