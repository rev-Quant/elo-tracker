import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Card, Delta, EmptyState, PageTitle } from "@/components/ui";
import { getSession } from "@/lib/auth/session";
import { NotFoundError } from "@/lib/errors";
import { requireMembership } from "@/server/groups/service";
import { profile } from "@/server/users/queries";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ slug: string; id: string }>;
}

export default async function ProfilePage({ params }: Props) {
  const { slug, id } = await params;
  const session = await getSession();
  if (!session) redirect("/");

  let membership;
  try {
    membership = await requireMembership(slug, session.userId);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }
  const { group } = membership;

  let data;
  try {
    data = await profile(id, group.id);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }

  const best = data.games[0] ?? null;

  return (
    <main>
      <Link href={`/g/${slug}`} className="mb-3 inline-block text-sm text-muted hover:text-text">
        ← {group.name}
      </Link>

      <PageTitle sub={data.user.isGuest ? "Guest profile" : undefined}>
        {data.user.displayName}
      </PageTitle>

      {/* Hero number: the thing people open the app to see (spec §7). */}
      {best ? (
        <Card className="mb-5 text-center">
          <p className="text-5xl font-bold tracking-tight tnum">
            {Math.round(best.displayRating)}
          </p>
          <p className="mt-1 text-sm text-muted">
            #{best.rank} of {best.outOf} · {best.gameName}
          </p>
        </Card>
      ) : (
        <EmptyState
          title="No games yet"
          body="Ratings appear here after the first logged match."
        />
      )}

      {data.games.length > 0 ? (
        <section className="mb-6">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            Game breakdown
          </h2>
          <Card className="p-0">
            <ul>
              {data.games.map((g) => {
                const total = g.wins + g.losses;
                const winRate = total === 0 ? 0 : Math.round((g.wins / total) * 100);
                return (
                  <li key={g.gameId} className="border-b border-border px-4 py-3 last:border-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate font-medium">{g.gameName}</span>
                      <span className="font-semibold tnum">{Math.round(g.displayRating)}</span>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                        <div className="h-full bg-accent" style={{ width: `${winRate}%` }} />
                      </div>
                      <span className="shrink-0 text-xs text-muted tnum">
                        {g.wins}-{g.losses}
                      </span>
                      <span className="shrink-0 text-xs text-muted tnum">
                        #{g.rank}/{g.outOf}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        </section>
      ) : null}

      {data.nemesis || data.prey ? (
        <section className="mb-6">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            Head to head
          </h2>
          <Card className="space-y-2 text-sm">
            {data.nemesis ? (
              <p>
                <span className="text-muted">Nemesis:</span> {data.nemesis.opponentName}{" "}
                <span className="tnum">
                  ({data.nemesis.wins}-{data.nemesis.losses})
                </span>
              </p>
            ) : null}
            {data.prey ? (
              <p>
                <span className="text-muted">Prey:</span> {data.prey.opponentName}{" "}
                <span className="tnum">
                  ({data.prey.wins}-{data.prey.losses})
                </span>
              </p>
            ) : null}
          </Card>
        </section>
      ) : null}

      {data.recentMatches.length > 0 ? (
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            Recent matches
          </h2>
          <Card className="p-0">
            <ul>
              {data.recentMatches.map((m) => (
                <li
                  key={m.matchId}
                  className="flex items-center gap-3 border-b border-border px-4 py-2.5 text-sm last:border-0"
                >
                  <time className="w-14 shrink-0 text-xs text-muted" dateTime={m.playedAt.toISOString()}>
                    {m.playedAt.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </time>
                  <span className="min-w-0 flex-1 truncate">{m.gameName}</span>
                  <span className={m.won ? "text-up" : "text-muted"}>{m.won ? "W" : "L"}</span>
                  <span className="w-10 text-right">
                    <Delta value={m.ratingDelta} />
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      ) : null}
    </main>
  );
}
