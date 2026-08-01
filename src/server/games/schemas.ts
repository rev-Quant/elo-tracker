import { z } from "zod";

export const createGameSchema = z.object({
  name: z.string().trim().min(1, "Please name the game.").max(60),
  minPlayers: z.number().int().min(2).max(32).default(2),
  maxPlayers: z.number().int().min(2).max(32).optional(),
  supportsFfa: z.boolean().default(true),
  supportsTeams: z.boolean().default(false),
  rankingMode: z.enum(["full", "winner_only", "top_n"]).default("full"),
});
export type CreateGameInput = z.infer<typeof createGameSchema>;
