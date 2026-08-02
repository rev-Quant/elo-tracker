import { handler, json, parseJson } from "@/lib/http";
import { createTeamSchema, memberActionSchema } from "@/server/teams/schemas";
import { addTeamMember, createTeam, listTeams, removeTeamMember } from "@/server/teams/service";
import { currentUser } from "@/server/current-user";

interface Params { params: Promise<{ slug: string }> }

export const GET = handler(async (_: Request, { params }: Params) => {
  const { slug } = await params;
  const user = await currentUser();
  return json({ teams: await listTeams(slug, user.id) });
});

export const POST = handler(async (request: Request, { params }: Params) => {
  const { slug } = await params;
  const user = await currentUser();
  const input = await parseJson(request, createTeamSchema);
  return json({ team: await createTeam(input, slug, user.id) }, { status: 201 });
});

export const PATCH = handler(async (request: Request, { params }: Params) => {
  const { slug } = await params;
  const user = await currentUser();
  const { action, userId: memberId } = await parseJson(request, memberActionSchema);
  const teamId = new URL(request.url).searchParams.get("teamId") ?? "";
  if (action === "add") await addTeamMember(teamId, slug, user.id, memberId);
  else await removeTeamMember(teamId, slug, user.id, memberId);
  return json({ ok: true });
});