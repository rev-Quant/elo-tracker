"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, ErrorBanner, Field, SuccessBanner } from "@/components/ui";
import { ApiRequestError, api } from "@/lib/api-client";

type Mode = "login" | "register" | "forgot";

export function AuthForm({ redirectTo = "/groups" }: { redirectTo?: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string[]>>({});
  const [resetSent, setResetSent] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setFields({});

    const form = new FormData(event.currentTarget);
    
    if (mode === "forgot") {
      try {
        await api.post("/api/auth/reset-password", { email: String(form.get("email") ?? "") });
        setResetSent(true);
      } catch (err) {
        setError(err instanceof ApiRequestError ? err.detail.message : "Couldn't send reset email.");
      } finally {
        setPending(false);
      }
      return;
    }

    const body = {
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
      ...(mode === "register" ? { displayName: String(form.get("displayName") ?? "") } : {}),
    };

    try {
      await api.post(`/api/auth/${mode}`, body);
      router.push(redirectTo);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setError(err.detail.message);
        setFields(err.detail.fields ?? {});
      } else {
        setError("Couldn't reach the server. Check your connection.");
      }
    } finally {
      setPending(false);
    }
  }

  if (mode === "forgot") {
    return (
      <form onSubmit={submit} className="space-y-3.5">
        {resetSent ? (
          <>
            <SuccessBanner>If that email exists, a reset link has been sent. Check your inbox.</SuccessBanner>
            <Button type="button" variant="ghost" size="sm" onClick={() => { setMode("login"); setResetSent(false); }}>
              Back to sign in
            </Button>
          </>
        ) : (
          <>
            <p className="text-[0.8125rem] text-muted">Enter your email and we&apos;ll send you a reset link.</p>
            <Field label="Email" name="email" type="email" autoComplete="email" placeholder="jane@example.com" required />
            <ErrorBanner>{error}</ErrorBanner>
            <Button type="submit" disabled={pending}>
              {pending ? "Sending…" : "Send reset link"}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setMode("login")}>
              Back to sign in
            </Button>
          </>
        )}
      </form>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3.5">
      {mode === "register" ? (
        <div className="animate-fade-in">
          <Field label="Your name" name="displayName" autoComplete="name" placeholder="Jane" required error={fields.displayName?.[0]} />
        </div>
      ) : null}

      <Field label="Email" name="email" type="email" autoComplete="email" placeholder="jane@example.com" required error={fields.email?.[0]} />
      <Field label="Password" name="password" type="password" autoComplete={mode === "register" ? "new-password" : "current-password"} placeholder="At least 8 characters" required error={fields.password?.[0]} />

      <ErrorBanner>{error}</ErrorBanner>

      <Button type="submit" disabled={pending}>
        {pending ? "Just a moment…" : mode === "register" ? "Create account" : "Sign in"}
      </Button>

      <Button type="button" variant="ghost" size="sm" onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(null); setFields({}); }}>
        {mode === "login" ? "New here? Create an account" : "Already have an account? Sign in"}
      </Button>

      {mode === "login" ? (
        <button type="button" onClick={() => setMode("forgot")} className="block w-full text-center text-[0.75rem] text-muted-dim hover:text-muted">
          Forgot password?
        </button>
      ) : null}
    </form>
  );
}