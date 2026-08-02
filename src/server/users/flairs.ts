import { Badge, computeBadges } from "@/server/users/badges";

const FLAIR_MAP: Record<string, { emoji: string; label: string }> = {
  first_win: { emoji: "🏆", label: "Winner" },
  streak_5: { emoji: "🔥", label: "On Fire" },
  streak_10: { emoji: "🔥", label: "Inferno" },
  giant_slayer: { emoji: "🎯", label: "Giant Slayer" },
  iron_man: { emoji: "💪", label: "Iron Man" },
  century: { emoji: "💯", label: "Centurion" },
  perfect_week: { emoji: "📅", label: "Dedicated" },
};

export async function getFlairs(userId: string, groupId: string): Promise<{ emoji: string; label: string }[]> {
  const badges = await computeBadges(userId, groupId);
  return badges.filter((b) => b.id in FLAIR_MAP).map((b) => FLAIR_MAP[b.id]);
}

export { FLAIR_MAP };