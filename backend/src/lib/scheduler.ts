import { addDays, addMinutes, differenceInCalendarDays, endOfDay, endOfWeek, startOfDay, startOfWeek, subMinutes } from "date-fns";
import cron from "node-cron";
import { logger } from "./logger";
import { prisma } from "./prisma";
import { isRedisReady, notificationQueue, type NotificationJobData } from "./queue";
import { listStudyGoalsInRange } from "../services/studyGoalsService";
import { listExamsNeedingRetrospectivePrompt } from "../services/examRetrospectiveService";
import { listStudyReminderPreferences } from "../services/studyReminderPreferencesService";

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

async function processStudyGoalNotifications(now: Date): Promise<void> {
  // Run once a day at 09:00 to avoid noisy reminders.
  if (!(now.getHours() === 9 && now.getMinutes() === 0)) return;

  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
  const weekKey = weekStart.toISOString().slice(0, 10);
  const isReminderDay = now.getDay() === 3 || now.getDay() === 5; // Wed or Fri

  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      notifyEmail: true,
    },
  });

  for (const user of users) {
    const goals = await listStudyGoalsInRange(user.id, weekStart, weekEnd);
    for (const goal of goals) {
      if (goal.weeklyMinutes <= 0) continue;

      if (goal.completedMinutes >= goal.weeklyMinutes) {
        await enqueue({
          eventKey: `study-goal:achieved:${user.id}:${goal.courseId}:${weekKey}`,
          userId: user.id,
          title: "Meta semanal cumplida",
          message: `Completaste ${goal.weeklyMinutes} min en ${goal.courseName} esta semana.`,
          type: "SYSTEM",
          scheduledFor: now.toISOString(),
          userEmail: user.email,
          notifyEmail: user.notifyEmail,
        });
        continue;
      }

      if (!isReminderDay || goal.percentage >= 40) continue;

      await enqueue({
        eventKey: `study-goal:reminder:${now.getDay()}:${user.id}:${goal.courseId}:${weekKey}`,
        userId: user.id,
        title: "Recordatorio de meta semanal",
        message: `Llevas ${goal.completedMinutes} min en ${goal.courseName}. Meta: ${goal.weeklyMinutes} min.`,
        type: "SYSTEM",
        scheduledFor: now.toISOString(),
        userEmail: user.email,
        notifyEmail: user.notifyEmail,
      });
    }
  }
}

function buildStudyReminderMessage(
  daysLeft: number,
  daysSinceStudied: number,
  hoursThisWeek: number,
): string {
  if (daysLeft <= 2) {
    return `Tu examen es en ${daysLeft} dia(s). Aprovecha el tiempo que queda.`;
  }
  if (daysSinceStudied >= 5) {
    return `Llevas ${daysSinceStudied} dias sin estudiar esta materia. El examen es en ${daysLeft} dias.`;
  }
  if (hoursThisWeek < 1) {
    return `Esta semana aun no estudias esta materia. Te quedan ${daysLeft} dias para el examen.`;
  }
  return `Llevas ${hoursThisWeek.toFixed(1)}h esta semana. El examen en ${daysLeft} dias se acerca.`;
}

