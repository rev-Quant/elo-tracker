import { handler, json } from "@/lib/http";
import { globalLeaderboard } from "@/server/phase4/service";

export const GET = handler(async () => json({ leaderboard: await globalLeaderboard() }));
