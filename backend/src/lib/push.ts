import webPush from "web-push";
import { env } from "../config/env";
import { logger } from "./logger";
import {
  listPushSubscriptionsForUser,
  removePushSubscriptionByEndpoint,
} from "../services/pushSubscriptionsService";

type WebPushPayload = {
  title: string;
  message: string;
  type: "EXAM" | "ASSIGNMENT" | "MILESTONE" | "SYSTEM";
  eventKey: string;
  url?: string;
};

let vapidConfigured = false;

export function isWebPushConfigured(): boolean {
  return Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT);
}

export function getWebPushPublicKey(): string | null {
  return env.VAPID_PUBLIC_KEY ?? null;
}

function ensureVapidConfiguration(): void {
  if (vapidConfigured || !isWebPushConfigured()) return;

  webPush.setVapidDetails(
    env.VAPID_SUBJECT!,
    env.VAPID_PUBLIC_KEY!,
    env.VAPID_PRIVATE_KEY!,
  );
  vapidConfigured = true;
}

export async function sendWebPushToUser(userId: string, payload: WebPushPayload): Promise<void> {
  if (!isWebPushConfigured()) return;
  ensureVapidConfiguration();

  const subscriptions = await listPushSubscriptionsForUser(userId);
  if (subscriptions.length === 0) return;

  const notificationPayload = JSON.stringify({
    title: payload.title,
    body: payload.message,
    type: payload.type,
    eventKey: payload.eventKey,
    url: payload.url ?? "/notifications",
  });

  for (const subscription of subscriptions) {
    try {
      await webPush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subscription.p256dhKey,
            auth: subscription.authKey,
          },
        },
        notificationPayload,
      );
    } catch (error) {
      const statusCode = (error as { statusCode?: number } | undefined)?.statusCode;
      if (statusCode === 404 || statusCode === 410) {
        await removePushSubscriptionByEndpoint(userId, subscription.endpoint);
        continue;
      }
      logger.warn(
        {
          userId,
          endpoint: subscription.endpoint,
          statusCode,
        },
        "Failed to send web push notification",
      );
    }
  }
}

