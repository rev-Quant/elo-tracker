import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { db } from "@/db";
import { groups } from "@/db/schema";
import { AuthForm } from "@/components/auth-form";
import { Card } from "@/components/ui";
import { getSession } from "@/lib/auth/session";
import { isValidInviteCode, normalizeInviteCode } from "@/lib/ids";
import { joinByInviteCode } from "@/server/groups/service";
import { JoinNowButton } from "./join-now";

export const dynamic = "force-dynamic";

export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code: raw } = await params;
  const code = normalizeInviteCode(raw);
  if (!isValidInviteCode(code)) notFound();

  const [group] = await db.select().from(groups).where(eq(groups.inviteCode, code)).limit(1);
  if (!group) notFound();

  const session = await getSession();
  if (session) {
    const { group: joined } = await joinByInviteCode({ inviteCode: code }, session.userId);
    redirect(`/g/${joined.slug}`);
  }

  return (
    <main>
      <div className="mb-8 mt-10 text-center">
        <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.15em] text-muted-dim">You&apos;ve been invited to</p>
        <h1 className="mt-2 text-[2rem] font-extrabold leading-tight tracking-[-0.025em]">{group.name}</h1>
        <p className="mx-auto mt-2 max-w-xs text-[0.8125rem] leading-relaxed text-muted">
          Track board game ratings together
        </p>
      </div>

      <Card glow>
        <AuthForm redirectTo={`/join/${code}`} />
      </Card>

      <div className="mt-4">
        <JoinNowButton code={code} />
      </div>
    </main>
  );
}