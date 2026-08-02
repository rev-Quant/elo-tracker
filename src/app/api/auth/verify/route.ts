import { handler, json } from "@/lib/http";
import { verifyEmail } from "@/server/auth/tokens";

/** GET /api/auth/verify?userId=xxx — marks email as verified. */
export const GET = handler(async (request: Request) => {
  const userId = new URL(request.url).searchParams.get("userId");
  if (!userId) return json({ error: "Missing token." }, { status: 400 });
  await verifyEmail(userId);
  return json({ verified: true });
});