import { handler, json, parseJson } from "@/lib/http";
import { createGroupSchema } from "@/server/groups/schemas";
import { createGroup, listForUser } from "@/server/groups/service";
import { currentUser } from "@/server/current-user";

export const GET = handler(async () => {
  const user = await currentUser();
  const groups = await listForUser(user.id);
  return json({ groups });
});

export const POST = handler(async (request: Request) => {
  const user = await currentUser();
  const input = await parseJson(request, createGroupSchema);
  const group = await createGroup(input, user.id);
  return json({ group }, { status: 201 });
});
