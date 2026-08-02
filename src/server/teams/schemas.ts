import { z } from "zod";

export const createTeamSchema = z.object({
  name: z.string().trim().min(1, "Team name required.").max(40),
});
export type CreateTeamInput = z.infer<typeof createTeamSchema>;

export const memberActionSchema = z.object({
  action: z.enum(["add", "remove"]),
  userId: z.uuid(),
});
