import { z } from "zod";

export const createSeasonSchema = z.object({
  name: z.string().trim().min(1, "Season name required.").max(60),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date().optional(),
});
export type CreateSeasonInput = z.infer<typeof createSeasonSchema>;
