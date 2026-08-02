import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PageTitle, Card, SectionTitle, EmptyState } from "@/components/ui";
import { getSession } from "@/lib/auth/session";
import { NotFoundError } from "@/lib/errors";
import { requireMembership } from "@/server/groups/service";
import { listSeasons } from "@/server/seasons/service";

export const dynamic = "force-dynamic";

interface Props { params: Promise<{ slug: string }> }

export default async function SeasonsPage({ params }: Props) {
  const { slug } = await params;
  const session = await getSession();
  if (!session) redirect("/");
  let m;
  try { m = await requireMembership(slug, session.userId); }
  catch (err) { if (err instanceof NotFoundError) notFound(); throw err; }

  const seasonList = await listSeasons(slug, session.userId);

  return (
    <main>
      <Link href={`/g/${slug}`} className="mb-4 inline-flex items-center gap-1 text-[0.8125rem] font-medium text-muted hover:text-text">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M7.5 2.5 4 6l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        {m.group.name}
      </Link>
      <PageTitle sub="Seasons for periodic ranking resets">Seasons</PageTitle>

      {seasonList.length === 0 ? (
        <EmptyState icon="📅" title="No seasons yet" body="Create a season to scope leaderboards to a specific time period." />
      ) : (
        <div className="space-y-2">
          {seasonList.map((s) => (
            <Card key={s.id}>
              <p className="font-semibold">{s.name}</p>
              <p className="mt-1 text-[0.75rem] text-muted-dim">
                {s.startsAt.toLocaleDateString()} — {s.endsAt?.toLocaleDateString() ?? "Present"}
              </p>
              <p className="text-[0.6875rem] text-muted">{s.isActive ? "Active" : "Ended"}</p>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}