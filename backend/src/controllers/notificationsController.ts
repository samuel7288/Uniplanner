import { asyncHandler } from "../utils/asyncHandler";
import type { ListNotificationsQuery } from "../validators/notificationsValidators";
import {
  getUnreadCount,
  listNotifications,
  markAllAsRead,
  markOneAsRead,
} from "../services/notificationsService";

export const listNotificationsHandler = asyncHandler(async (req, res) => {
  const query = req.query as ListNotificationsQuery;
  const response = await listNotifications(req.user!.userId, query);
  res.json(response);
});

export const getUnreadCountHandler = asyncHandler(async (req, res) => {
  const response = await getUnreadCount(req.user!.userId);
  res.json(response);
});

export const markAllReadHandler = asyncHandler(async (req, res) => {
  const response = await markAllAsRead(req.user!.userId);
  res.json(response);
});

export const markNotificationReadHandler = asyncHandler(async (req, res) => {
  const updated = await markOneAsRead(req.user!.userId, req.params.id);
  res.json(updated);
});
