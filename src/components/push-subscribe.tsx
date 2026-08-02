"use client";

import { useState } from "react";
import { api } from "@/lib/api-client";
import { Card, Button } from "@/components/ui";

const DISMISSED_KEY = "elo-push-banner-dismissed";

function wasDismissed() {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(DISMISSED_KEY) === "1";
}

export function NotificationBanner({ showAlways = false }: { showAlways?: boolean }) {
  const [status, setStatus] = useState<"prompt" | "loading" | "error" | "done" | "hidden">(
    showAlways || !wasDismissed() ? "prompt" : "hidden",
  );
  const [error, setError] = useState("");

  if (status === "hidden" || status === "done") return null;

  async function subscribe() {
    setStatus("loading");
    setError("");
    try {
      let reg = await navigator.serviceWorker.getRegistration();
      if (!reg) reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlB64("BOEJpx6BTxtFc2-0Zj8EiQIPSToJcvdq3yjP7Zoi4SIhUgwJdlHBLOjrNB4bI_2iavYHq9SmC34VJEwIGLjtY8E"),
      });
      await api.post("/api/push/subscribe", { subscription: sub.toJSON() });
      setStatus("done");
    } catch (e: any) {
      setError(e?.message || "Push not available");
      setStatus("error");
    }
  }

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, "1");
    setStatus("hidden");
  }

  return (
    <Card glow className="mb-4">
      {error ? (
        <p className="text-center text-down text-[0.8125rem]">{error}</p>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <p className="text-[0.8125rem] font-semibold">🔔 Get match alerts</p>
          <div className="flex gap-2 shrink-0">
            <Button size="sm" onClick={subscribe} disabled={status === "loading"}>
              {status === "loading" ? "..." : "Enable"}
            </Button>
            <button onClick={dismiss} className="text-[0.6875rem] text-muted-dim">No thanks</button>
          </div>
        </div>
      )}
    </Card>
  );
}

function urlB64(s: string) {
  const p = "=".repeat((4 - (s.length % 4)) % 4);
  const b = atob((s + p).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...b].map((c) => c.charCodeAt(0)));
}