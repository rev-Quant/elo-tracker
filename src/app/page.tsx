import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { Card } from "@/components/ui";
import { getSession } from "@/lib/auth/session";

export default async function HomePage() {
  if (await getSession()) redirect("/groups");

  return (
    <main>
      <div className="mb-10 mt-8 text-center animate-fade-up">
        <div className="mx-auto mb-5 flex size-16 items-center justify-center rounded-2xl border border-accent/20 bg-accent/5">
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
            <rect x="5" y="4" width="22" height="24" rx="2" stroke="var(--accent)" strokeWidth="2" />
            <circle cx="16" cy="13" r="4" stroke="var(--accent)" strokeWidth="2" />
            <path d="M9 24c0-3.866 3.134-7 7-7s7 3.134 7 7" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </div>
        <h1 className="text-[2rem] font-extrabold leading-[1.15] tracking-[-0.025em] sm:text-[2.25rem]">
          Who&rsquo;s actually
          <br />
          <span className="text-accent">winning?</span>
        </h1>
        <p className="mx-auto mt-3 max-w-xs text-[0.8125rem] leading-relaxed text-muted">
          Track ratings across every game your group plays.
          <br />
          Settle it with data.
        </p>
      </div>

      <div className="animate-fade-up stagger-1">
        <Card glow>
          <AuthForm />
        </Card>
      </div>

      <p className="mt-5 text-center text-[0.6875rem] text-muted-dim">
        Guests welcome — try it without an account.
      </p>
    </main>
  );
}