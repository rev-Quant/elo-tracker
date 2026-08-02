"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";

/** Registers the service worker and subscribes to push. */
export function PushSubscribe() {
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    setSupported(true);

    navigator.serviceWorker.register("/sw.js").then(async (reg) => {
      const existing = await reg.pushManager.getSubscription();
      if (existing) setSubscribed(true);
    });
  }, []);

  async function subscribe() {
    try {
      const reg = await navigator.serviceWorker.ready;
      const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "BOEJpx6BTxtFc2-0Zj8EiQIPSToJcvdq3yjP7Zoi4SIhUgwJdlHBLOjrNB4bI_2iavYHq9SmC34VJEwIGLjtY8E";
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      });
      await api.post("/api/push/subscribe", { subscription: sub.toJSON() });
      setSubscribed(true);
    } catch {
      // User denied or browser doesn't support
    }
  }

  if (!supported) return null;
  if (subscribed) return null;

  return (
    <button
      type="button"
      onClick={subscribe}
      className="rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-[0.6875rem] font-medium text-accent hover:bg-accent/20"
    >
      🔔 Enable notifications
    </button>
  );
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}