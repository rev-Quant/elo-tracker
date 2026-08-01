import { asc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/db";
import { games as gamesTable, matchParticipants } from "@/db/schema";
import { LogMatchForm } from "@/components/log-match-form";
import { PageTitle } from "@/components/ui";
import { getSession } from "@/lib/auth/session";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { assertCan } from "@/lib/permissions";
import { gamesPlayedBy, lastMatch } from "@/server/groups/queries";
import { listMembers, requireMembership } from "@/server/groups/service";

export const dynamic = "force-dynamic";

export default async function LogMatchPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await getSession();
  if (!session) redirect("/");

  let membership;
  try {
    membership = await requireMembership(slug, session.userId);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }
  const { group, role } = membership;

  try {
    assertCan(role, "log_match");
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return (
        <main>
          <PageTitle sub="Spectators can follow along but not record results.">
            Can&apos;t log here
          </PageTitle>
          <Link href={`/g/${slug}`} className="text-sm text-accent">
            Back to {group.name}
          </Link>
        </main>
      );
    }
    throw err;
  }

  const [catalog, members, played, previous] = await Promise.all([
    db.select().from(gamesTable).orderBy(asc(gamesTable.name)),
    listMembers(group.id),
    gamesPlayedBy(group.id),
    lastMatch(group.id),
  ]);

  // Pre-fill with last match's line-up, which is the common case (spec §3).
  const previousParticipants = previous
    ? await db
        .select({ userId: matchParticipants.userId, finalRank: matchParticipants.finalRank })
        .from(matchParticipants)
        .where(eq(matchParticipants.matchId, previous.id))
        .orderBy(asc(matchParticipants.finalRank))
    : [];

  const memberIds = new Set(members.map((m) => m.userId));

  return (
    <main>
      <Link href={`/g/${slug}`} className="mb-3 inline-block text-sm text-muted hover:text-text">
        ← {group.name}
      </Link>
      <PageTitle>Log a game</PageTitle>

      <LogMatchForm
        slug={slug}
        games={catalog.map((g) => ({
          id: g.id,
          name: g.name,
          minPlayers: g.minPlayers,
          maxPlayers: g.maxPlayers,
          supportsFfa: g.supportsFfa,
          supportsTeams: g.supportsTeams,
          rankingMode: g.rankingMode,
        }))}
        members={members.map((m) => ({ userId: m.userId, displayName: m.displayName }))}
        defaultGameId={previous?.gameId ?? played[0]?.id ?? null}
        defaultParticipantIds={previousParticipants
          .map((p) => p.userId)
          // A player removed from the group since the last match must not
          // silently reappear in the pre-filled line-up.
          .filter((id) => memberIds.has(id))}
      />
    </main>
  );
}
