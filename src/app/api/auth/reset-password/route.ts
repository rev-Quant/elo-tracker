import { handler, json, parseJson } from "@/lib/http";
import { sendPasswordResetEmail } from "@/lib/email";
import { z } from "zod";
import { requestPasswordReset, resetPassword } from "@/server/auth/tokens";

const requestSchema = z.object({ email: z.string().trim().toLowerCase().email() });
const confirmSchema = z.object({ token: z.string().min(1), password: z.string().min(8).max(200) });

export const POST = handler(async (request: Request) => {
  const { email } = await parseJson(request, requestSchema);
  const result = await requestPasswordReset(email);
  if (result) sendPasswordResetEmail(result.email, result.token).catch(() => {});
  return json({ ok: true });
});

export const PATCH = handler(async (request: Request) => {
  const { token, password } = await parseJson(request, confirmSchema);
  await resetPassword(token, password);
  return json({ ok: true });
});