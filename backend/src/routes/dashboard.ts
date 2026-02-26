import { addDays, endOfDay, startOfDay } from "date-fns";
import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { calculateCourseProjection } from "../utils/grading";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

router.use(requireAuth);

router.get(
  "/summary",
  asyncHandler(async (req, res) => {
    const now = new Date();
    const nextWeek = addDays(now, 7);

    const [pendingAssignments, upcomingExams, unreadNotifications, courses, focusTasks] =
      await Promise.all([
        prisma.assignment.count({
          where: {
            userId: req.user!.userId,
            status: {
              in: ["PENDING", "IN_PROGRESS"],
            },
          },
        }),
        prisma.exam.findMany({
          where: {
            userId: req.user!.userId,
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
            userId: req.user!.userId,
            read: false,
          },
        }),
        prisma.course.findMany({
          where: {
            userId: req.user!.userId,
          },
          include: {
            grades: true,
          },
        }),
        prisma.assignment.findMany({
          where: {
            userId: req.user!.userId,
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
      ]);

    const riskCourses = courses
      .map((course) => {
        const projection = calculateCourseProjection(
          course.grades.map((grade) => ({
            score: grade.score,
            maxScore: grade.maxScore,
            weight: grade.weight,
          })),
          7,
        );

        return {
          courseId: course.id,
          courseName: course.name,
          currentAverage: Number(projection.currentAverage.toFixed(2)),
          projectedFinal: Number(projection.projectedFinal.toFixed(2)),
          coveredWeight: Number(projection.coveredWeight.toFixed(2)),
        };
      })
      .filter((entry) => entry.currentAverage > 0 && entry.currentAverage < 6)
      .sort((a, b) => a.currentAverage - b.currentAverage);

    res.json({
      kpis: {
        pendingAssignments,
        upcomingExamsCount: upcomingExams.length,
        unreadNotifications,
        riskCoursesCount: riskCourses.length,
      },
      upcomingExams,
      riskCourses,
      focusTasks,
    });
  }),
);

export { router as dashboardRoutes };
