import { app } from "./app";
import { env } from "./config/env";
import { logger } from "./lib/logger";
import { startScheduler } from "./lib/scheduler";
import { startNotificationWorker } from "./workers/notificationWorker";

app.listen(env.BACKEND_PORT, () => {
  logger.info({ port: env.BACKEND_PORT }, "UniPlanner API started");
  startScheduler();
  startNotificationWorker();
});