async function processSmartStudyReminders(now: Date): Promise<void> {
  if (!(now.getHours() === 9 && now.getMinutes() === 0)) return;

  const in14Days = addDays(now, 14);
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
  const dayKey = now.toISOString().slice(0, 10);

  const users = await prisma.user.findMany({
    where: {
      notifyInApp: true,
    },
    select: {
      id: true,
      email: true,
      notifyEmail: true,
    },
  });
  if (users.length === 0) return;

  const preferences = await listStudyReminderPreferences(users.map((user) => user.id));

  for (const user of users) {
    const preference = preferences.get(user.id);
    if (!preference || !preference.enabled) continue;

    const [exams, weeklyRows, latestRows] = await Promise.all([
      prisma.exam.findMany({
        where: {
          userId: user.id,
          courseId: {
            not: null,
          },
          dateTime: {
            gte: now,
            lte: in14Days,
          },
        },
        include: {
          course: true,
        },
        orderBy: {
          dateTime: "asc",
        },
      }),
      prisma
        .$queryRaw<Array<{ courseId: string; totalMinutes: number }>>`
          SELECT
            "courseId",
            COALESCE(SUM("duration"), 0)::int AS "totalMinutes"
          FROM "StudySession"
          WHERE "userId" = ${user.id}
            AND "startTime" >= ${weekStart}
            AND "startTime" <= ${weekEnd}
          GROUP BY "courseId"
        `
        .catch(() => []),
      prisma
        .$queryRaw<Array<{ courseId: string; lastEndTime: Date }>>`
          SELECT
            "courseId",
            MAX("endTime") AS "lastEndTime"
          FROM "StudySession"
          WHERE "userId" = ${user.id}
          GROUP BY "courseId"
        `
        .catch(() => []),
    ]);

    if (exams.length === 0) continue;

    const weeklyMinutesByCourse = new Map(weeklyRows.map((row) => [row.courseId, row.totalMinutes]));
    const latestByCourse = new Map(latestRows.map((row) => [row.courseId, row.lastEndTime]));

    for (const exam of exams) {
      if (!exam.courseId) continue;

      const daysLeft = differenceInCalendarDays(exam.dateTime, now);
      if (daysLeft < 0 || daysLeft > 14) continue;

      const lastSessionEnd = latestByCourse.get(exam.courseId);
      const daysSinceStudied = lastSessionEnd ? differenceInCalendarDays(now, new Date(lastSessionEnd)) : 999;
      const hoursThisWeek = (weeklyMinutesByCourse.get(exam.courseId) ?? 0) / 60;

      const shouldNotify =
        (daysLeft <= 7 && daysSinceStudied >= preference.minDaysWithoutStudy) ||
        (daysLeft <= 3 && daysSinceStudied >= 1) ||
        (daysLeft <= 5 && hoursThisWeek < 2);
      if (!shouldNotify) continue;

      const courseName = exam.course?.name ?? "esta materia";
      await enqueue({
        eventKey: `study-reminder:${user.id}:${exam.id}:${dayKey}`,
        userId: user.id,
        title: `Recuerda estudiar ${courseName}`,
        message: buildStudyReminderMessage(daysLeft, daysSinceStudied, hoursThisWeek),
        type: "SYSTEM",
        scheduledFor: now.toISOString(),
        userEmail: user.email,
        notifyEmail: user.notifyEmail,
      });
    }
  }
}

async function processExamRetrospectivePrompts(now: Date): Promise<void> {
  if (!(now.getHours() === 9 && now.getMinutes() === 0)) return;

  const from = startOfDay(addDays(now, -2));
  const to = endOfDay(addDays(now, -1));
  const exams = await listExamsNeedingRetrospectivePrompt(from, to);

  for (const exam of exams) {
    const courseLabel = exam.courseName ? ` de ${exam.courseName}` : "";
    await enqueue({
      eventKey: `exam-retro:${exam.id}`,
      userId: exam.userId,
      title: `Como te fue en ${exam.title}${courseLabel}?`,
      message: "Registra tu nota y retrospectiva para mantener tu historial academico al dia.",
      type: "SYSTEM",
      scheduledFor: now.toISOString(),
      userEmail: exam.userEmail,
      notifyEmail: exam.notifyEmail,
    });
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
      processStudyGoalNotifications(now),
      processSmartStudyReminders(now),
      processExamRetrospectivePrompts(now),
    ]);

    const labels = [
      "ExamReminders",
      "AssignmentReminders",
      "MilestoneReminders",
      "StudyGoalNotifications",
      "SmartStudyReminders",
      "ExamRetrospectivePrompts",
    ];
    results.forEach((result, i) => {
      if (result.status === "rejected") {
        logger.error({ err: result.reason }, `Scheduler: ${labels[i]} processor failed`);
      }
    });
  });

  logger.info("Scheduler started (every minute)");
}
