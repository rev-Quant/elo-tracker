import { startSession } from "@/lib/auth/session";
import { handler, json, parseJson } from "@/lib/http";
import { registerSchema } from "@/server/auth/schemas";
import { register, toPublicUser } from "@/server/auth/service";

export const POST = handler(async (request: Request) => {
  const input = await parseJson(request, registerSchema);
  const user = await register(input);
  await startSession({ userId: user.id, isGuest: false });
  return json({ user: toPublicUser(user) }, { status: 201 });
});
