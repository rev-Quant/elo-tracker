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

/**
 * Invite link landing. Spec §6 "group-first onboarding".
 *
 * A signed-out visitor sees what they are joining BEFORE being asked to make
 * an account, which is the whole point of the group-first flow.
 */
export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code: raw } = await params;
  const code = normalizeInviteCode(raw);
  if (!isValidInviteCode(code)) notFound();

  const [group] = await db.select().from(groups).where(eq(groups.inviteCode, code)).limit(1);
  if (!group) notFound();

  const session = await getSession();

  // Already signed in: join immediately and get out of the way.
  if (session) {
    const { group: joined } = await joinByInviteCode({ inviteCode: code }, session.userId);
    redirect(`/g/${joined.slug}`);
  }

  return (
    <main>
      <div className="mb-6 mt-8 text-center">
        <p className="text-sm text-muted">You&apos;ve been invited to</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">{group.name}</h1>
      </div>

      <Card className="mb-4">
        <AuthForm redirectTo={`/join/${code}`} />
      </Card>

      <JoinNowButton code={code} />
    </main>
  );
}
