import { handler, json, parseJson } from "@/lib/http";
import { z } from "zod";
import { saveSubscription } from "@/lib/push";
import { currentUser } from "@/server/current-user";

const schema = z.object({
  subscription: z.object({
    endpoint: z.string(),
    keys: z.object({ p256dh: z.string(), auth: z.string() }),
  }),
});

export const POST = handler(async (request: Request) => {
  const user = await currentUser();
  const { subscription } = await parseJson(request, schema);
  saveSubscription(user.id, subscription);
  return json({ ok: true });
});