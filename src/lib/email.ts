import { Resend } from "resend";

let resend: Resend | null | undefined;

function client(): Resend | null {
  if (resend === undefined) {
    const key = process.env.RESEND_API_KEY;
    resend = key ? new Resend(key) : null;
  }
  return resend;
}

const BASE_URL = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";

const FROM = process.env.RESEND_FROM ?? "onboarding@resend.dev";

export async function sendVerificationEmail(to: string, userId: string) {
  const c = client();
  if (!c) { console.warn("RESEND_API_KEY not set, skipping email"); return; }
  const link = `${BASE_URL}/api/auth/verify?userId=${encodeURIComponent(userId)}`;
  try {
    const result = await c.emails.send({
    from: `${FROM}`,
    to: [to],
    subject: "Verify your email — Board Game Tracker",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <h1 style="color:#5b9cf5;margin:0 0 8px">Board Game Tracker</h1>
        <p style="color:#334;font-size:16px;margin:0 0 16px">Thanks for signing up. Verify your email to complete your account.</p>
        <a href="${link}" style="display:inline-block;background:#5b9cf5;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">Verify email</a>
        <p style="color:#889;font-size:12px;margin:16px 0 0">If you didn't create this account, ignore this email.</p>
      </div>
    `,
  });
    if (result.error) console.error("Resend verification error:", result.error);
    else console.log("Verification email sent to", to);
  } catch (e) { console.error("Email send failed:", e); }
}

export async function sendPasswordResetEmail(to: string, token: string) {
  const c = client();
  if (!c) { console.warn("RESEND_API_KEY not set, skipping email"); return; }
  const link = `${BASE_URL}/reset?token=${encodeURIComponent(token)}`;
  try {
    const result = await c.emails.send({
      from: FROM,
      to: [to],
    subject: "Reset your password — Board Game Tracker",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <h1 style="color:#5b9cf5;margin:0 0 8px">Reset your password</h1>
        <p style="color:#334;font-size:16px;margin:0 0 16px">Click below to set a new password. This link expires in 1 hour.</p>
        <a href="${link}" style="display:inline-block;background:#5b9cf5;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">Reset password</a>
        <p style="color:#889;font-size:12px;margin:16px 0 0">If you didn't request this, ignore this email.</p>
      </div>
    `,
    });
    if (result.error) console.error("Resend reset error:", result.error);
    else console.log("Reset email sent to", to);
  } catch (e) { console.error("Reset email send failed:", e); }
}