import { randomUUID } from "crypto";
import { endOfWeek, startOfWeek } from "date-fns";
import { prisma } from "../lib/prisma";

type HttpError = Error & { status?: number };

function createHttpError(status: number, message: string): HttpError {
  const error = new Error(message) as HttpError;
  error.status = status;
  return error;
}

let studyGoalsTablesReady = false;

async function ensureStudyGoalsTables(): Promise<void> {
  if (studyGoalsTablesReady) return;

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "StudyGoal" (
      "id" TEXT PRIMARY KEY,
      "userId" TEXT NOT NULL,
      "courseId" TEXT NOT NULL,
      "weeklyMinutes" INTEGER NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "StudyGoal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "StudyGoal_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "StudyGoal_userId_courseId_key" UNIQUE ("userId", "courseId")
    )
  `);

  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "StudyGoal_userId_idx" ON "StudyGoal"("userId")`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "StudyGoal_courseId_idx" ON "StudyGoal"("courseId")`,
  );

  // StudySession is created by #86/#92. Keep this guard to avoid failed joins in fresh environments.
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "StudySession" (
      "id" TEXT PRIMARY KEY,
      "userId" TEXT NOT NULL,
      "courseId" TEXT NOT NULL,
      "startTime" TIMESTAMP(3) NOT NULL,
      "endTime" TIMESTAMP(3) NOT NULL,
      "duration" INTEGER NOT NULL,
      "source" TEXT NOT NULL DEFAULT 'manual',
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  studyGoalsTablesReady = true;
}

type StudyGoalProgressRow = {
  courseId: string;
  courseName: string;
  code: string;
  color: string | null;
  weeklyMinutes: number;
  completedMinutes: number;
  sessions: number;
};

function mapProgressRows(rows: StudyGoalProgressRow[]) {
  return rows.map((row) => ({
    ...row,
    percentage:
      row.weeklyMinutes > 0
        ? Math.max(0, Math.min(100, Math.round((row.completedMinutes / row.weeklyMinutes) * 100)))
        : 0,
  }));
}

export async function listStudyGoalsInRange(userId: string, weekStart: Date, weekEnd: Date) {
  await ensureStudyGoalsTables();

  const rows = await prisma.$queryRaw<StudyGoalProgressRow[]>`
    SELECT
      c."id" AS "courseId",
      c."name" AS "courseName",
      c."code" AS "code",
      c."color" AS "color",
      COALESCE(g."weeklyMinutes", 0) AS "weeklyMinutes",
      COALESCE(SUM(s."duration"), 0)::int AS "completedMinutes",
      COALESCE(COUNT(s."id"), 0)::int AS "sessions"
    FROM "Course" c
    LEFT JOIN "StudyGoal" g
      ON g."courseId" = c."id"
      AND g."userId" = c."userId"
    LEFT JOIN "StudySession" s
      ON s."courseId" = c."id"
      AND s."userId" = c."userId"
      AND s."startTime" >= ${weekStart}
      AND s."startTime" <= ${weekEnd}
    WHERE c."userId" = ${userId}
      AND c."archived" = false
    GROUP BY c."id", c."name", c."code", c."color", g."weeklyMinutes"
    ORDER BY c."name" ASC
  `;

  return mapProgressRows(rows);
}

export async function listCurrentWeekStudyGoals(userId: string) {
  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 });

  return listStudyGoalsInRange(userId, weekStart, weekEnd);
}

export async function upsertStudyGoal(userId: string, courseId: string, weeklyMinutes: number) {
  await ensureStudyGoalsTables();

  const course = await prisma.course.findFirst({
    where: {
      id: courseId,
      userId,
      archived: false,
    },
    select: { id: true },
  });

  if (!course) throw createHttpError(404, "Course not found");

  const now = new Date();
  await prisma.$executeRaw`
    INSERT INTO "StudyGoal" ("id", "userId", "courseId", "weeklyMinutes", "createdAt", "updatedAt")
    VALUES (${randomUUID()}, ${userId}, ${course.id}, ${weeklyMinutes}, ${now}, ${now})
    ON CONFLICT ("userId", "courseId")
    DO UPDATE
      SET "weeklyMinutes" = EXCLUDED."weeklyMinutes",
          "updatedAt" = EXCLUDED."updatedAt"
  `;

  const goals = await listCurrentWeekStudyGoals(userId);
  const updated = goals.find((goal) => goal.courseId === course.id);
  if (!updated) throw createHttpError(500, "Failed to read updated study goal");

  return updated;
}

