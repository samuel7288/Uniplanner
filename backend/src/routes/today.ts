import { addDays, differenceInCalendarDays, endOfDay, isSameDay, startOfDay } from "date-fns";
import { Prisma } from "@prisma/client";
import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

router.use(requireAuth);

type TodayItemType = "assignment" | "exam" | "project" | "milestone";
type TodayBucket = "today" | "tomorrow" | "week";

type TodayItem = {
  id: string;
  type: TodayItemType;
  title: string;
  dueAt: string;
  courseId: string | null;
  courseName: string | null;
  status: string | null;
  estimatedMinutes: number | null;
  bucket: TodayBucket;
  daysLeft: number;
};

function resolveBucket(dueAt: Date, now: Date, tomorrow: Date): TodayBucket {
  if (isSameDay(dueAt, now)) return "today";
  if (isSameDay(dueAt, tomorrow)) return "tomorrow";
  return "week";
}

function typeRank(type: TodayItemType): number {
  if (type === "assignment") return 1;
  if (type === "exam") return 2;
  if (type === "milestone") return 3;
  return 4;
}

function sortByUrgency(a: TodayItem, b: TodayItem): number {
  if (a.daysLeft !== b.daysLeft) return a.daysLeft - b.daysLeft;
  if (a.dueAt !== b.dueAt) return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
  return typeRank(a.type) - typeRank(b.type);
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const userId = req.user!.userId;
    const now = new Date();
    const tomorrow = addDays(now, 1);

    const dayStart = startOfDay(now);
    const dayEnd = endOfDay(now);
    const tomorrowStart = startOfDay(tomorrow);
    const tomorrowEnd = endOfDay(tomorrow);
    const weekEnd = endOfDay(addDays(now, 7));

    const [
      classSessions,
      pendingAssignments,
      dueTodayAssignments,
      exams,
      milestones,
      projects,
      studyMinutesRows,
    ] = await Promise.all([
      prisma.classSession.findMany({
        where: {
          dayOfWeek: now.getDay(),
          course: {
            userId,
            archived: false,
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
          startTime: "asc",
        },
      }),
      prisma.assignment.findMany({
        where: {
          userId,
          status: {
            in: ["PENDING", "IN_PROGRESS"],
          },
          dueDate: {
            gte: dayStart,
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
          dueDate: "asc",
        },
      }),
      prisma.assignment.findMany({
        where: {
          userId,
          dueDate: {
            gte: dayStart,
            lte: dayEnd,
          },
        },
        select: {
          id: true,
          status: true,
        },
      }),
      prisma.exam.findMany({
        where: {
          userId,
          dateTime: {
            gte: dayStart,
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
          dateTime: "asc",
        },
      }),
      prisma.milestone.findMany({
        where: {
          completed: false,
          dueDate: {
            not: null,
            gte: dayStart,
            lte: weekEnd,
          },
          project: {
            userId,
          },
        },
        include: {
          project: {
            select: {
              id: true,
              name: true,
              courseId: true,
              course: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
        orderBy: {
          dueDate: "asc",
        },
      }),
      prisma.project.findMany({
        where: {
          userId,
          status: {
            in: ["TODO", "DOING"],
          },
          dueDate: {
            gte: dayStart,
            lte: weekEnd,
          },
        },
        include: {
          course: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: {
          dueDate: "asc",
        },
      }),
      prisma
        .$queryRaw<Array<{ totalMinutes: number }>>(
          Prisma.sql`
            SELECT COALESCE(SUM("duration"), 0)::int AS "totalMinutes"
            FROM "StudySession"
            WHERE "userId" = ${userId}
              AND "startTime" >= ${dayStart}
              AND "startTime" <= ${dayEnd}
          `,
        )
        .catch(() => [{ totalMinutes: 0 }]),
    ]);

    const assignmentEstimatedRows =
      pendingAssignments.length > 0
        ? await prisma.$queryRaw<Array<{ id: string; estimatedMinutes: number | null }>>(
            Prisma.sql`
              SELECT a."id", a."estimatedMinutes"
              FROM "Assignment" a
              WHERE a."id" IN (${Prisma.join(pendingAssignments.map((assignment) => assignment.id))})
            `,
          )
        : [];
    const assignmentEstimatedMap = new Map(
      assignmentEstimatedRows.map((row) => [row.id, row.estimatedMinutes ?? null]),
    );

    const assignmentItems: TodayItem[] = pendingAssignments.map((assignment) => {
      const bucket = resolveBucket(assignment.dueDate, now, tomorrow);
      return {
        id: assignment.id,
        type: "assignment",
        title: assignment.title,
        dueAt: assignment.dueDate.toISOString(),
        courseId: assignment.course?.id ?? assignment.courseId ?? null,
        courseName: assignment.course?.name ?? null,
        status: assignment.status,
        estimatedMinutes: assignmentEstimatedMap.get(assignment.id) ?? null,
        bucket,
        daysLeft: differenceInCalendarDays(assignment.dueDate, now),
      };
    });

    const examItems: TodayItem[] = exams.map((exam) => {
      const bucket = resolveBucket(exam.dateTime, now, tomorrow);
      return {
        id: exam.id,
        type: "exam",
        title: exam.title,
        dueAt: exam.dateTime.toISOString(),
        courseId: exam.course?.id ?? exam.courseId ?? null,
        courseName: exam.course?.name ?? null,
        status: null,
        estimatedMinutes: null,
        bucket,
        daysLeft: differenceInCalendarDays(exam.dateTime, now),
      };
    });

    const milestoneItems: TodayItem[] = milestones.map((milestone) => {
      const dueDate = milestone.dueDate!;
      const bucket = resolveBucket(dueDate, now, tomorrow);
      return {
        id: milestone.id,
        type: "milestone",
        title: `${milestone.project.name}: ${milestone.title}`,
        dueAt: dueDate.toISOString(),
        courseId: milestone.project.courseId ?? null,
        courseName: milestone.project.course?.name ?? null,
        status: null,
        estimatedMinutes: null,
        bucket,
        daysLeft: differenceInCalendarDays(dueDate, now),
      };
    });

    const projectItems: TodayItem[] = projects
      .filter((project) => Boolean(project.dueDate))
      .map((project) => {
        const dueDate = project.dueDate!;
        const bucket = resolveBucket(dueDate, now, tomorrow);
        return {
          id: project.id,
          type: "project",
          title: project.name,
          dueAt: dueDate.toISOString(),
          courseId: project.course?.id ?? project.courseId ?? null,
          courseName: project.course?.name ?? null,
          status: project.status,
          estimatedMinutes: null,
          bucket,
          daysLeft: differenceInCalendarDays(dueDate, now),
        };
      });

    const prioritized = [...assignmentItems, ...examItems, ...milestoneItems, ...projectItems]
      .filter((item) => item.daysLeft >= 0)
      .sort(sortByUrgency);

    const dueToday = prioritized.filter((item) => item.bucket === "today");
    const dueTomorrow = prioritized.filter((item) => item.bucket === "tomorrow");
    const dueThisWeek = prioritized.filter((item) => item.bucket === "week");

    const completedToday = dueTodayAssignments.filter((assignment) => assignment.status === "DONE").length;
    const totalDueToday = dueTodayAssignments.length;

    const todayWorkloadItems = dueToday
      .filter((item) => item.type === "assignment" && (item.estimatedMinutes ?? 0) > 0)
      .map((item) => ({
        id: item.id,
        title: item.title,
        courseName: item.courseName,
        minutes: item.estimatedMinutes ?? 0,
      }))
      .sort((a, b) => b.minutes - a.minutes);
    const todayWorkloadMinutes = todayWorkloadItems.reduce((sum, item) => sum + item.minutes, 0);

    const studyMinutesToday = studyMinutesRows[0]?.totalMinutes ?? 0;
    const examsTomorrow = dueTomorrow.filter((item) => item.type === "exam").length;

    res.json({
      date: dayStart.toISOString().slice(0, 10),
      classSessions: classSessions.map((session) => ({
        id: session.id,
        dayOfWeek: session.dayOfWeek,
        startTime: session.startTime,
        endTime: session.endTime,
        room: session.room,
        modality: session.modality,
        course: session.course,
      })),
      prioritized,
      dueToday,
      dueTomorrow,
      dueThisWeek,
      studyMinutesToday,
      completedToday,
      totalDueToday,
      examsTomorrow,
      todayWorkloadMinutes,
      todayWorkloadItems,
      dateBoundaries: {
        todayStart: dayStart.toISOString(),
        todayEnd: dayEnd.toISOString(),
        tomorrowStart: tomorrowStart.toISOString(),
        tomorrowEnd: tomorrowEnd.toISOString(),
      },
    });
  }),
);

export { router as todayRoutes };
