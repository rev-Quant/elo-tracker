"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { Card, Button } from "@/components/ui";

/** Shows onboarding banner until user subscribes or dismisses. */
export function NotificationBanner() {
  const [show, setShow] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dismissed = sessionStorage.getItem("elo-push-dismissed") === "1";
    if (dismissed) return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

    // Check if already subscribed
    navigator.serviceWorker.register("/sw.js").then(async (reg) => {
      const existing = await reg.pushManager.getSubscription();
      if (!existing) setShow(true);
      else setSubscribed(true);
    }).catch(() => setShow(true)); // Still show so user can try
  }, []);

  async function subscribe() {
    setError(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "BOEJpx6BTxtFc2-0Zj8EiQIPSToJcvdq3yjP7Zoi4SIhUgwJdlHBLOjrNB4bI_2iavYHq9SmC34VJEwIGLjtY8E";
      console.log("Subscribing with VAPID key:", key.slice(0, 20) + "...");
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlB64(key),
      });
      console.log("Got subscription, sending to server...");
      await api.post("/api/push/subscribe", { subscription: sub.toJSON() });
      console.log("Subscription saved on server");
      setSubscribed(true);
      setShow(false);
      localStorage.setItem("elo-push-enabled", "1");
    } catch (e: any) {
      console.error("Push subscribe failed:", e?.name, e?.message, e);
      if (e?.name === "NotAllowedError") {
        setError("Notifications blocked. Enable them in your browser settings, then try again.");
      } else if (e?.name === "AbortError") {
        setError("Service worker not ready. Refresh and try again.");
      } else {
        setError(`Couldn't enable: ${e?.message || "Check browser settings"}`);
      }
    }
  }

  function dismiss() {
    setShow(false);
    sessionStorage.setItem("elo-push-dismissed", "1");
  }

  if (!show && !error) return null;

  return (
    <Card glow className="mb-4 animate-scale-in">
      {error ? (
        <div className="text-center">
          <p className="text-[0.8125rem] font-medium text-down">{error}</p>
          <div className="mt-2 flex justify-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => setShow(false)}>Dismiss</Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[0.8125rem] font-semibold">🔔 Get notified</p>
            <p className="text-[0.6875rem] text-muted-dim">When someone logs a match or overtakes you</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button size="sm" onClick={subscribe}>Enable</Button>
            <button type="button" onClick={dismiss} className="text-[0.6875rem] text-muted-dim hover:text-muted">Maybe later</button>
          </div>
        </div>
      )}
    </Card>
  );
}

function urlB64(s: string) {
  const padding = "=".repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}