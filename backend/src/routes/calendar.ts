import { addHours } from "date-fns";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { validate } from "../middleware/validation";
import { asyncHandler } from "../utils/asyncHandler";
import { buildICS, mapClassSessionsToEvents, toCalendarEvent } from "../utils/calendar";

const router = Router();

const calendarQuerySchema = z.object({
  body: z.object({}).passthrough(),
  params: z.object({}).passthrough(),
  query: z.object({
    courseId: z.string().optional(),
    types: z.string().optional(),
    weeks: z.coerce.number().int().min(1).max(24).optional(),
  }),
});

function parseTypes(input?: string): Set<string> {
  if (!input) {
    return new Set(["class", "assignment", "exam", "milestone"]);
  }
  return new Set(
    input
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
  );
}

router.use(requireAuth);

async function buildCalendarItems(
  userId: string,
  types: Set<string>,
  courseId?: string,
  weeks = 12,
): Promise<
  Array<{
    id: string;
    title: string;
    start: Date;
    end?: Date;
    type: "class" | "assignment" | "exam" | "milestone";
    color?: string | null;
    description?: string | null;
    location?: string | null;
  }>
> {
  const events: Array<{
    id: string;
    title: string;
    start: Date;
    end?: Date;
    type: "class" | "assignment" | "exam" | "milestone";
    color?: string | null;
    description?: string | null;
    location?: string | null;
  }> = [];

  if (types.has("class")) {
    const courses = await prisma.course.findMany({
      where: {
        userId,
        id: courseId,
      },
      include: {
        classSessions: true,
      },
    });

    const classEvents = mapClassSessionsToEvents(
      courses.flatMap((course) =>
        course.classSessions.map((session) => ({
          id: session.id,
          courseName: course.name,
          dayOfWeek: session.dayOfWeek,
          startTime: session.startTime,
          endTime: session.endTime,
          room: session.room,
          modality: session.modality,
          color: course.color,
        })),
      ),
      weeks,
    );

    events.push(...classEvents);
  }

  if (types.has("assignment")) {
    const assignments = await prisma.assignment.findMany({
      where: {
        userId,
        courseId,
      },
      include: {
        course: true,
      },
    });

    events.push(
      ...assignments.map((item) => ({
        id: `assignment-${item.id}`,
        title: `Entrega: ${item.title}`,
        start: item.dueDate,
        end: addHours(item.dueDate, 1),
        type: "assignment" as const,
        color: item.course?.color,
        description: item.description ?? undefined,
      })),
    );
  }

  if (types.has("exam")) {
    const exams = await prisma.exam.findMany({
      where: {
        userId,
        courseId,
      },
      include: {
        course: true,
      },
    });

    events.push(
      ...exams.map((item) => ({
        id: `exam-${item.id}`,
        title: `Examen: ${item.title}`,
        start: item.dateTime,
        end: addHours(item.dateTime, 2),
        type: "exam" as const,
        color: item.course?.color,
        description: item.syllabus ?? undefined,
        location: item.location ?? undefined,
      })),
    );
  }

  if (types.has("milestone")) {
    const milestones = await prisma.milestone.findMany({
      where: {
        dueDate: {
          not: null,
        },
        project: {
          userId,
          courseId,
        },
      },
      include: {
        project: true,
      },
    });

    events.push(
      ...milestones
        .filter((item) => Boolean(item.dueDate))
        .map((item) => ({
          id: `milestone-${item.id}`,
          title: `Milestone: ${item.title}`,
          start: item.dueDate!,
          end: addHours(item.dueDate!, 1),
          type: "milestone" as const,
          description: item.description ?? `Proyecto: ${item.project.name}`,
        })),
    );
  }

  return events.sort((a, b) => a.start.getTime() - b.start.getTime());
}

router.get(
  "/events",
  validate(calendarQuerySchema),
  asyncHandler(async (req, res) => {
    const query = req.query as { types?: string; courseId?: string; weeks?: number };
    const types = parseTypes(query.types);
    const events = await buildCalendarItems(
      req.user!.userId,
      types,
      query.courseId,
      query.weeks ?? 12,
    );

    res.json({
      events: events.map(toCalendarEvent),
    });
  }),
);

router.get(
  "/ics",
  validate(calendarQuerySchema),
  asyncHandler(async (req, res) => {
    const query = req.query as { types?: string; courseId?: string; weeks?: number };
    const types = parseTypes(query.types);
    const events = await buildCalendarItems(
      req.user!.userId,
      types,
      query.courseId,
      query.weeks ?? 12,
    );

    const ics = buildICS(events);

    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="uniplanner.ics"');
    res.send(ics);
  }),
);

export { router as calendarRoutes };

