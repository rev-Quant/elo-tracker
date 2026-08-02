import { handler, json } from "@/lib/http";
import { feed } from "@/server/notifications/service";
import { listForUser } from "@/server/groups/service";
import { currentUser } from "@/server/current-user";

export const GET = handler(async () => {
  const user = await currentUser();
  const groups = await listForUser(user.id);
  const items = await feed(user.id, groups.map((g) => g.group.id));
  return json({ items });
});