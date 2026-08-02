"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button, Card, ErrorBanner, Field, PageTitle } from "@/components/ui";
import { ApiRequestError, api } from "@/lib/api-client";

export default function ResetPage() {
  return (
    <Suspense fallback={<div className="pt-20 text-center text-muted">Loading...</div>}>
      <ResetForm />
    </Suspense>
  );
}

function ResetForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      await api.patch("/api/auth/reset-password", { token, password });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.detail.message : "Couldn't reset your password.");
    } finally {
      setPending(false);
    }
  }

  if (!token) {
    return (
      <main className="pt-20 text-center">
        <PageTitle sub="Use the link from your email to reset your password.">Invalid link</PageTitle>
      </main>
    );
  }

  if (done) {
    return (
      <main className="pt-20 text-center">
        <PageTitle sub="Sign in with your new password.">Password reset</PageTitle>
        <Button onClick={() => router.push("/")} className="mt-4">Sign in</Button>
      </main>
    );
  }

  return (
    <main className="pt-20">
      <PageTitle sub="Choose a new password.">Reset password</PageTitle>
      <Card>
        <form onSubmit={submit} className="space-y-3">
          <Field
            label="New password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            required
          />
          <ErrorBanner>{error}</ErrorBanner>
          <Button type="submit" disabled={pending}>
            {pending ? "Resetting…" : "Set new password"}
          </Button>
        </form>
      </Card>
    </main>
  );
}