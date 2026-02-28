import { endOfWeek, startOfWeek } from "date-fns";
import { logger } from "../lib/logger";
import { prisma } from "../lib/prisma";
import { evaluateAndUnlockAchievements } from "./achievementsService";
import type { CreateStudySessionBody } from "../validators/studySessionsValidators";

type HttpError = Error & { status?: number };

function createHttpError(status: number, message: string): HttpError {
  const error = new Error(message) as HttpError;
  error.status = status;
  return error;
}

function resolveDurationInMinutes(payload: CreateStudySessionBody): number {
  if (typeof payload.duration === "number") return payload.duration;

  const diffMinutes = Math.round(
    (payload.endTime.getTime() - payload.startTime.getTime()) / (1000 * 60),
  );
  return Math.max(1, diffMinutes);
}

export async function createStudySession(userId: string, payload: CreateStudySessionBody) {
  const course = await prisma.course.findFirst({
    where: {
      id: payload.courseId,
      userId,
      archived: false,
    },
    select: {
      id: true,
      name: true,
      code: true,
      color: true,
    },
  });

  if (!course) throw createHttpError(404, "Course not found");

  const duration = resolveDurationInMinutes(payload);
  const session = await prisma.studySession.create({
    data: {
      userId,
      courseId: course.id,
      startTime: payload.startTime,
      endTime: payload.endTime,
      duration,
      source: payload.source,
    },
    include: {
      course: {
        select: {
          id: true,
          name: true,
          code: true,
          color: true,
        },
      },
    },
  });

  await evaluateAndUnlockAchievements(userId).catch((err: unknown) => {
    logger.error({ err, userId }, "achievements evaluation failed");
  });

  return {
    id: session.id,
    userId: session.userId,
    courseId: session.courseId,
    startTime: session.startTime.toISOString(),
    endTime: session.endTime.toISOString(),
    duration: session.duration,
    source: session.source,
    createdAt: session.createdAt.toISOString(),
    course: session.course,
  };
}

export async function listCurrentWeekSessions(userId: string) {
  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 });

  const sessions = await prisma.studySession.findMany({
    where: {
      userId,
      startTime: {
        gte: weekStart,
        lte: weekEnd,
      },
    },
    include: {
      course: {
        select: {
          id: true,
          name: true,
          code: true,
          color: true,
        },
      },
    },
    orderBy: {
      startTime: "desc",
    },
  });

  const byCourseMap = new Map<
    string,
    {
      courseId: string;
      courseName: string;
      code: string;
      color: string | null;
      totalMinutes: number;
      sessionCount: number;
    }
  >();

  for (const session of sessions) {
    const existing = byCourseMap.get(session.courseId);
    if (existing) {
      existing.totalMinutes += session.duration;
      existing.sessionCount += 1;
      continue;
    }

    byCourseMap.set(session.courseId, {
      courseId: session.course.id,
      courseName: session.course.name,
      code: session.course.code,
      color: session.course.color ?? null,
      totalMinutes: session.duration,
      sessionCount: 1,
    });
  }

  const byCourse = Array.from(byCourseMap.values()).sort((a, b) => b.totalMinutes - a.totalMinutes);
  const totalMinutes = byCourse.reduce((acc, item) => acc + item.totalMinutes, 0);

  return {
    weekStart: weekStart.toISOString(),
    weekEnd: weekEnd.toISOString(),
    totalMinutes,
    byCourse,
    sessions: sessions.map((session) => ({
      id: session.id,
      courseId: session.courseId,
      duration: session.duration,
      startTime: session.startTime.toISOString(),
      endTime: session.endTime.toISOString(),
      source: session.source,
      course: {
        id: session.course.id,
        name: session.course.name,
        code: session.course.code,
        color: session.course.color,
      },
    })),
  };
}
