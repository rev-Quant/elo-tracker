import webpush from "web-push";

let initialized = false;

function ensureVapid() {
  if (initialized) return;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:noreply@elo-tracker.com", pub, priv);
  initialized = true;
}

const subscriptions = new Map<string, webpush.PushSubscription>();

/** Store a push subscription for a user. Called from subscribe API. */
export function saveSubscription(userId: string, sub: webpush.PushSubscription) {
  subscriptions.set(userId, sub);
}

/** Send a push notification to a user. Fails silently if unsupported. */
export async function sendPush(
  userId: string,
  payload: { title: string; body: string; url?: string; tag?: string },
) {
  ensureVapid();
  if (!initialized) return;
  const sub = subscriptions.get(userId);
  if (!sub) return;
  try {
    await webpush.sendNotification(sub, JSON.stringify(payload));
  } catch {
    // Expired or invalid — remove it
    subscriptions.delete(userId);
  }
}

export const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";