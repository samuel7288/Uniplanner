import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import type { ListNotificationsQuery } from "../validators/notificationsValidators";

type HttpError = Error & { status?: number };

function createHttpError(status: number, message: string): HttpError {
  const error = new Error(message) as HttpError;
  error.status = status;
  return error;
}

export async function listNotifications(userId: string, query: ListNotificationsQuery) {
  const unreadOnly = query.unreadOnly === true;
  const page = query.page ?? 1;
  const limit = query.limit ?? 20;
  const sortBy = query.sortBy ?? "createdAt";
  const sortDir = query.sortDir ?? "desc";

  const where: Prisma.NotificationWhereInput = {
    userId,
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
        userId,
        read: false,
      },
    }),
  ]);

  const totalPages = Math.ceil(total / limit);

  return {
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
  };
}

export async function getUnreadCount(userId: string) {
  const unreadCount = await prisma.notification.count({
    where: {
      userId,
      read: false,
    },
  });
  return { unreadCount };
}

export async function markAllAsRead(userId: string) {
  await prisma.notification.updateMany({
    where: {
      userId,
      read: false,
    },
    data: {
      read: true,
    },
  });

  return { message: "All notifications marked as read" };
}

export async function markOneAsRead(userId: string, notificationId: string) {
  const notification = await prisma.notification.findFirst({
    where: {
      id: notificationId,
      userId,
    },
  });

  if (!notification) throw createHttpError(404, "Notification not found");

  return prisma.notification.update({
    where: { id: notification.id },
    data: { read: true },
  });
}
