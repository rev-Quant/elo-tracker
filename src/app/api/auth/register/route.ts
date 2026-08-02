import { startSession } from "@/lib/auth/session";
import { handler, json, parseJson } from "@/lib/http";
import { check } from "@/lib/rate-limit";
import { TooManyRequestsError } from "@/lib/errors";
import { sendVerificationEmail } from "@/lib/email";
import { registerSchema } from "@/server/auth/schemas";
import { register, toPublicUser } from "@/server/auth/service";

export const POST = handler(async (request: Request) => {
  const input = await parseJson(request, registerSchema);

  const key = `register:${request.headers.get("x-forwarded-for") ?? "unknown"}`;
  if (!check(key, 5, 60 * 60_000)) {
    throw new TooManyRequestsError("Too many accounts created from this IP. Wait an hour.");
  }

  const { user, verifyToken } = await register(input);
  await startSession({ userId: user.id, isGuest: false });

  // Fire-and-forget: don't block the response on email delivery
  if (user.email) sendVerificationEmail(user.email, user.id).catch(() => {});

  return json({ user: toPublicUser(user), verifyToken }, { status: 201 });
});