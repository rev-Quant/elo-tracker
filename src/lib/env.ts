import { z } from "zod";

/**
 * Validated server-side environment. Importing this from client code will
 * (correctly) fail the build, since none of these are NEXT_PUBLIC_.
 */
const schema = z.object({
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL is required")
    .refine((v) => v.startsWith("postgres://") || v.startsWith("postgresql://"), {
      message: "DATABASE_URL must be a postgres:// or postgresql:// connection string",
    }),

  /** HMAC key for session cookies. Generate with: openssl rand -base64 48 */
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),

  /** Resend API key. Optional — email sending is skipped if unset. */
  RESEND_API_KEY: z.string().optional(),

  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;

  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}\n\nCopy .env.example to .env.local and fill it in.`);
  }

  cached = parsed.data;
  return cached;
}
