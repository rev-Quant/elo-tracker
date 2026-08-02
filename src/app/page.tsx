import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { Card, LinkButton } from "@/components/ui";
import { getSession } from "@/lib/auth/session";

export default async function HomePage() {
  if (await getSession()) redirect("/groups");

  return (
    <main>
      {/* Hero */}
      <div className="mb-10 mt-10 text-center animate-fade-up">
        <div className="mx-auto mb-5 flex size-16 items-center justify-center rounded-2xl border border-accent/20 bg-accent/5">
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
            <rect x="5" y="4" width="22" height="24" rx="2" stroke="var(--accent)" strokeWidth="2" />
            <circle cx="16" cy="13" r="4" stroke="var(--accent)" strokeWidth="2" />
            <path d="M9 24c0-3.866 3.134-7 7-7s7 3.134 7 7" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </div>
        <h1 className="text-[2rem] font-extrabold leading-[1.15] tracking-[-0.03em] sm:text-[2.5rem]">
          Who&rsquo;s actually<br />
          <span className="text-accent">winning?</span>
        </h1>
        <p className="mx-auto mt-3 max-w-sm text-[0.875rem] leading-relaxed text-muted">
          The rating tracker your board game group deserves. Competitive or casual, FFA or teams — log a match in 10 seconds and settle every argument with data.
        </p>
        <div className="mt-5 flex justify-center gap-3">
          <LinkButton href="/groups">Sign up free</LinkButton>
          <LinkButton href="/discover" variant="secondary">Browse groups</LinkButton>
        </div>
      </div>

      {/* Auth form — immediately visible */}
      <div className="mb-10 animate-fade-up stagger-1">
        <Card glow>
          <AuthForm />
        </Card>
      </div>

      {/* Features */}
      <div className="mb-10 grid gap-3 animate-fade-up stagger-2">
        {[
          { emoji: "⚡", title: "10-second logging", body: "Same game, same people, competitive. Literally zero-tap confirmation." },
          { emoji: "📊", title: "OpenSkill ratings", body: "Proven rating math (Plackett-Luce model). Per-game, per-group, always fair." },
          { emoji: "👥", title: "Teams", body: "2v2, 2v2v2 — drag players into buckets, hit Random Teams, done." },
          { emoji: "🔥", title: "Badges & streaks", body: "First Win, Giant Slayer, Streak: 10. Earn them silently, flex on your profile." },
          { emoji: "📋", title: "Weekly roundup", body: "Auto-generated report every Sunday. Who won the most, who gained the most, who got quiet." },
          { emoji: "🔒", title: "Private by default", body: "Ratings visible only inside your group. No global leaderboard without opt-in." },
        ].map((f, i) => (
          <Card key={i}>
            <div className="flex items-start gap-3">
              <span className="text-xl">{f.emoji}</span>
              <div>
                <p className="text-[0.875rem] font-semibold">{f.title}</p>
                <p className="mt-0.5 text-[0.75rem] leading-relaxed text-muted">{f.body}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Footer */}
      <footer className="mt-10 text-center text-[0.6875rem] text-muted-dim space-x-4">
        <Link href="/discover" className="hover:text-text">Browse groups</Link>
        <Link href="/terms" className="hover:text-text">Terms</Link>
        <Link href="/privacy" className="hover:text-text">Privacy</Link>
      </footer>
    </main>
  );
}