import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Card, Delta, PageTitle } from "@/components/ui";
import { getSession } from "@/lib/auth/session";
import { NotFoundError } from "@/lib/errors";
import { roundup } from "@/server/groups/roundup";
import { requireMembership } from "@/server/groups/service";

export const dynamic = "force-dynamic";

export default async function RoundupPage({ params }: { params: Promise<{ slug: string }> }) {
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
  const { group } = membership;
  const report = await roundup(group.id);

  return (
    <main>
      <Link href={`/g/${slug}`} className="mb-3 inline-block text-sm text-muted hover:text-text">
        ← {group.name}
      </Link>
      <PageTitle sub={`Last 7 days · ${report.totalMatches} matches played`}>Weekly roundup</PageTitle>

      {report.totalMatches === 0 ? (
        <Card className="text-center text-sm text-muted">
          No games this week. Be the spark — log one.
        </Card>
      ) : (
        <div className="space-y-3">
          {report.mostWins ? (
            <Card>
              🏆 <strong>Most wins:</strong> {report.mostWins.displayName} ({report.mostWins.wins}-
              {report.mostWins.losses})
            </Card>
          ) : null}
          {report.biggestGain ? (
            <Card>
              📈 <strong>Biggest gain:</strong> {report.biggestGain.displayName}{" "}
              <Delta value={report.biggestGain.delta} /> (now {Math.round(report.biggestGain.newRating)})
            </Card>
          ) : null}
          {report.biggestUpset ? (
            <Card>
              😱 <strong>Biggest upset:</strong> {report.biggestUpset.winnerName} beat{" "}
              {report.biggestUpset.loserName} despite a {report.biggestUpset.gap}-point gap
            </Card>
          ) : null}
        </div>
      )}

      {report.quiet.length > 0 ? (
        <Card className="mt-3 text-sm text-muted">
          💤 <strong>Quiet this week:</strong> {report.quiet.map((q) => q.displayName).join(", ")}
        </Card>
      ) : null}
    </main>
  );
}
