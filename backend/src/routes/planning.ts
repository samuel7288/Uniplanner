import { addDays } from "date-fns";
import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { generateWeeklyPlan } from "../utils/planning";

const router = Router();

router.use(requireAuth);

router.get(
  "/week",
  asyncHandler(async (req, res) => {
    const now = new Date();
    const nextWeek = addDays(now, 7);

    const [exams, assignments] = await Promise.all([
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
      }),
      prisma.assignment.findMany({
        where: {
          userId: req.user!.userId,
          dueDate: {
            gte: now,
            lte: nextWeek,
          },
          status: {
            not: "DONE",
          },
        },
        include: {
          course: true,
        },
      }),
    ]);

    const items = [
      ...exams.map((exam) => ({
        id: `exam-${exam.id}`,
        title: exam.title,
        dueDate: exam.dateTime,
        type: "exam" as const,
        courseName: exam.course?.name,
      })),
      ...assignments.map((assignment) => ({
        id: `assignment-${assignment.id}`,
        title: assignment.title,
        dueDate: assignment.dueDate,
        type: "assignment" as const,
        courseName: assignment.course?.name,
      })),
    ];

    const plan = generateWeeklyPlan(items, now);

    res.json({
      generatedAt: now.toISOString(),
      items,
      plan,
    });
  }),
);

export { router as planningRoutes };
