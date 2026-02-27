import { addDays, addMinutes, subMinutes } from "date-fns";
import cron from "node-cron";
import { logger } from "./logger";
import { prisma } from "./prisma";
import { isRedisReady, notificationQueue, type NotificationJobData } from "./queue";

// ── Throttle repeated dependency-unavailable warnings to once every 5 minutes ──
const THROTTLE_MS = 5 * 60 * 1000;
let lastUnavailableWarnAt = 0;

const QUERY_BATCH_SIZE = 300;
const EXAM_LOOKAHEAD_DAYS = 30;
const ASSIGNMENT_LOOKAHEAD_MINUTES = 24 * 60 + 1;
const MILESTONE_LOOKAHEAD_MINUTES = 24 * 60 + 1;

function shouldTrigger(remindAt: Date, now: Date): boolean {
  const lowerBound = subMinutes(now, 1);
  return remindAt <= now && remindAt >= lowerBound;
}

/** Returns true if the DB responds within a lightweight probe. */
async function isDatabaseAvailable(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

async function enqueue(data: NotificationJobData): Promise<void> {
  // Skip silently when Redis is not connected — job will be re-attempted next tick.
  if (!isRedisReady()) return;

  await notificationQueue.add(data.eventKey, data, {
    jobId: data.eventKey, // idempotent — BullMQ won't re-add an active/waiting job with the same ID
  });
}

async function processExamReminders(now: Date): Promise<void> {
  const horizon = addDays(now, EXAM_LOOKAHEAD_DAYS);
  let cursor: string | undefined;

  while (true) {
    const exams = await prisma.exam.findMany({
      where: {
        dateTime: {
          gte: now,
          lte: horizon,
        },
      },
      include: { course: true, user: true },
      orderBy: { id: "asc" },
      take: QUERY_BATCH_SIZE,
      ...(cursor
        ? {
            cursor: { id: cursor },
            skip: 1,
          }
        : {}),
    });

    if (exams.length === 0) break;

    for (const exam of exams) {
      for (const offset of exam.reminderOffsets) {
        const remindAt = subMinutes(exam.dateTime, offset);
        if (!shouldTrigger(remindAt, now)) continue;

        const label =
          offset >= 1440 ? `${Math.round(offset / 1440)} dia(s)` : `${Math.round(offset / 60)} hora(s)`;
        const courseName = exam.course?.name ? ` de ${exam.course.name}` : "";

        await enqueue({
          eventKey: `exam:${exam.id}:${offset}`,
          userId: exam.userId,
          title: `Recordatorio de examen${courseName}`,
          message: `${exam.title} inicia en ${label}. Fecha: ${exam.dateTime.toLocaleString()}`,
          type: "EXAM",
          scheduledFor: remindAt.toISOString(),
          userEmail: exam.user.email,
          notifyEmail: exam.user.notifyEmail,
        });
      }
    }

    if (exams.length < QUERY_BATCH_SIZE) break;
    cursor = exams[exams.length - 1]?.id;
  }
}

async function processAssignmentReminders(now: Date): Promise<void> {
  const horizon = addMinutes(now, ASSIGNMENT_LOOKAHEAD_MINUTES);
  let cursor: string | undefined;

  const offsets = [1440, 360, 60];

  while (true) {
    const assignments = await prisma.assignment.findMany({
      where: {
        status: { not: "DONE" },
        dueDate: {
          gte: now,
          lte: horizon,
        },
      },
      include: { course: true, user: true },
      orderBy: { id: "asc" },
      take: QUERY_BATCH_SIZE,
      ...(cursor
        ? {
            cursor: { id: cursor },
            skip: 1,
          }
        : {}),
    });

    if (assignments.length === 0) break;

    for (const assignment of assignments) {
      if (!assignment.dueDate) continue;
      for (const offset of offsets) {
        const remindAt = subMinutes(assignment.dueDate, offset);
        if (!shouldTrigger(remindAt, now)) continue;

        const label =
          offset >= 1440 ? `${Math.round(offset / 1440)} dia(s)` : `${Math.round(offset / 60)} hora(s)`;
        const courseName = assignment.course?.name ? ` (${assignment.course.name})` : "";

        await enqueue({
          eventKey: `assignment:${assignment.id}:${offset}`,
          userId: assignment.userId,
          title: `Entrega proxima${courseName}`,
          message: `La tarea "${assignment.title}" vence en ${label}.`,
          type: "ASSIGNMENT",
          scheduledFor: remindAt.toISOString(),
          userEmail: assignment.user.email,
          notifyEmail: assignment.user.notifyEmail,
        });
      }
    }

    if (assignments.length < QUERY_BATCH_SIZE) break;
    cursor = assignments[assignments.length - 1]?.id;
  }
}

async function processMilestoneReminders(now: Date): Promise<void> {
  const horizon = addMinutes(now, MILESTONE_LOOKAHEAD_MINUTES);
  let cursor: string | undefined;

  const offsets = [1440, 360];

  while (true) {
    const milestones = await prisma.milestone.findMany({
      where: {
        dueDate: {
          gte: now,
          lte: horizon,
        },
      },
      include: { project: { include: { user: true } } },
      orderBy: { id: "asc" },
      take: QUERY_BATCH_SIZE,
      ...(cursor
        ? {
            cursor: { id: cursor },
            skip: 1,
          }
        : {}),
    });

    if (milestones.length === 0) break;

    for (const milestone of milestones) {
      if (!milestone.dueDate) continue;
      for (const offset of offsets) {
        const remindAt = subMinutes(milestone.dueDate, offset);
        if (!shouldTrigger(remindAt, now)) continue;

        await enqueue({
          eventKey: `milestone:${milestone.id}:${offset}`,
          userId: milestone.project.userId,
          title: "Milestone proximo",
          message: `"${milestone.title}" del proyecto "${milestone.project.name}" vence pronto.`,
          type: "MILESTONE",
          scheduledFor: remindAt.toISOString(),
          userEmail: milestone.project.user.email,
          notifyEmail: milestone.project.user.notifyEmail,
        });
      }
    }

    if (milestones.length < QUERY_BATCH_SIZE) break;
    cursor = milestones[milestones.length - 1]?.id;
  }
}

export function startScheduler(): void {
  cron.schedule("* * * * *", async () => {
    const now = new Date();

    // ── Dependency guard ───────────────────────────────────────────────────────
    const [dbOk, redisOk] = await Promise.all([isDatabaseAvailable(), Promise.resolve(isRedisReady())]);

    if (!dbOk || !redisOk) {
      const sinceLastWarn = Date.now() - lastUnavailableWarnAt;
      if (sinceLastWarn >= THROTTLE_MS) {
        logger.warn(
          { dbOk, redisOk },
          "Scheduler: skipping tick — one or more dependencies unavailable (suppressed for 5 min)",
        );
        lastUnavailableWarnAt = Date.now();
      }
      return;
    }

    // ── Run processors in parallel, isolate failures ───────────────────────────
    const results = await Promise.allSettled([
      processExamReminders(now),
      processAssignmentReminders(now),
      processMilestoneReminders(now),
    ]);

    const labels = ["ExamReminders", "AssignmentReminders", "MilestoneReminders"];
    results.forEach((result, i) => {
      if (result.status === "rejected") {
        logger.error({ err: result.reason }, `Scheduler: ${labels[i]} processor failed`);
      }
    });
  });

  logger.info("Scheduler started (every minute)");
}
