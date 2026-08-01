import { getSession, startSession } from "@/lib/auth/session";
import { handler, json, parseJson } from "@/lib/http";
import { createGuestSchema } from "@/server/auth/schemas";
import { createGuest, toPublicUser } from "@/server/auth/service";

/**
 * Create a guest identity. Spec §6 "group-first onboarding": someone following
 * an invite link can log a game with only a name, and claim the account later.
 *
 * If a signed-in user calls this, the new guest is attributed to them — that is
 * the "+ Guest" button in the match logging flow (spec §3).
 */
export const POST = handler(async (request: Request) => {
  const input = await parseJson(request, createGuestSchema);
  const session = await getSession();

  const guest = await createGuest(input, { createdByUserId: session?.userId });

  // Only adopt the guest identity if nobody is signed in; a host adding a
  // friend to the table must stay logged in as themselves.
  if (!session) await startSession({ userId: guest.id, isGuest: true });

  return json({ user: toPublicUser(guest) }, { status: 201 });
});
