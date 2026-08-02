import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Card, Delta, PageTitle, EmptyState } from "@/components/ui";
import { getSession } from "@/lib/auth/session";
import { NotFoundError } from "@/lib/errors";
import { roundup } from "@/server/groups/roundup";
import { requireMembership } from "@/server/groups/service";

export const dynamic = "force-dynamic";

export default async function RoundupPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await getSession();
  if (!session) redirect("/");
  let m;
  try { m = await requireMembership(slug, session.userId); }
  catch (err) { if (err instanceof NotFoundError) notFound(); throw err; }
  const report = await roundup(m.group.id);

  return (
    <main>
      <Link href={`/g/${slug}`} className="mb-4 inline-flex items-center gap-1 text-[0.8125rem] font-medium text-muted hover:text-text">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M7.5 2.5 4 6l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        {m.group.name}
      </Link>
      <PageTitle sub={`Last 7 days · ${report.totalMatches} matches`}>Weekly report</PageTitle>
      {report.relegated ? (
        <Card className="mb-4 border-down/20 bg-down/5">
          <p className="text-[0.8125rem] font-medium text-down">
            🪂 Relegated: {report.relegated.displayName}
          </p>
          <p className="mt-0.5 text-[0.6875rem] text-muted-dim">
            Bottom of the leaderboard. Time to climb out.
          </p>
        </Card>
      ) : null}

      {report.totalMatches === 0 ? (
        <EmptyState icon="📋" title="No games this week" body="Log a match to see it show up here." />
      ) : (
        <div className="space-y-3">
          {report.mostWins ? (
            <Card>
              <span className="text-lg">🏆</span>{" "}
              <span className="font-semibold">{report.mostWins.displayName}</span> led with{" "}
              <span className="tabular-nums font-semibold">{report.mostWins.wins}W · {report.mostWins.losses}L</span>
            </Card>
          ) : null}
          {report.biggestGain ? (
            <Card>
              <span className="text-lg">📈</span>{" "}
              <span className="font-semibold">{report.biggestGain.displayName}</span> gained{" "}
              <Delta value={report.biggestGain.delta} />{" "}
              <span className="tabular-nums">now {Math.round(report.biggestGain.newRating)}</span>
            </Card>
          ) : null}
          {report.biggestUpset ? (
            <Card>
              <span className="text-lg">😱</span>{" "}
              <span className="font-semibold">{report.biggestUpset.winnerName}</span> beat{" "}
              <span className="font-semibold">{report.biggestUpset.loserName}</span> despite a{" "}
              <span className="tabular-nums font-semibold">{report.biggestUpset.gap}</span>-point gap
            </Card>
          ) : null}
        </div>
      )}
      {report.quiet.length > 0 ? (
        <Card className="mt-4 text-[0.8125rem] text-muted">
          💤 <span className="font-medium text-text-dim">Quiet this week:</span>{" "}
          {report.quiet.map((q) => q.displayName).join(", ")}
        </Card>
      ) : null}
    </main>
  );
}