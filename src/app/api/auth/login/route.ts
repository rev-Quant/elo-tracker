import { startSession } from "@/lib/auth/session";
import { handler, json, parseJson } from "@/lib/http";
import { check } from "@/lib/rate-limit";
import { TooManyRequestsError } from "@/lib/errors";
import { loginSchema } from "@/server/auth/schemas";
import { login, toPublicUser } from "@/server/auth/service";

export const POST = handler(async (request: Request) => {
  const input = await parseJson(request, loginSchema);

  const key = `login:${request.headers.get("x-forwarded-for") ?? "unknown"}:${input.email}`;
  if (!check(key, 15, 15 * 60_000)) {
    throw new TooManyRequestsError("Too many login attempts. Wait 15 minutes.");
  }

  const user = await login(input);
  await startSession({ userId: user.id, isGuest: user.isGuest });
  return json({ user: toPublicUser(user) });
});