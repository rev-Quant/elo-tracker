"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, ErrorBanner, Field } from "@/components/ui";
import { ApiRequestError, api } from "@/lib/api-client";

type Mode = "login" | "register";

export function AuthForm({ redirectTo = "/groups" }: { redirectTo?: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string[]>>({});

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setFields({});

    const form = new FormData(event.currentTarget);
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

  return (
    <form onSubmit={submit} className="space-y-3">
      {mode === "register" ? (
        <Field
          label="Your name"
          name="displayName"
          autoComplete="name"
          required
          error={fields.displayName?.[0]}
        />
      ) : null}

      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        error={fields.email?.[0]}
      />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete={mode === "register" ? "new-password" : "current-password"}
        required
        error={fields.password?.[0]}
      />

      <ErrorBanner>{error}</ErrorBanner>

      <Button type="submit" disabled={pending}>
        {pending ? "Just a moment…" : mode === "register" ? "Create account" : "Sign in"}
      </Button>

      <Button
        type="button"
        variant="ghost"
        onClick={() => {
          setMode(mode === "login" ? "register" : "login");
          setError(null);
          setFields({});
        }}
      >
        {mode === "login" ? "New here? Create an account" : "Already have an account? Sign in"}
      </Button>
    </form>
  );
}
