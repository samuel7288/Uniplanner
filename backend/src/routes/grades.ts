import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { validate } from "../middleware/validation";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

const gradeSchema = z.object({
  courseId: z.string().min(1),
  name: z.string().min(2),
  score: z.number().nonnegative(),
  maxScore: z.number().positive(),
  weight: z.number().positive().max(100),
});

router.use(requireAuth);

router.get(
  "/",
  validate(
    z.object({
      body: z.object({}).passthrough(),
      params: z.object({}).passthrough(),
      query: z.object({
        courseId: z.string().optional(),
        page: z.coerce.number().int().min(1).optional(),
        limit: z.coerce.number().int().min(1).max(100).optional(),
      }),
    }),
  ),
  asyncHandler(async (req, res) => {
    const { courseId, page, limit } = req.query as {
      courseId?: string;
      page?: number;
      limit?: number;
    };
    const normalizedPage = page ?? 1;
    const normalizedLimit = limit ?? 50;
    const where = {
      userId: req.user!.userId,
      courseId,
    };

    const [total, grades] = await prisma.$transaction([
      prisma.grade.count({ where }),
      prisma.grade.findMany({
        where,
        include: {
          course: true,
        },
        orderBy: {
          createdAt: "desc",
        },
        skip: (normalizedPage - 1) * normalizedLimit,
        take: normalizedLimit,
      }),
    ]);

    const totalPages = Math.ceil(total / normalizedLimit);

    res.json({
      items: grades,
      pagination: {
        page: normalizedPage,
        limit: normalizedLimit,
        total,
        totalPages,
        hasNext: normalizedPage < totalPages,
        hasPrev: normalizedPage > 1,
      },
    });
  }),
);

router.post(
  "/",
  validate(
    z.object({
      body: gradeSchema,
      params: z.object({}).passthrough(),
      query: z.object({}).passthrough(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const course = await prisma.course.findFirst({
      where: { id: req.body.courseId, userId: req.user!.userId },
    });

    if (!course) {
      res.status(400).json({ message: "Invalid courseId" });
      return;
    }

    const grade = await prisma.grade.create({
      data: {
        ...req.body,
        userId: req.user!.userId,
      },
      include: {
        course: true,
      },
    });

    res.status(201).json(grade);
  }),
);

router.put(
  "/:id",
  validate(
    z.object({
      body: gradeSchema.partial(),
      params: z.object({ id: z.string().min(1) }),
      query: z.object({}).passthrough(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const current = await prisma.grade.findFirst({
      where: {
        id: req.params.id,
        userId: req.user!.userId,
      },
    });

    if (!current) {
      res.status(404).json({ message: "Grade not found" });
      return;
    }

    if (req.body.courseId) {
      const course = await prisma.course.findFirst({
        where: { id: req.body.courseId, userId: req.user!.userId },
      });
      if (!course) {
        res.status(400).json({ message: "Invalid courseId" });
        return;
      }
    }

    const updated = await prisma.grade.update({
      where: { id: current.id },
      data: req.body,
      include: {
        course: true,
      },
    });

    res.json(updated);
  }),
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const current = await prisma.grade.findFirst({
      where: {
        id: req.params.id,
        userId: req.user!.userId,
      },
    });

    if (!current) {
      res.status(404).json({ message: "Grade not found" });
      return;
    }

    await prisma.grade.delete({ where: { id: current.id } });
    res.status(204).send();
  }),
);

export { router as gradesRoutes };
