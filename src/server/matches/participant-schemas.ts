import { z } from "zod";

export const updateParticipantSchema = z.object({
  status: z.enum(["active", "left_early", "left_excused"]),
  leftAtMove: z.number().int().min(1).optional(),
});
export type UpdateParticipantInput = z.infer<typeof updateParticipantSchema>;
