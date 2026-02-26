import { Worker } from "bullmq";
import { sendEmail } from "../lib/email";
import { logger } from "../lib/logger";
import { prisma } from "../lib/prisma";
import { redisConnection, type NotificationJobData } from "../lib/queue";

// A notification was "just created" if it was persisted less than 10 seconds ago,
// which means this worker is the first to process this eventKey.
const JUST_CREATED_THRESHOLD_MS = 10_000;

export function startNotificationWorker(): Worker<NotificationJobData> {
  const worker = new Worker<NotificationJobData>(
    "notifications",
    async (job) => {
      const { eventKey, userId, title, message, type, scheduledFor, userEmail, notifyEmail } = job.data;

      const notification = await prisma.notification.upsert({
        where: { eventKey },
        update: {},
        create: {
          eventKey,
          userId,
          title,
          message,
          type,
          scheduledFor: new Date(scheduledFor),
          sentAt: new Date(),
        },
      });

      // Only send email if notification was freshly created (not a duplicate run)
      const justCreated = Date.now() - notification.createdAt.getTime() < JUST_CREATED_THRESHOLD_MS;

      if (notifyEmail && justCreated) {
        await sendEmail({ to: userEmail, subject: title, text: message });
      }
    },
    { connection: redisConnection, concurrency: 5 },
  );

  worker.on("completed", (job) => {
    logger.debug({ jobId: job.id, eventKey: job.data.eventKey }, "Notification job completed");
  });

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, eventKey: job?.data?.eventKey, err: err.message }, "Notification job failed");
  });

  logger.info("Notification worker started");
  return worker;
}
