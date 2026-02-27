import { addDays, startOfDay } from "date-fns";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";

type HttpError = Error & { status?: number };

function createHttpError(status: number, message: string): HttpError {
  const error = new Error(message) as HttpError;
  error.status = status;
  return error;
}

export type ExamRetroData = {
  obtainedGrade: number | null;
  studyHoursLogged: number | null;
  feelingScore: number | null;
  retroNotes: string | null;
  retroCompletedAt: string | null;
  retroDismissed: boolean;
  retroDismissedAt: string | null;
};

export type SaveExamRetroPayload = {
  obtainedGrade?: number | null;
  studyHoursLogged?: number | null;
  feelingScore?: number | null;
  retroNotes?: string | null;
  skip?: boolean;
};

let examRetrospectiveColumnsReady = false;

export async function ensureExamRetrospectiveColumns(): Promise<void> {
  if (examRetrospectiveColumnsReady) return;

  await prisma.$executeRawUnsafe(
    `ALTER TABLE "Exam" ADD COLUMN IF NOT EXISTS "obtainedGrade" DOUBLE PRECISION`,
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "Exam" ADD COLUMN IF NOT EXISTS "studyHoursLogged" DOUBLE PRECISION`,
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "Exam" ADD COLUMN IF NOT EXISTS "feelingScore" INTEGER`,
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "Exam" ADD COLUMN IF NOT EXISTS "retroNotes" TEXT`,
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "Exam" ADD COLUMN IF NOT EXISTS "retroCompletedAt" TIMESTAMP(3)`,
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "Exam" ADD COLUMN IF NOT EXISTS "retroDismissed" BOOLEAN NOT NULL DEFAULT FALSE`,
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "Exam" ADD COLUMN IF NOT EXISTS "retroDismissedAt" TIMESTAMP(3)`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "Exam_userId_retroCompletedAt_idx" ON "Exam"("userId", "retroCompletedAt")`,
  );

  examRetrospectiveColumnsReady = true;
}

export async function readExamRetrospectivesByIds(ids: string[]): Promise<Map<string, ExamRetroData>> {
  await ensureExamRetrospectiveColumns();
  if (ids.length === 0) return new Map();

  const rows = await prisma.$queryRaw<
    Array<{
      id: string;
      obtainedGrade: number | null;
      studyHoursLogged: number | null;
      feelingScore: number | null;
      retroNotes: string | null;
      retroCompletedAt: Date | null;
      retroDismissed: boolean;
      retroDismissedAt: Date | null;
    }>
  >(
    Prisma.sql`
      SELECT
        e."id",
        e."obtainedGrade",
        e."studyHoursLogged",
        e."feelingScore",
        e."retroNotes",
        e."retroCompletedAt",
        COALESCE(e."retroDismissed", false) AS "retroDismissed",
        e."retroDismissedAt"
      FROM "Exam" e
      WHERE e."id" IN (${Prisma.join(ids)})
    `,
  );

  return new Map(
    rows.map((row) => [
      row.id,
      {
        obtainedGrade: row.obtainedGrade ?? null,
        studyHoursLogged: row.studyHoursLogged ?? null,
        feelingScore: row.feelingScore ?? null,
        retroNotes: row.retroNotes ?? null,
        retroCompletedAt: row.retroCompletedAt?.toISOString() ?? null,
        retroDismissed: row.retroDismissed ?? false,
        retroDismissedAt: row.retroDismissedAt?.toISOString() ?? null,
      },
    ]),
  );
}

export async function getExamRetroContext(userId: string, examId: string) {
  await ensureExamRetrospectiveColumns();

  const exam = await prisma.exam.findFirst({
    where: {
      id: examId,
      userId,
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
  if (!exam) throw createHttpError(404, "Exam not found");

  const retroMap = await readExamRetrospectivesByIds([exam.id]);
  const retro = retroMap.get(exam.id) ?? {
    obtainedGrade: null,
    studyHoursLogged: null,
    feelingScore: null,
    retroNotes: null,
    retroCompletedAt: null,
    retroDismissed: false,
    retroDismissedAt: null,
  };

  const suggestedMinutes = exam.courseId
    ? await prisma
        .$queryRaw<Array<{ totalMinutes: number }>>`
          SELECT COALESCE(SUM("duration"), 0)::int AS "totalMinutes"
          FROM "StudySession"
          WHERE "userId" = ${userId}
            AND "courseId" = ${exam.courseId}
            AND "startTime" >= ${startOfDay(addDays(exam.dateTime, -7))}
            AND "startTime" <= ${exam.dateTime}
        `
        .then((rows) => rows[0]?.totalMinutes ?? 0)
        .catch(() => 0)
    : 0;

  return {
    ...exam,
    ...retro,
    suggestedStudyHours: Number((suggestedMinutes / 60).toFixed(1)),
  };
}

export async function saveExamRetrospective(
  userId: string,
  examId: string,
  payload: SaveExamRetroPayload,
) {
  await ensureExamRetrospectiveColumns();

  const exam = await prisma.exam.findFirst({
    where: {
      id: examId,
      userId,
    },
  });
  if (!exam) throw createHttpError(404, "Exam not found");

  const now = new Date();
  if (payload.skip) {
    await prisma.$executeRaw`
      UPDATE "Exam"
      SET "retroDismissed" = TRUE,
          "retroDismissedAt" = ${now}
      WHERE "id" = ${exam.id}
    `;
    return getExamRetroContext(userId, exam.id);
  }

  await prisma.$executeRaw`
    UPDATE "Exam"
    SET "obtainedGrade" = ${payload.obtainedGrade ?? null},
        "studyHoursLogged" = ${payload.studyHoursLogged ?? null},
        "feelingScore" = ${payload.feelingScore ?? null},
        "retroNotes" = ${payload.retroNotes ?? null},
        "retroCompletedAt" = ${now},
        "retroDismissed" = FALSE,
        "retroDismissedAt" = NULL
    WHERE "id" = ${exam.id}
  `;

  if (typeof payload.obtainedGrade === "number" && exam.courseId) {
    const gradeName = `Examen real: ${exam.title}`;
    const existingGrade = await prisma.grade.findFirst({
      where: {
        userId,
        courseId: exam.courseId,
        name: gradeName,
      },
    });

    if (existingGrade) {
      await prisma.grade.update({
        where: {
          id: existingGrade.id,
        },
        data: {
          score: payload.obtainedGrade,
          maxScore: 10,
          weight: exam.weight ?? existingGrade.weight,
        },
      });
    } else {
      await prisma.grade.create({
        data: {
          userId,
          courseId: exam.courseId,
          name: gradeName,
          score: payload.obtainedGrade,
          maxScore: 10,
          weight: exam.weight ?? 0,
        },
      });
    }
  }

  return getExamRetroContext(userId, exam.id);
}

export async function listExamsNeedingRetrospectivePrompt(from: Date, to: Date) {
  await ensureExamRetrospectiveColumns();
  return prisma.$queryRaw<
    Array<{
      id: string;
      userId: string;
      title: string;
      dateTime: Date;
      courseId: string | null;
      courseName: string | null;
      userEmail: string;
      notifyEmail: boolean;
    }>
  >`
    SELECT
      e."id",
      e."userId",
      e."title",
      e."dateTime",
      e."courseId",
      c."name" AS "courseName",
      u."email" AS "userEmail",
      u."notifyEmail" AS "notifyEmail"
    FROM "Exam" e
    INNER JOIN "User" u ON u."id" = e."userId"
    LEFT JOIN "Course" c ON c."id" = e."courseId"
    WHERE e."dateTime" >= ${from}
      AND e."dateTime" <= ${to}
      AND e."retroCompletedAt" IS NULL
      AND COALESCE(e."retroDismissed", FALSE) = FALSE
  `;
}

