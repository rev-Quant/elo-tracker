import { requireSession, startSession } from "@/lib/auth/session";
import { ForbiddenError } from "@/lib/errors";
import { handler, json, parseJson } from "@/lib/http";
import { claimGuestSchema } from "@/server/auth/schemas";
import { claimGuest, toPublicUser } from "@/server/auth/service";

/**
 * Guest -> registered upgrade. Spec §6.
 *
 * The caller must already hold the guest's session, otherwise anyone who
 * learned a guest's id could seize their match history.
 */
export const POST = handler(async (request: Request) => {
  const input = await parseJson(request, claimGuestSchema);

  const session = await requireSession();
  if (session.userId !== input.guestUserId) {
    throw new ForbiddenError("You can only claim the profile you're currently using.");
  }

  const user = await claimGuest(input);
  await startSession({ userId: user.id, isGuest: false });
  return json({ user: toPublicUser(user) });
});
