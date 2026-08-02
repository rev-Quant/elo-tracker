import webpush from "web-push";

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY ?? "";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT ?? "mailto:noreply@elo-tracker.com";

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

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
  const sub = subscriptions.get(userId);
  if (!sub) return;
  try {
    await webpush.sendNotification(sub, JSON.stringify(payload));
  } catch {
    // Expired or invalid — remove it
    subscriptions.delete(userId);
  }
}

export { VAPID_PUBLIC };