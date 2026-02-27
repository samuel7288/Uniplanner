import { Router } from "express";
import {
  getUnreadCountHandler,
  listNotificationsHandler,
  markAllReadHandler,
  markNotificationReadHandler,
} from "../controllers/notificationsController";
import { requireAuth } from "../middleware/auth";
import { validate } from "../middleware/validation";
import { listNotificationsSchema } from "../validators/notificationsValidators";

const router = Router();

router.use(requireAuth);

router.get("/", validate(listNotificationsSchema), listNotificationsHandler);
router.get("/unread-count", getUnreadCountHandler);
router.patch("/read-all", markAllReadHandler);
router.patch("/:id/read", markNotificationReadHandler);

export { router as notificationsRoutes };
