import { addDays, differenceInCalendarDays, endOfDay, startOfDay } from "date-fns";
import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { ensureGradeCategoriesInfrastructure } from "../services/gradeCategoriesService";
import { calculateCourseProjection } from "../utils/grading";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

router.use(requireAuth);

type CoachTone = "danger" | "warning" | "success";

type CoachHint = {
  id: string;
  tone: CoachTone;
  title: string;
  message: string;
  action: {
    label: string;
    href: string;
  };
};

type GradeProjectionRow = {
  courseId: string;
  score: number;
  maxScore: number;
  weight: number;
  categoryId: string | null;
};

type GradeCategoryRow = {
  id: string;
  courseId: string;
  name: string;
  weight: number;
};

async function getWeeklyStudyMinutesByCourse(userId: string, from: Date, to: Date) {
  try {
    return await prisma.$queryRaw<Array<{ courseId: string; totalMinutes: number }>>`
      SELECT
        "courseId" AS "courseId",
        COALESCE(SUM("duration"), 0)::int AS "totalMinutes"
      FROM "StudySession"
      WHERE "userId" = ${userId}
        AND "startTime" >= ${from}
        AND "startTime" <= ${to}
      GROUP BY "courseId"
    `;
  } catch {
    return [];
  }
}

async function getLatestStudySessionByCourse(userId: string) {
  try {
    return await prisma.$queryRaw<Array<{ courseId: string; lastEndTime: Date }>>`
      SELECT
        "courseId" AS "courseId",
        MAX("endTime") AS "lastEndTime"
      FROM "StudySession"
      WHERE "userId" = ${userId}
      GROUP BY "courseId"
    `;
  } catch {
    return [];
  }
}

router.get(
  "/summary",
  asyncHandler(async (req, res) => {
    const now = new Date();
    const nextWeek = addDays(now, 7);
    const userId = req.user!.userId;
    await ensureGradeCategoriesInfrastructure();

    const [pendingAssignments, upcomingExams, unreadNotifications, courses, focusTasks, gradeRows, categoryRows] =
      await Promise.all([
        prisma.assignment.count({
          where: {
            userId,
            status: {
              in: ["PENDING", "IN_PROGRESS"],
            },
          },
        }),
        prisma.exam.findMany({
          where: {
            userId,
            dateTime: {
              gte: now,
              lte: nextWeek,
            },
          },
          include: {
            course: true,
          },
          orderBy: {
            dateTime: "asc",
          },
          take: 8,
        }),
        prisma.notification.count({
          where: {
            userId,
            read: false,
          },
        }),
        prisma.course.findMany({
          where: {
            userId,
            archived: false,
          },
          select: {
            id: true,
            name: true,
          },
        }),
        prisma.assignment.findMany({
          where: {
            userId,
            status: {
              in: ["PENDING", "IN_PROGRESS"],
            },
            dueDate: {
              gte: startOfDay(now),
              lte: endOfDay(now),
            },
          },
          include: {
            course: true,
          },
          orderBy: {
            dueDate: "asc",
          },
        }),
        prisma
          .$queryRaw<GradeProjectionRow[]>`
            SELECT
              g."courseId",
              g."score",
              g."maxScore",
              g."weight",
              g."categoryId"
            FROM "Grade" g
            INNER JOIN "Course" c ON c."id" = g."courseId"
            WHERE g."userId" = ${userId}
              AND c."archived" = false
          `
          .catch(() => []),
        prisma
          .$queryRaw<GradeCategoryRow[]>`
            SELECT
              "id",
              "courseId",
              "name",
              "weight"
            FROM "GradeCategory"
            WHERE "userId" = ${userId}
          `
          .catch(() => []),
      ]);

    const gradesByCourse = new Map<string, GradeProjectionRow[]>();
    for (const grade of gradeRows) {
      const bucket = gradesByCourse.get(grade.courseId) ?? [];
      bucket.push(grade);
      gradesByCourse.set(grade.courseId, bucket);
    }

    const categoriesByCourse = new Map<string, GradeCategoryRow[]>();
    for (const category of categoryRows) {
      const bucket = categoriesByCourse.get(category.courseId) ?? [];
      bucket.push(category);
      categoriesByCourse.set(category.courseId, bucket);
    }

    const courseProjections = courses.map((course) => {
      const projection = calculateCourseProjection(
        (gradesByCourse.get(course.id) ?? []).map((grade) => ({
          score: grade.score,
          maxScore: grade.maxScore,
          weight: grade.weight,
          categoryId: grade.categoryId,
        })),
        7,
        {
          categories: (categoriesByCourse.get(course.id) ?? []).map((category) => ({
            id: category.id,
            name: category.name,
            weight: category.weight,
          })),
        },
      );

      return {
        courseId: course.id,
        courseName: course.name,
        currentAverage: Number(projection.currentAverage.toFixed(2)),
        projectedFinal: Number(projection.projectedFinal.toFixed(2)),
        coveredWeight: Number(projection.coveredWeight.toFixed(2)),
      };
    });

    const riskCourses = courseProjections
      .filter((entry) => entry.currentAverage > 0 && entry.currentAverage < 6)
      .sort((a, b) => a.currentAverage - b.currentAverage);

    const gradedCourses = courseProjections.filter((entry) => entry.coveredWeight > 0);
    const globalGpa =
      gradedCourses.length > 0
        ? Number(
            (
              gradedCourses.reduce((acc, entry) => acc + entry.currentAverage, 0) /
              gradedCourses.length
            ).toFixed(2),
          )
        : null;

    res.json({
      kpis: {
        pendingAssignments,
        upcomingExamsCount: upcomingExams.length,
        unreadNotifications,
        riskCoursesCount: riskCourses.length,
        globalGpa,
      },
      upcomingExams,
      riskCourses,
      focusTasks,
    });
  }),
);

