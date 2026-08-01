import { handler, json, parseJson } from "@/lib/http";
import { assertCan } from "@/lib/permissions";
import { createGuestSchema } from "@/server/auth/schemas";
import { createGuest, toPublicUser } from "@/server/auth/service";
import { addMember, requireMembership } from "@/server/groups/service";
import { currentUser } from "@/server/current-user";
import { db } from "@/db";

interface Params {
  params: Promise<{ slug: string }>;
}

/**
 * The "+ Guest" button in the match logging flow (spec §3).
 *
 * Creating the user and adding them to the group must happen together:
 * `logMatch` rejects participants who are not members, so a guest created
 * without a membership could never actually be logged in a match.
 */
export const POST = handler(async (request: Request, { params }: Params) => {
  const { slug } = await params;
  const host = await currentUser();
  const { group, role } = await requireMembership(slug, host.id);

  // Anyone who can log a match can add the people sitting at the table.
  assertCan(role, "log_match");

  const input = await parseJson(request, createGuestSchema);

  const guest = await db.transaction(async (tx) => {
    const created = await createGuest(input, { createdByUserId: host.id }, tx);
    await addMember(group.id, created.id, "member", tx);
    return created;
  });

  return json({ user: toPublicUser(guest) }, { status: 201 });
});
