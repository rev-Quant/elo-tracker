import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PageTitle, Card, SectionTitle, EmptyState, Button } from "@/components/ui";
import { getSession } from "@/lib/auth/session";
import { NotFoundError } from "@/lib/errors";
import { requireMembership } from "@/server/groups/service";
import { listTeams } from "@/server/teams/service";

export const dynamic = "force-dynamic";

interface Props { params: Promise<{ slug: string }> }

export default async function TeamsPage({ params }: Props) {
  const { slug } = await params;
  const session = await getSession();
  if (!session) redirect("/");
  let m;
  try { m = await requireMembership(slug, session.userId); }
  catch (err) { if (err instanceof NotFoundError) notFound(); throw err; }

  const teams = await listTeams(slug, session.userId);

  return (
    <main>
      <Link href={`/g/${slug}`} className="mb-4 inline-flex items-center gap-1 text-[0.8125rem] font-medium text-muted hover:text-text">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M7.5 2.5 4 6l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        {m.group.name}
      </Link>
      <PageTitle sub="Persistent teams for this group">Teams</PageTitle>

      {teams.length === 0 ? (
        <EmptyState icon="👥" title="No teams yet" body="Create a persistent team to see average ratings across matches." />
      ) : (
        <div className="space-y-2">
          {teams.map((team) => (
            <Card key={team.id}>
              <p className="font-semibold">{team.name}</p>
              <p className="mt-1 text-[0.75rem] text-muted-dim">
                {team.members.map((m) => m.displayName).join(", ") || "No members"}
              </p>
              <p className="text-[0.6875rem] text-muted-dim">Games: {team.gamesPlayed}</p>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}