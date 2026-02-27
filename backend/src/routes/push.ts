import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { getWebPushPublicKey, isWebPushConfigured } from "../lib/push";
import { requestSchema } from "../lib/validate";
import { requireAuth } from "../middleware/auth";
import { validate } from "../middleware/validation";
import {
  listPushSubscriptionsForUser,
  removeAllPushSubscriptionsForUser,
  removePushSubscriptionByEndpoint,
  upsertPushSubscription,
} from "../services/pushSubscriptionsService";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

const pushSubscriptionSchema = z.object({
  endpoint: z.string().url(),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

const subscribeSchema = requestSchema({
  body: z.object({
    subscription: pushSubscriptionSchema,
  }),
});

const unsubscribeSchema = requestSchema({
  body: z.object({
    endpoint: z.string().url().optional(),
  }),
});

router.use(requireAuth);

router.get(
  "/public-key",
  asyncHandler(async (_req, res) => {
    if (!isWebPushConfigured()) {
      res.status(503).json({ message: "Web push is not configured in server environment" });
      return;
    }

    res.json({ publicKey: getWebPushPublicKey() });
  }),
);

router.post(
  "/subscribe",
  validate(subscribeSchema),
  asyncHandler(async (req, res) => {
    if (!isWebPushConfigured()) {
      res.status(503).json({ message: "Web push is not configured in server environment" });
      return;
    }

    const { subscription } = req.body as {
      subscription: z.infer<typeof pushSubscriptionSchema>;
    };
    const userId = req.user!.userId;

    await upsertPushSubscription(userId, {
      endpoint: subscription.endpoint,
      keys: subscription.keys,
    });

    await prisma.user.update({
      where: { id: userId },
      data: { browserPushEnabled: true },
      select: { id: true },
    });

    res.status(201).json({ enabled: true });
  }),
);

router.delete(
  "/subscribe",
  validate(unsubscribeSchema),
  asyncHandler(async (req, res) => {
    const userId = req.user!.userId;
    const { endpoint } = req.body as { endpoint?: string };

    if (endpoint) {
      await removePushSubscriptionByEndpoint(userId, endpoint);
    } else {
      await removeAllPushSubscriptionsForUser(userId);
    }

    const remaining = await listPushSubscriptionsForUser(userId);
    const enabled = remaining.length > 0;

    await prisma.user.update({
      where: { id: userId },
      data: { browserPushEnabled: enabled },
      select: { id: true },
    });

    res.json({ enabled, subscriptions: remaining.length });
  }),
);

export { router as pushRoutes };

