import { randomUUID } from "crypto";
import { endOfWeek, startOfWeek } from "date-fns";
import { prisma } from "../lib/prisma";
import type { CreateStudySessionBody } from "../validators/studySessionsValidators";

type HttpError = Error & { status?: number };

function createHttpError(status: number, message: string): HttpError {
  const error = new Error(message) as HttpError;
  error.status = status;
  return error;
}

let studySessionsTableReady = false;

async function ensureStudySessionsTable(): Promise<void> {
  if (studySessionsTableReady) return;

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "StudySession" (
      "id" TEXT PRIMARY KEY,
      "userId" TEXT NOT NULL,
      "courseId" TEXT NOT NULL,
      "startTime" TIMESTAMP(3) NOT NULL,
      "endTime" TIMESTAMP(3) NOT NULL,
      "duration" INTEGER NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "StudySession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "StudySession_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);

  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "StudySession_userId_startTime_idx" ON "StudySession"("userId", "startTime")`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "StudySession_courseId_idx" ON "StudySession"("courseId")`,
  );

  studySessionsTableReady = true;
}

function resolveDurationInMinutes(payload: CreateStudySessionBody): number {
  if (typeof payload.duration === "number") return payload.duration;

  const diffMinutes = Math.round(
    (payload.endTime.getTime() - payload.startTime.getTime()) / (1000 * 60),
  );
  return Math.max(1, diffMinutes);
}

export async function createStudySession(userId: string, payload: CreateStudySessionBody) {
  await ensureStudySessionsTable();

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
  const id = randomUUID();
  const createdAt = new Date();

  await prisma.$executeRaw`
    INSERT INTO "StudySession" ("id", "userId", "courseId", "startTime", "endTime", "duration", "createdAt")
    VALUES (${id}, ${userId}, ${course.id}, ${payload.startTime}, ${payload.endTime}, ${duration}, ${createdAt})
  `;

  return {
    id,
    userId,
    courseId: course.id,
    startTime: payload.startTime.toISOString(),
    endTime: payload.endTime.toISOString(),
    duration,
    createdAt: createdAt.toISOString(),
    course,
  };
}

export async function listCurrentWeekSessions(userId: string) {
  await ensureStudySessionsTable();

  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 });

  const sessions = await prisma.$queryRaw<
    Array<{
      id: string;
      courseId: string;
      duration: number;
      startTime: Date;
      endTime: Date;
      courseRefId: string;
      courseName: string;
      courseCode: string;
      courseColor: string | null;
    }>
  >`
    SELECT
      s."id",
      s."courseId",
      s."duration",
      s."startTime",
      s."endTime",
      c."id" AS "courseRefId",
      c."name" AS "courseName",
      c."code" AS "courseCode",
      c."color" AS "courseColor"
    FROM "StudySession" s
    INNER JOIN "Course" c ON c."id" = s."courseId"
    WHERE s."userId" = ${userId}
      AND s."startTime" >= ${weekStart}
      AND s."startTime" <= ${weekEnd}
    ORDER BY s."startTime" DESC
  `;

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
      courseId: session.courseRefId,
      courseName: session.courseName,
      code: session.courseCode,
      color: session.courseColor ?? null,
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
      course: {
        id: session.courseRefId,
        name: session.courseName,
        code: session.courseCode,
        color: session.courseColor,
      },
    })),
  };
}
