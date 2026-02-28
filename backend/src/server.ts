import { app } from "./app";
import { env } from "./config/env";
import { logger } from "./lib/logger";
import { startScheduler } from "./lib/scheduler";
import { startNotificationWorker } from "./workers/notificationWorker";

app.listen(env.BACKEND_PORT, () => {
  logger.info({ port: env.BACKEND_PORT }, "UniPlanner API started");
  startScheduler();
  try {
    startNotificationWorker();
  } catch (err) {
    logger.error(
      { err },
      "Notification worker failed to start — Redis may be unavailable. Notifications will be degraded.",
    );
  }
});
