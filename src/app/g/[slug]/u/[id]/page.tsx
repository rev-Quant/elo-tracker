import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Chip, Delta, EmptyState, HeroRating, SectionTitle, WinRateBar, Card } from "@/components/ui";
import { ClaimAccountBanner } from "@/components/claim-banner";
import { BadgeToast } from "@/components/badge-toast";
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
  const isGuest = data.user.isGuest;

  return (
    <main>
      <BadgeToast badges={data.badges} />
      <Link href={`/g/${slug}`} className="mb-4 inline-flex items-center gap-1 text-[0.8125rem] font-medium text-muted hover:text-text">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M7.5 2.5 4 6l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {group.name}
      </Link>

      <div className="mb-6 flex items-center gap-4">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-border bg-surface-2 text-lg font-bold text-muted-dim select-none">
          {data.user.displayName.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-[1.5rem] font-bold leading-tight tracking-[-0.02em]">
            {data.user.displayName}
          </h1>
          {isGuest ? (
            <>
              <span className="mt-0.5 inline-block rounded-full border border-border px-2.5 py-0.5 text-[0.6875rem] font-medium text-muted">
                Guest
              </span>
              <div className="mt-3">
                <ClaimAccountBanner userId={id} />
              </div>
            </>
          ) : null}
        </div>
      </div>

      {best ? (
        <Card glow className="mb-6 text-center">
          <span className="text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-muted-dim">
            {best.gameName}
          </span>
          <p className="mt-1">
            <HeroRating value={best.displayRating} />
          </p>
          <p className="mt-1 text-[0.75rem] font-medium text-muted-dim">
            #{best.rank} of {best.outOf}
          </p>
        </Card>
      ) : (
        <EmptyState
          icon="📊"
          title="No games yet"
          body="Ratings appear here after the first logged match."
        />
      )}

      {data.badges.length > 0 ? (
        <section className="mb-6">
          <SectionTitle>Achievements</SectionTitle>
          <Card>
            <div className="flex flex-wrap gap-3">
              {data.badges.map((b) => (
                <div
                  key={b.id}
                  className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 py-2"
                  title={b.label}
                >
                  <span className="text-base">{b.emoji}</span>
                  <span className="text-[0.75rem] font-medium text-dim">{b.label}</span>
                </div>
              ))}
            </div>
          </Card>
        </section>
      ) : null}

      {data.games.length > 0 ? (
        <section className="mb-6">
          <SectionTitle>Game breakdown</SectionTitle>
          <Card noPadding>
            <ul className="divide-y divide-border">
              {data.games.map((g) => (
                <li key={g.gameId} className="px-4 py-3.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[0.875rem] font-semibold">{g.gameName}</span>
                    <span className="shrink-0 text-[0.9375rem] font-bold tabular-nums">
                      {Math.round(g.displayRating)}
                    </span>
                  </div>
                  <WinRateBar wins={g.wins} losses={g.losses} className="mt-2" />
                  <div className="mt-1.5 flex items-center gap-3 text-[0.6875rem] text-muted-dim">
                    <span className="tabular-nums">{g.wins}W · {g.losses}L</span>
                    <span className="tabular-nums">#{g.rank} of {g.outOf}</span>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      ) : null}

      {data.nemesis || data.prey ? (
        <section className="mb-6">
          <SectionTitle>Head to head</SectionTitle>
          <Card>
            {data.nemesis ? (
              <div className="flex items-center gap-3">
                <span className="text-lg">😈</span>
                <div className="flex-1">
                  <p className="text-[0.8125rem] font-medium">Nemesis: {data.nemesis.opponentName}</p>
                  <p className="text-[0.6875rem] text-muted-dim tabular-nums">
                    {data.nemesis.wins}W · {data.nemesis.losses}L
                  </p>
                </div>
              </div>
            ) : null}
            {data.prey ? (
              <div className={`flex items-center gap-3 ${data.nemesis ? "mt-3 border-t border-border pt-3" : ""}`}>
                <span className="text-lg">🐣</span>
                <div className="flex-1">
                  <p className="text-[0.8125rem] font-medium">Prey: {data.prey.opponentName}</p>
                  <p className="text-[0.6875rem] text-muted-dim tabular-nums">
                    {data.prey.wins}W · {data.prey.losses}L
                  </p>
                </div>
              </div>
            ) : null}
          </Card>
        </section>
      ) : null}

      {data.recentMatches.length > 0 ? (
        <section>
          <SectionTitle>Recent matches</SectionTitle>
          <Card noPadding>
            <ul className="divide-y divide-border">
              {data.recentMatches.map((m) => (
                <li key={m.matchId} className="flex items-center gap-3 px-4 py-3">
                  <time dateTime={m.playedAt.toISOString()} className="w-14 shrink-0 text-[0.6875rem] tabular-nums text-muted-dim">
                    {m.playedAt.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </time>
                  <span className="min-w-0 flex-1 truncate text-[0.8125rem]">{m.gameName}</span>
                  <Chip active={m.won} className="!py-1 !text-[0.6875rem] font-semibold">
                    {m.won ? "W" : "L"}
                  </Chip>
                  <Delta value={m.ratingDelta} className="text-[0.75rem]" />
                </li>
              ))}
            </ul>
          </Card>
        </section>
      ) : null}

      <div className="mt-6 text-center">
        <a
          href="/api/me/export"
          className="text-[0.8125rem] font-medium text-muted underline-offset-2 hover:text-text hover:underline"
          download
        >
          Export my data
        </a>
      </div>
    </main>
  );
}