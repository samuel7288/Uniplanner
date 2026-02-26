import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { env } from "../config/env";

export const redisConnection = new Redis(env.REDIS_URL, {
  password: env.REDIS_PASSWORD,
  maxRetriesPerRequest: 3,
  lazyConnect: true,
  retryStrategy: (times) => Math.min(times * 100, 2000),
});

// ── Observability ─────────────────────────────────────────────────────────────
// Use process.stderr directly to avoid circular import with logger.
redisConnection.on("connect", () =>
  process.stderr.write("[Redis] Connecting...\n"),
);
redisConnection.on("ready", () =>
  process.stderr.write("[Redis] Ready\n"),
);
redisConnection.on("close", () =>
  process.stderr.write("[Redis] Connection closed\n"),
);
redisConnection.on("reconnecting", () =>
  process.stderr.write("[Redis] Reconnecting...\n"),
);
redisConnection.on("error", (err: Error) =>
  process.stderr.write(`[Redis] Connection error: ${err.message}\n`),
);

/**
 * Returns true only when ioredis has an established, usable connection.
 * Use this as a lightweight guard before attempting to enqueue jobs.
 */
export function isRedisReady(): boolean {
  return redisConnection.status === "ready";
}

export type NotificationJobData = {
  eventKey: string;
  userId: string;
  title: string;
  message: string;
  type: "EXAM" | "ASSIGNMENT" | "MILESTONE";
  scheduledFor: string; // ISO string
  userEmail: string;
  notifyEmail: boolean;
};

export const notificationQueue = new Queue<NotificationJobData>("notifications", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 100 },
  },
});
