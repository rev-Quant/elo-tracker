import { endSession } from "@/lib/auth/session";
import { handler, json } from "@/lib/http";

export const POST = handler(async () => {
  await endSession();
  return json({ ok: true });
});
