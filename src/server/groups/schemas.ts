import { z } from "zod";
import { MAX_SLUG_LENGTH } from "@/lib/ids";
import { GROUP_ROLES } from "@/lib/permissions";

export const groupNameSchema = z
  .string()
  .trim()
  .min(1, "Please name your group.")
  .max(60, "Group name must be 60 characters or fewer.");

export const createGroupSchema = z.object({
  name: groupNameSchema,
  isPublic: z.boolean().default(false),
  /** IANA zone, used for weekly-roundup week boundaries (spec §10). */
  timezone: z.string().trim().min(1).max(64).default("UTC"),
});
export type CreateGroupInput = z.infer<typeof createGroupSchema>;

export const groupSlugSchema = z
  .string()
  .trim()
  .min(1)
  .max(MAX_SLUG_LENGTH)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "That group URL isn't valid.");

export const joinGroupSchema = z.object({
  /** Accepts whatever the user typed; normalised before lookup. */
  inviteCode: z.string().trim().min(1, "Please enter an invite code."),
});
export type JoinGroupInput = z.infer<typeof joinGroupSchema>;

export const updateGroupSchema = z.object({
  name: groupNameSchema.optional(),
  isPublic: z.boolean().optional(),
  timezone: z.string().trim().min(1).max(64).optional(),
});
export type UpdateGroupInput = z.infer<typeof updateGroupSchema>;

export const updateMemberRoleSchema = z.object({
  role: z.enum(GROUP_ROLES),
});
export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;
