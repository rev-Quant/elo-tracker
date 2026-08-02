import Link from "next/link";
import { PageTitle, Card } from "@/components/ui";

export const metadata = { title: "Privacy Policy — Board Game ELO Tracker" };

export default function PrivacyPage() {
  return (
    <main>
      <Link href="/" className="mb-4 inline-block text-sm font-medium text-muted hover:text-text">← Home</Link>
      <PageTitle>Privacy Policy</PageTitle>

      <div className="space-y-4 text-[0.8125rem] leading-relaxed text-muted">
        <Card>
          <p className="font-semibold text-text">1. What we collect</p>
          <p className="mt-1">Your display name, email address (optional), group memberships, match results, and OpenSkill ratings derived from those results. We use Vercel Analytics for anonymous page view counts — no cookies, no tracking IDs.</p>
        </Card>
        <Card>
          <p className="font-semibold text-text">2. How we use it</p>
          <p className="mt-1">To show you and your group members ratings, leaderboards, head-to-head records, badges, and weekly roundups. Your email is never shown to other users. We don&apos;t sell or share your data.</p>
        </Card>
        <Card>
          <p className="font-semibold text-text">3. Your rights</p>
          <p className="mt-1">You can export all your data at any time from your profile page. You can delete your account, which anonymises your display name and removes you from groups while preserving match history for historical accuracy.</p>
        </Card>
        <Card>
          <p className="font-semibold text-text">4. Data storage</p>
          <p className="mt-1">Your data is stored in a PostgreSQL database hosted by Neon (AWS us-east-2). The application is hosted on Vercel. Both providers are SOC 2 compliant.</p>
        </Card>
      </div>
    </main>
  );
}