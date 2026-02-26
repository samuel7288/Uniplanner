import { Router } from "express";
import { NotificationType, Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { validate } from "../middleware/validation";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

router.use(requireAuth);

router.get(
  "/",
  validate(
    z.object({
      body: z.object({}).passthrough(),
      params: z.object({}).passthrough(),
      query: z.object({
        unreadOnly: z.coerce.boolean().optional(),
        type: z.nativeEnum(NotificationType).optional(),
        page: z.coerce.number().int().min(1).optional(),
        limit: z.coerce.number().int().min(1).max(100).optional(),
        sortBy: z.enum(["createdAt", "read", "type"]).optional(),
        sortDir: z.enum(["asc", "desc"]).optional(),
      }),
    }),
  ),
  asyncHandler(async (req, res) => {
    const query = req.query as {
      unreadOnly?: boolean;
      type?: NotificationType;
      page?: number;
      limit?: number;
      sortBy?: "createdAt" | "read" | "type";
      sortDir?: "asc" | "desc";
    };
    const unreadOnly = query.unreadOnly === true;
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const sortBy = query.sortBy ?? "createdAt";
    const sortDir = query.sortDir ?? "desc";

    const where: Prisma.NotificationWhereInput = {
      userId: req.user!.userId,
      read: unreadOnly ? false : undefined,
      type: query.type,
    };

    const [total, notifications, unreadCount] = await prisma.$transaction([
      prisma.notification.count({ where }),
      prisma.notification.findMany({
        where,
        orderBy: {
          [sortBy]: sortDir,
        } as Prisma.NotificationOrderByWithRelationInput,
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.notification.count({
        where: {
          userId: req.user!.userId,
          read: false,
        },
      }),
    ]);

    const totalPages = Math.ceil(total / limit);

    res.json({
      items: notifications,
      unreadCount,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
      sort: {
        sortBy,
        sortDir,
      },
      filters: {
        unreadOnly,
        type: query.type ?? null,
      },
    });
  }),
);

router.get(
  "/unread-count",
  asyncHandler(async (req, res) => {
    const unreadCount = await prisma.notification.count({
      where: {
        userId: req.user!.userId,
        read: false,
      },
    });

    res.json({ unreadCount });
  }),
);

router.patch(
  "/:id/read",
  asyncHandler(async (req, res) => {
    const notification = await prisma.notification.findFirst({
      where: {
        id: req.params.id,
        userId: req.user!.userId,
      },
    });

    if (!notification) {
      res.status(404).json({ message: "Notification not found" });
      return;
    }

    const updated = await prisma.notification.update({
      where: { id: notification.id },
      data: { read: true },
    });

    res.json(updated);
  }),
);

router.patch(
  "/read-all",
  asyncHandler(async (req, res) => {
    await prisma.notification.updateMany({
      where: {
        userId: req.user!.userId,
        read: false,
      },
      data: {
        read: true,
      },
    });

    res.json({ message: "All notifications marked as read" });
  }),
);

export { router as notificationsRoutes };

