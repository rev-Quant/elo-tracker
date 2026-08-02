import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { VoidButton } from "@/components/match-actions";
import { Card, EmptyState, LinkButton, SectionTitle, WinRateBar } from "@/components/ui";
import { getSession } from "@/lib/auth/session";
import { NotFoundError } from "@/lib/errors";
import { can } from "@/lib/permissions";
import { daysSinceLastMatch, gamesPlayedBy, leaderboard } from "@/server/groups/queries";
import { requireMembership } from "@/server/groups/service";
import { history } from "@/server/matches/queries";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ game?: string }>;
}

export default async function GroupPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { game: gameSlugParam } = await searchParams;

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

  const played = await gamesPlayedBy(group.id);
  const selected = played.find((g) => g.slug === gameSlugParam) ?? played[0] ?? null;

  const [standings, recent, idleDays] = await Promise.all([
    selected ? leaderboard(group.id, selected.id) : Promise.resolve([]),
    history(group.id, { limit: 8 }),
    daysSinceLastMatch(group.id),
  ]);

  const stale = idleDays !== null && idleDays >= 14;
  const isSpectator = !can(role, "log_match");

  return (
    <main>
      <header className="mb-6">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-[1.65rem] font-bold leading-tight tracking-[-0.02em]">
            {group.name}
          </h1>
          <Link href={`/g/${slug}/settings`} className="shrink-0 text-[0.8125rem] font-medium text-muted hover:text-text">
            Settings
          </Link>
        </div>
        <p className="mt-1.5 text-[0.75rem] text-muted-dim">
          Share the invite code{" "}
          <span className="rounded-md bg-surface-2 px-2 py-0.5 font-mono text-[0.8125rem] font-medium text-text-dim">
            {group.inviteCode}
          </span>
        </p>
      </header>

      <div className="mb-5 flex gap-2">
        {isSpectator ? null : (
          <LinkButton href={`/g/${slug}/log`}>
            Log a game
          </LinkButton>
        )}
        <LinkButton href={`/g/${slug}/roundup`} variant="secondary">
          Weekly report
        </LinkButton>
      </div>

      {isSpectator ? (
        <Card className="mb-5 text-center text-sm text-muted">
          You&apos;re a spectator — follow along, but you can&apos;t log games.
        </Card>
      ) : null}

      {stale ? (
        <div className="mb-5 rounded-lg border border-amber/20 bg-amber/5 px-3.5 py-3 text-[0.8125rem] leading-relaxed text-amber">
          No games logged in a couple of weeks. Time for a game night?
        </div>
      ) : null}

      {played.length > 1 ? (
        <nav className="mb-4 -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {played.map((g) => {
            const active = g.id === selected?.id;
            return (
              <Link
                key={g.id}
                href={`/g/${slug}?game=${g.slug}`}
                className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[0.8125rem] font-medium transition-all duration-150 ${
                  active
                    ? "border-accent/50 bg-accent/10 text-accent"
                    : "border-border text-muted hover:border-muted-dim hover:text-text-dim"
                }`}
              >
                {g.name}
              </Link>
            );
          })}
        </nav>
      ) : null}

      {standings.length === 0 ? (
        <EmptyState
          icon="🏆"
          title="No games logged yet"
          body="Log your first match and the standings will appear. Everyone starts on equal footing — exactly 1,000."
          action={
            isSpectator ? null : <LinkButton href={`/g/${slug}/log`}>Log your first game</LinkButton>
          }
        />
      ) : (
        <Card noPadding glow>
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-muted-dim">
              {selected?.name} standings
            </h2>
          </div>
          <ul className="divide-y divide-border">
            {standings.map((entry) => (
              <li key={entry.userId}>
                <Link
                  href={`/g/${slug}/u/${entry.userId}`}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2"
                >
                  <span className="w-6 shrink-0 text-center text-[0.8125rem] font-semibold tabular-nums text-muted-dim">
                    {entry.rank}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[0.875rem] font-medium">{entry.displayName}</p>
                    <WinRateBar wins={entry.wins} losses={entry.losses} className="mt-1.5" />
                  </div>
                  <span className="shrink-0 text-right">
                    <span className="text-[0.9375rem] font-bold tabular-nums">
                      {Math.round(entry.displayRating)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {recent.matches.length > 0 ? (
        <section className="mt-6">
          <SectionTitle>Recent matches</SectionTitle>
          <Card noPadding>
            <ul className="divide-y divide-border">
              {recent.matches.map((match) => {
                const winners = match.participants.filter((p) => p.finalRank === 1);
                return (
                  <li key={match.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[0.8125rem] font-medium">
                        {winners.map((w) => w.displayName).join(" & ")} won
                      </p>
                      <p className="mt-0.5 truncate text-[0.6875rem] text-muted-dim">
                        {match.game.name}
                        {match.matchType === "casual" ? " · casual" : ""}
                      </p>
                    </div>
                    <time dateTime={match.playedAt.toISOString()} className="shrink-0 text-[0.6875rem] tabular-nums text-muted-dim">
                      {match.playedAt.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </time>
                    {can(role, "void_matches") ? <VoidButton matchId={match.id} /> : null}
                  </li>
                );
              })}
            </ul>
          </Card>
        </section>
      ) : null}
    </main>
  );
}