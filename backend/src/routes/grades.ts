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
      }),
    }),
  ),
  asyncHandler(async (req, res) => {
    const { courseId } = req.query as { courseId?: string };
    const grades = await prisma.grade.findMany({
      where: {
        userId: req.user!.userId,
        courseId,
      },
      include: {
        course: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    res.json(grades);
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
