declare module "web-push" {
  interface PushSubscription {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  }
  function setVapidDetails(subject: string, publicKey: string, privateKey: string): void;
  function sendNotification(sub: PushSubscription, payload: string): Promise<void>;
}