router.get(
  "/coach-hint",
  asyncHandler(async (req, res) => {
    const now = new Date();
    const userId = req.user!.userId;
    await ensureGradeCategoriesInfrastructure();
    const inFiveDays = addDays(now, 5);
    const inTenDays = addDays(now, 10);
    const inSevenDays = addDays(now, 7);
    const weekStart = startOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7)));
    const weekEnd = endOfDay(addDays(weekStart, 6));

    const [courses, exams, assignments, weeklyStudyRows, lastStudyRows, gradeRows, categoryRows] = await Promise.all([
      prisma.course.findMany({
        where: { userId, archived: false },
        select: {
          id: true,
          name: true,
        },
      }),
      prisma.exam.findMany({
        where: {
          userId,
          dateTime: {
            gte: now,
            lte: inTenDays,
          },
        },
        include: {
          course: true,
        },
        orderBy: {
          dateTime: "asc",
        },
      }),
      prisma.assignment.findMany({
        where: {
          userId,
          status: {
            in: ["PENDING", "IN_PROGRESS"],
          },
          dueDate: {
            gte: now,
            lte: inSevenDays,
          },
        },
      }),
      getWeeklyStudyMinutesByCourse(userId, weekStart, weekEnd),
      getLatestStudySessionByCourse(userId),
      prisma
        .$queryRaw<GradeProjectionRow[]>`
          SELECT
            g."courseId",
            g."score",
            g."maxScore",
            g."weight",
            g."categoryId"
          FROM "Grade" g
          INNER JOIN "Course" c ON c."id" = g."courseId"
          WHERE g."userId" = ${userId}
            AND c."archived" = false
        `
        .catch(() => []),
      prisma
        .$queryRaw<GradeCategoryRow[]>`
          SELECT
            "id",
            "courseId",
            "name",
            "weight"
          FROM "GradeCategory"
          WHERE "userId" = ${userId}
        `
        .catch(() => []),
    ]);

    const gradesByCourse = new Map<string, GradeProjectionRow[]>();
    for (const grade of gradeRows) {
      const bucket = gradesByCourse.get(grade.courseId) ?? [];
      bucket.push(grade);
      gradesByCourse.set(grade.courseId, bucket);
    }

    const categoriesByCourse = new Map<string, GradeCategoryRow[]>();
    for (const category of categoryRows) {
      const bucket = categoriesByCourse.get(category.courseId) ?? [];
      bucket.push(category);
      categoriesByCourse.set(category.courseId, bucket);
    }

    const projectedByCourse = new Map(
      courses.map((course) => {
        const projection = calculateCourseProjection(
          (gradesByCourse.get(course.id) ?? []).map((grade) => ({
            score: grade.score,
            maxScore: grade.maxScore,
            weight: grade.weight,
            categoryId: grade.categoryId,
          })),
          7,
          {
            categories: (categoriesByCourse.get(course.id) ?? []).map((category) => ({
              id: category.id,
              name: category.name,
              weight: category.weight,
            })),
          },
        );

        return [course.id, Number(projection.projectedFinal.toFixed(2))];
      }),
    );

    const weeklyMinutesByCourse = new Map(weeklyStudyRows.map((row) => [row.courseId, row.totalMinutes]));
    const latestByCourse = new Map(lastStudyRows.map((row) => [row.courseId, row.lastEndTime]));

    let recommendation: CoachHint | null = null;

    for (const exam of exams) {
      if (!exam.courseId) continue;
      const daysUntil = differenceInCalendarDays(exam.dateTime, now);
      if (daysUntil < 0 || daysUntil > 5) continue;

      const projected = projectedByCourse.get(exam.courseId) ?? 10;
      const weeklyMinutes = weeklyMinutesByCourse.get(exam.courseId) ?? 0;
      if (projected >= 7 || weeklyMinutes >= 180) continue;

      recommendation = {
        id: `urgent-exam-${exam.id}`,
        tone: "danger",
        title: `${exam.course?.name ?? "Materia"} requiere atencion`,
        message: `Examen en ${daysUntil} dia(s), nota proyectada ${projected.toFixed(1)} y ${Math.round(weeklyMinutes / 60)}h de estudio esta semana.`,
        action: {
          label: "Iniciar Focus Mode",
          href: `/dashboard?focus=1&course=${exam.courseId}`,
        },
      };
      break;
    }

    if (!recommendation) {
      for (const course of courses) {
        const nextExam = exams.find((exam) => exam.courseId === course.id && differenceInCalendarDays(exam.dateTime, now) <= 10);
        if (!nextExam) continue;

        const lastStudyAt = latestByCourse.get(course.id);
        if (!lastStudyAt) continue;

        const daysWithoutStudy = differenceInCalendarDays(now, new Date(lastStudyAt));
        if (daysWithoutStudy <= 4) continue;

        recommendation = {
          id: `neglected-course-${course.id}`,
          tone: "warning",
          title: `${course.name} sin estudio reciente`,
          message: `No registras sesiones en ${daysWithoutStudy} dias y tienes examen pronto.`,
          action: {
            label: "Retomar Focus",
            href: `/dashboard?focus=1&course=${course.id}`,
          },
        };
        break;
      }
    }

    if (!recommendation) {
      const examsThisWeek = exams.filter((exam) => differenceInCalendarDays(exam.dateTime, now) <= 7).length;
      const assignmentsThisWeek = assignments.length;
      const loadScore = examsThisWeek * 2 + assignmentsThisWeek;

      if (loadScore >= 8) {
        recommendation = {
          id: "heavy-week",
          tone: "warning",
          title: "Semana de alta carga",
          message: `Tienes ${examsThisWeek} examen(es) y ${assignmentsThisWeek} entrega(s) en los proximos 7 dias.`,
          action: {
            label: "Ver Calendario",
            href: "/calendar",
          },
        };
      }
    }

    if (!recommendation) {
      recommendation = {
        id: "all-good",
        tone: "success",
        title: "Buen ritmo academico",
        message: "No hay alertas criticas por ahora. Mantener consistencia esta semana te dara ventaja.",
        action: {
          label: "Revisar metas",
          href: "/dashboard",
        },
      };
    }

    res.json(recommendation);
  }),
);

export { router as dashboardRoutes };
