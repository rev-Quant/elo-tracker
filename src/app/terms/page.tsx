import Link from "next/link";
import { PageTitle, Card } from "@/components/ui";

export const metadata = { title: "Terms of Service — Board Game ELO Tracker" };

export default function TermsPage() {
  return (
    <main>
      <Link href="/" className="mb-4 inline-block text-sm font-medium text-muted hover:text-text">← Home</Link>
      <PageTitle>Terms of Service</PageTitle>

      <div className="space-y-4 text-[0.8125rem] leading-relaxed text-muted">
        <Card>
          <p className="font-semibold text-text">1. Acceptance</p>
          <p className="mt-1">By using this service you agree to these terms. If you don&apos;t agree, don&apos;t use it.</p>
        </Card>
        <Card>
          <p className="font-semibold text-text">2. Accounts</p>
          <p className="mt-1">You&apos;re responsible for keeping your password secure. You can delete your account and export your data at any time from your profile page.</p>
        </Card>
        <Card>
          <p className="font-semibold text-text">3. Content</p>
          <p className="mt-1">Match results you log are visible to members of the group they were logged in. Group admins can remove members and void matches. Don&apos;t post anything illegal.</p>
        </Card>
        <Card>
          <p className="font-semibold text-text">4. Service</p>
          <p className="mt-1">This service is provided as-is. We may change or discontinue it at any time. We&apos;re not liable for any damages from using it.</p>
        </Card>
        <Card>
          <p className="font-semibold text-text">5. Contact</p>
          <p className="mt-1">Questions? Open an issue on the project&apos;s GitHub repository.</p>
        </Card>
      </div>
    </main>
  );
}