import { startSession } from "@/lib/auth/session";
import { handler, json, parseJson } from "@/lib/http";
import { loginSchema } from "@/server/auth/schemas";
import { login, toPublicUser } from "@/server/auth/service";

export const POST = handler(async (request: Request) => {
  const input = await parseJson(request, loginSchema);
  const user = await login(input);
  await startSession({ userId: user.id, isGuest: user.isGuest });
  return json({ user: toPublicUser(user) });
});
