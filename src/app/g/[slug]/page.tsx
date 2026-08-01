import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Card, EmptyState, LinkButton } from "@/components/ui";
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
    history(group.id, { limit: 5 }),
    daysSinceLastMatch(group.id),
  ]);

  // Spec §5: a stale leaderboard kills retention, so nudge instead of going quiet.
  const stale = idleDays !== null && idleDays >= 14;

  return (
    <main>
      <header className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{group.name}</h1>
          <p className="mt-1 text-sm text-muted">
            Invite code <span className="font-mono text-text">{group.inviteCode}</span>
          </p>
        </div>
        <Link href={`/g/${slug}/settings`} className="shrink-0 text-sm text-muted hover:text-text">
          Settings
        </Link>
      </header>

      {can(role, "log_match") ? (
        <LinkButton href={`/g/${slug}/log`} className="mb-5">
          Log a game
        </LinkButton>
      ) : (
        <Card className="mb-5 text-center text-sm text-muted">
          You&apos;re a spectator in this group — you can follow along but not log games.
        </Card>
      )}

      {played.length > 1 ? (
        <nav className="mb-3 flex gap-2 overflow-x-auto pb-1">
          {played.map((g) => (
            <Link
              key={g.id}
              href={`/g/${slug}?game=${g.slug}`}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-sm transition ${
                g.id === selected?.id
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-border text-muted hover:text-text"
              }`}
            >
              {g.name}
            </Link>
          ))}
        </nav>
      ) : null}

      {standings.length === 0 ? (
        <EmptyState
          title="No games logged yet"
          body="Log your first match and the standings will appear here. Everyone starts on equal footing."
        />
      ) : (
        <Card className="p-0">
          <h2 className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted">
            {selected?.name} standings
          </h2>
          <ul>
            {standings.map((entry) => (
              <li key={entry.userId} className="border-b border-border last:border-0">
                <Link
                  href={`/g/${slug}/u/${entry.userId}`}
                  className="flex items-center gap-3 px-4 py-3 transition hover:bg-surface-2"
                >
                  <span className="w-5 shrink-0 text-sm text-muted tnum">{entry.rank}</span>
                  <span className="min-w-0 flex-1 truncate font-medium">{entry.displayName}</span>
                  <span className="shrink-0 text-xs text-muted tnum">
                    {entry.wins}-{entry.losses}
                  </span>
                  <span className="w-14 shrink-0 text-right font-semibold tnum">
                    {Math.round(entry.displayRating)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {stale ? (
        <p className="mt-3 text-center text-sm text-muted">
          No games in a couple of weeks. Time for a game night?
        </p>
      ) : null}

      {recent.matches.length > 0 ? (
        <section className="mt-6">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            Recent matches
          </h2>
          <Card className="p-0">
            <ul>
              {recent.matches.map((match) => {
                const winners = match.participants.filter((p) => p.finalRank === 1);
                return (
                  <li
                    key={match.id}
                    className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-0"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {winners.map((w) => w.displayName).join(" & ")} won
                      </p>
                      <p className="truncate text-xs text-muted">
                        {match.game.name} · {match.participants.length} players
                        {match.matchType === "casual" ? " · casual" : ""}
                      </p>
                    </div>
                    <time className="shrink-0 text-xs text-muted" dateTime={match.playedAt.toISOString()}>
                      {match.playedAt.toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                    </time>
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
