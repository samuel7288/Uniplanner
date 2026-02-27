import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requestSchema } from "../lib/validate";
import { requireAuth } from "../middleware/auth";
import { validate } from "../middleware/validation";
import {
  ensureGradeCategoriesInfrastructure,
  getGradeCategoryForUser,
} from "../services/gradeCategoriesService";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

const createGradeBodySchema = z.object({
  courseId: z.string().min(1),
  name: z.string().min(2),
  score: z.number().nonnegative(),
  maxScore: z.number().positive(),
  weight: z.number().min(0).max(100).optional(),
  categoryId: z.string().min(1).nullable().optional(),
}).superRefine((data, ctx) => {
  const hasCategory = Boolean(data.categoryId);
  if (!hasCategory && (typeof data.weight !== "number" || data.weight <= 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["weight"],
      message: "weight is required for uncategorized grades",
    });
  }
});

const updateGradeBodySchema = z.object({
  courseId: z.string().min(1).optional(),
  name: z.string().min(2).optional(),
  score: z.number().nonnegative().optional(),
  maxScore: z.number().positive().optional(),
  weight: z.number().min(0).max(100).optional(),
  categoryId: z.string().min(1).nullable().optional(),
});

const listGradesSchema = requestSchema({
  query: z.object({
    courseId: z.string().optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  }),
});

const createGradeSchema = requestSchema({
  body: createGradeBodySchema,
});

const updateGradeSchema = requestSchema({
  body: updateGradeBodySchema,
  params: z.object({ id: z.string().min(1) }),
});

async function readGradeCategoryIdsByIds(ids: string[]): Promise<Map<string, string | null>> {
  await ensureGradeCategoriesInfrastructure();
  if (!ids.length) return new Map();

  const rows = await prisma.$queryRaw<Array<{ id: string; categoryId: string | null }>>(
    Prisma.sql`
      SELECT "id", "categoryId"
      FROM "Grade"
      WHERE "id" IN (${Prisma.join(ids)})
    `,
  );

  return new Map(rows.map((row) => [row.id, row.categoryId ?? null]));
}

async function getGradeCategoryId(gradeId: string): Promise<string | null> {
  await ensureGradeCategoriesInfrastructure();
  const rows = await prisma.$queryRaw<Array<{ categoryId: string | null }>>`
    SELECT "categoryId"
    FROM "Grade"
    WHERE "id" = ${gradeId}
    LIMIT 1
  `;
  return rows[0]?.categoryId ?? null;
}

async function setGradeCategoryId(gradeId: string, categoryId: string | null): Promise<void> {
  await ensureGradeCategoriesInfrastructure();
  await prisma.$executeRaw`
    UPDATE "Grade"
    SET "categoryId" = ${categoryId}
    WHERE "id" = ${gradeId}
  `;
}

async function ensureCategoryMatchesCourse(
  userId: string,
  categoryId: string | null,
  courseId: string,
): Promise<void> {
  if (!categoryId) return;
  const category = await getGradeCategoryForUser(userId, categoryId);
  if (!category || category.courseId !== courseId) {
    throw new Error("Invalid categoryId for selected course");
  }
}

router.use(requireAuth);

router.get(
  "/",
  validate(listGradesSchema),
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
    const categoryByGradeId = await readGradeCategoryIdsByIds(grades.map((grade) => grade.id));

    const totalPages = Math.ceil(total / normalizedLimit);

    res.json({
      items: grades.map((grade) => ({
        ...grade,
        categoryId: categoryByGradeId.get(grade.id) ?? null,
      })),
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
  validate(createGradeSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof createGradeBodySchema>;
    const course = await prisma.course.findFirst({
      where: { id: body.courseId, userId: req.user!.userId },
    });

    if (!course) {
      res.status(400).json({ message: "Invalid courseId" });
      return;
    }

    try {
      await ensureCategoryMatchesCourse(req.user!.userId, body.categoryId ?? null, body.courseId);
    } catch {
      res.status(400).json({ message: "Invalid categoryId for selected course" });
      return;
    }

    const grade = await prisma.grade.create({
      data: {
        courseId: body.courseId,
        name: body.name,
        score: body.score,
        maxScore: body.maxScore,
        weight: body.categoryId ? body.weight ?? 0 : body.weight ?? 0,
        userId: req.user!.userId,
      },
      include: {
        course: true,
      },
    });
    const categoryId = body.categoryId ?? null;
    await setGradeCategoryId(grade.id, categoryId);

    res.status(201).json({
      ...grade,
      categoryId,
    });
  }),
);

router.put(
  "/:id",
  validate(updateGradeSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof updateGradeBodySchema>;
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

    if (body.courseId) {
      const course = await prisma.course.findFirst({
        where: { id: body.courseId, userId: req.user!.userId },
      });
      if (!course) {
        res.status(400).json({ message: "Invalid courseId" });
        return;
      }
    }

    const currentCategoryId = await getGradeCategoryId(current.id);
    const nextCourseId = body.courseId ?? current.courseId;
    const nextCategoryId =
      Object.prototype.hasOwnProperty.call(body, "categoryId")
        ? body.categoryId ?? null
        : currentCategoryId;

    try {
      await ensureCategoryMatchesCourse(req.user!.userId, nextCategoryId, nextCourseId);
    } catch {
      res.status(400).json({ message: "Invalid categoryId for selected course" });
      return;
    }

    if (nextCategoryId === null) {
      const resultingWeight = body.weight ?? current.weight;
      if (resultingWeight <= 0) {
        res.status(400).json({ message: "weight must be greater than 0 for uncategorized grades" });
        return;
      }
    }

    const updateData = {
      courseId: body.courseId,
      name: body.name,
      score: body.score,
      maxScore: body.maxScore,
      weight: body.weight,
    };

    const updated = await prisma.grade.update({
      where: { id: current.id },
      data: updateData,
      include: {
        course: true,
      },
    });
    await setGradeCategoryId(updated.id, nextCategoryId);

    res.json({
      ...updated,
      categoryId: nextCategoryId,
    });
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
