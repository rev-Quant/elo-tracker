import { handler, json, parseJson } from "@/lib/http";
import { updateParticipantSchema } from "@/server/matches/participant-schemas";
import { updateParticipantStatus } from "@/server/matches/participants";
import { currentUser } from "@/server/current-user";

interface Params { params: Promise<{ id: string; userId: string }> }

/** Spec §4: mark a player as left_early or left_excused. */
export const PATCH = handler(async (request: Request, { params }: Params) => {
  const { id, userId } = await params;
  const user = await currentUser();
  const input = await parseJson(request, updateParticipantSchema);
  return json(await updateParticipantStatus(id, userId, user.id, input));
});