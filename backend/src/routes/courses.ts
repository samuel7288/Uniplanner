import { Router } from "express";
import { z } from "zod";
import { SessionModality } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { validate } from "../middleware/validation";
import { calculateCourseProjection } from "../utils/grading";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

const baseClassSessionSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  room: z.string().max(255).optional().nullable(),
  modality: z.nativeEnum(SessionModality).default(SessionModality.PRESENTIAL),
});

const classSessionSchema = baseClassSessionSchema.refine((data) => data.startTime < data.endTime, {
  path: ["endTime"],
  message: "endTime must be later than startTime",
});

const partialClassSessionSchema = baseClassSessionSchema.partial().refine((data) => {
  if (!data.startTime || !data.endTime) return true;
  return data.startTime < data.endTime;
}, {
  path: ["endTime"],
  message: "endTime must be later than startTime",
});

const createCourseSchema = z.object({
  body: z.object({
    name: z.string().min(2).max(255),
    code: z.string().min(2).max(100),
    teacher: z.string().max(255).optional().nullable(),
    credits: z.number().int().min(0).optional().nullable(),
    color: z.string().max(32).optional().nullable(),
    semester: z.string().max(100).optional().nullable(),
    classSessions: z.array(classSessionSchema).optional(),
  }),
  query: z.object({}).passthrough(),
  params: z.object({}).passthrough(),
});

const updateCourseSchema = z.object({
  body: z.object({
    name: z.string().min(2).max(255).optional(),
    code: z.string().min(2).max(100).optional(),
    teacher: z.string().max(255).optional().nullable(),
    credits: z.number().int().min(0).optional().nullable(),
    color: z.string().max(32).optional().nullable(),
    semester: z.string().max(100).optional().nullable(),
  }),
  query: z.object({}).passthrough(),
  params: z.object({
    id: z.string().min(1),
  }),
});

const gradeProjectionSchema = z.object({
  body: z.object({}).passthrough(),
  params: z.object({ id: z.string().min(1) }),
  query: z.object({
    target: z.coerce.number().min(0).max(10).default(7),
  }),
});

const addSessionSchema = z.object({
  body: classSessionSchema,
  query: z.object({}).passthrough(),
  params: z.object({
    id: z.string().min(1),
  }),
});

const updateSessionSchema = z.object({
  body: partialClassSessionSchema,
  query: z.object({}).passthrough(),
  params: z.object({
    sessionId: z.string().min(1),
  }),
});

router.use(requireAuth);

router.get(
  "/schedule/weekly",
  asyncHandler(async (req, res) => {
    const courses = await prisma.course.findMany({
      where: { userId: req.user!.userId },
      include: { classSessions: true },
      orderBy: { name: "asc" },
    });

    const schedule = courses.flatMap((course) =>
      course.classSessions.map((session) => ({
        id: session.id,
        courseId: course.id,
        courseName: course.name,
        code: course.code,
        color: course.color,
        dayOfWeek: session.dayOfWeek,
        startTime: session.startTime,
        endTime: session.endTime,
        room: session.room,
        modality: session.modality,
      })),
    );

    res.json({ schedule });
  }),
);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const courses = await prisma.course.findMany({
      where: { userId: req.user!.userId },
      include: {
        classSessions: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    res.json(courses);
  }),
);

router.post(
  "/",
  validate(createCourseSchema),
  asyncHandler(async (req, res) => {
    const { classSessions, ...courseData } = req.body;

    const course = await prisma.course.create({
      data: {
        ...courseData,
        userId: req.user!.userId,
        classSessions:
          classSessions && classSessions.length > 0
            ? {
                create: classSessions,
              }
            : undefined,
      },
      include: {
        classSessions: true,
      },
    });

    res.status(201).json(course);
  }),
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const course = await prisma.course.findFirst({
      where: {
        id: req.params.id,
        userId: req.user!.userId,
      },
      include: {
        classSessions: true,
        assignments: true,
        exams: true,
        grades: true,
        projects: true,
      },
    });

    if (!course) {
      res.status(404).json({ message: "Course not found" });
      return;
    }

    res.json(course);
  }),
);

router.put(
  "/:id",
  validate(updateCourseSchema),
  asyncHandler(async (req, res) => {
    const course = await prisma.course.findFirst({
      where: {
        id: req.params.id,
        userId: req.user!.userId,
      },
    });

    if (!course) {
      res.status(404).json({ message: "Course not found" });
      return;
    }

    const updated = await prisma.course.update({
      where: { id: course.id },
      data: req.body,
      include: {
        classSessions: true,
      },
    });

    res.json(updated);
  }),
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const course = await prisma.course.findFirst({
      where: {
        id: req.params.id,
        userId: req.user!.userId,
      },
    });

    if (!course) {
      res.status(404).json({ message: "Course not found" });
      return;
    }

    await prisma.course.delete({ where: { id: course.id } });
    res.status(204).send();
  }),
);

router.post(
  "/:id/class-sessions",
  validate(addSessionSchema),
  asyncHandler(async (req, res) => {
    const course = await prisma.course.findFirst({
      where: {
        id: req.params.id,
        userId: req.user!.userId,
      },
    });

    if (!course) {
      res.status(404).json({ message: "Course not found" });
      return;
    }

    const session = await prisma.classSession.create({
      data: {
        ...req.body,
        courseId: course.id,
      },
    });

    res.status(201).json(session);
  }),
);

router.put(
  "/class-sessions/:sessionId",
  validate(updateSessionSchema),
  asyncHandler(async (req, res) => {
    const session = await prisma.classSession.findUnique({
      where: { id: req.params.sessionId },
      include: {
        course: true,
      },
    });

    if (!session || session.course.userId !== req.user!.userId) {
      res.status(404).json({ message: "Class session not found" });
      return;
    }

    const updated = await prisma.classSession.update({
      where: { id: session.id },
      data: req.body,
    });

    res.json(updated);
  }),
);

router.delete(
  "/class-sessions/:sessionId",
  asyncHandler(async (req, res) => {
    const session = await prisma.classSession.findUnique({
      where: { id: req.params.sessionId },
      include: { course: true },
    });

    if (!session || session.course.userId !== req.user!.userId) {
      res.status(404).json({ message: "Class session not found" });
      return;
    }

    await prisma.classSession.delete({ where: { id: session.id } });
    res.status(204).send();
  }),
);

router.get(
  "/:id/grade-projection",
  validate(gradeProjectionSchema),
  asyncHandler(async (req, res) => {
    const { target } = req.query as unknown as { target: number };

    const course = await prisma.course.findFirst({
      where: {
        id: req.params.id,
        userId: req.user!.userId,
      },
      include: {
        grades: true,
      },
    });

    if (!course) {
      res.status(404).json({ message: "Course not found" });
      return;
    }

    const projection = calculateCourseProjection(
      course.grades.map((grade) => ({
        score: grade.score,
        maxScore: grade.maxScore,
        weight: grade.weight,
      })),
      target,
    );

    res.json({
      courseId: course.id,
      courseName: course.name,
      target,
      ...projection,
    });
  }),
);

export { router as coursesRoutes };

