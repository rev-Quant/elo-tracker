import Link from "next/link";
import { db } from "@/db";
import { groupMembers, groups } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GroupSwitcher({ currentSlug, userId }: { currentSlug: string; userId: string }) {
  const rows = await db
    .select({ slug: groups.slug, name: groups.name })
    .from(groupMembers)
    .innerJoin(groups, eq(groups.id, groupMembers.groupId))
    .where(eq(groupMembers.userId, userId))
    .orderBy(groupMembers.joinedAt);

  const others = rows.filter((g) => g.slug !== currentSlug);
  if (others.length === 0) return null;

  return (
    <div className="mb-4 flex items-center gap-1.5 overflow-x-auto pb-1">
      {others.map((g) => (
        <Link
          key={g.slug}
          href={`/g/${g.slug}`}
          className="shrink-0 rounded-full border border-border px-3 py-1 text-[0.6875rem] font-medium text-muted-dim transition hover:border-muted hover:text-muted"
        >
          {g.name}
        </Link>
      ))}
    </div>
  );
}