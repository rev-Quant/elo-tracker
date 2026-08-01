import { handler, json } from "@/lib/http";
import { gamesPlayedBy, leaderboard } from "@/server/groups/queries";
import { listMembers, requireMembership } from "@/server/groups/service";
import { currentUser } from "@/server/current-user";

interface Params {
  params: Promise<{ slug: string }>;
}

/**
 * Group detail: members, the games they play, and a leaderboard.
 * Spec §11 GET /api/groups/:slug.
 */
export const GET = handler(async (request: Request, { params }: Params) => {
  const { slug } = await params;
  const user = await currentUser();
  const { group, role } = await requireMembership(slug, user.id);

  const [members, played] = await Promise.all([listMembers(group.id), gamesPlayedBy(group.id)]);

  // Default to the group's most-played game, matching the log-match flow.
  const requestedGameId = new URL(request.url).searchParams.get("gameId");
  const gameId = requestedGameId ?? played[0]?.id ?? null;
  const standings = gameId ? await leaderboard(group.id, gameId) : [];

  return json({ group, role, members, games: played, gameId, leaderboard: standings });
});
