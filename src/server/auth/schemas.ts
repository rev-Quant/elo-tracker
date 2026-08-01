import { z } from "zod";

/**
 * Shared input schemas.
 *
 * Kept separate from the service functions so the same validation runs on the
 * client (form feedback) and the server (the actual trust boundary).
 */

export const displayNameSchema = z
  .string()
  .trim()
  .min(1, "Please enter a name.")
  .max(50, "Name must be 50 characters or fewer.");

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Please enter an email address.")
  .max(254, "That email address is too long.")
  .pipe(z.email("Please enter a valid email address."));

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .max(200, "Password must be 200 characters or fewer.");

export const registerSchema = z.object({
  displayName: displayNameSchema,
  email: emailSchema,
  password: passwordSchema,
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  // Deliberately not `passwordSchema`: an existing password that predates a
  // policy change must still be able to sign in.
  password: z.string().min(1, "Please enter your password."),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const createGuestSchema = z.object({
  displayName: displayNameSchema,
});
export type CreateGuestInput = z.infer<typeof createGuestSchema>;

/** Guest -> registered upgrade. Spec §6 / §11 POST /api/auth/claim-guest. */
export const claimGuestSchema = z.object({
  guestUserId: z.uuid("That guest link is invalid."),
  email: emailSchema,
  password: passwordSchema,
});
export type ClaimGuestInput = z.infer<typeof claimGuestSchema>;
