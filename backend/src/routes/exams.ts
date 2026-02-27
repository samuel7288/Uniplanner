import { ExamType, Prisma } from "@prisma/client";
import { Router } from "express";
import { parseISO } from "date-fns";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requestSchema } from "../lib/validate";
import { requireAuth } from "../middleware/auth";
import { validate } from "../middleware/validation";
import {
  getExamRetroContext,
  readExamRetrospectivesByIds,
  saveExamRetrospective,
} from "../services/examRetrospectiveService";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

const examSchema = z.object({
  courseId: z.string().optional().nullable(),
  title: z.string().min(2).max(255),
  dateTime: z.coerce.date(),
  type: z.nativeEnum(ExamType).default(ExamType.OTHER),
  location: z.string().max(255).optional().nullable(),
  syllabus: z.string().max(5000).optional().nullable(),
  weight: z.number().min(0).max(100).optional().nullable(),
  reminderOffsets: z.array(z.number().int().positive()).optional(),
});

const listExamsSchema = requestSchema({
  query: z.object({
    courseId: z.string().optional(),
    q: z.string().max(255).optional(),
    from: z.string().optional(),
    to: z.string().optional(),
    type: z.nativeEnum(ExamType).optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(50).optional(),
    sortBy: z.enum(["dateTime", "createdAt", "type", "title"]).optional(),
    sortDir: z.enum(["asc", "desc"]).optional(),
  }),
});

const createExamSchema = requestSchema({
  body: examSchema,
});

const updateExamSchema = requestSchema({
  body: examSchema.partial(),
  params: z.object({ id: z.string().min(1) }),
});

const retroExamSchema = requestSchema({
  body: z.object({
    obtainedGrade: z.number().min(0).max(10).optional().nullable(),
    studyHoursLogged: z.number().min(0).max(200).optional().nullable(),
    feelingScore: z.number().int().min(1).max(4).optional().nullable(),
    retroNotes: z.string().max(2000).optional().nullable(),
    skip: z.boolean().optional(),
  }),
  params: z.object({ id: z.string().min(1) }),
});

type RetroPayload = z.infer<typeof retroExamSchema>["body"];

function emptyRetro() {
  return {
    obtainedGrade: null,
    studyHoursLogged: null,
    feelingScore: null,
    retroNotes: null,
    retroCompletedAt: null,
    retroDismissed: false,
    retroDismissedAt: null,
  };
}

async function attachRetroData<T extends { id: string }>(items: T[]) {
  const retroById = await readExamRetrospectivesByIds(items.map((item) => item.id));
  return items.map((item) => ({
    ...item,
    ...(retroById.get(item.id) ?? emptyRetro()),
  }));
}

router.use(requireAuth);

router.get(
  "/",
  validate(listExamsSchema),
  asyncHandler(async (req, res) => {
    const { courseId, q, from, to, type, page, limit, sortBy, sortDir } = req.query as {
      courseId?: string;
      q?: string;
      from?: string;
      to?: string;
      type?: ExamType;
      page?: number;
      limit?: number;
      sortBy?: "dateTime" | "createdAt" | "type" | "title";
      sortDir?: "asc" | "desc";
    };

    const normalizedPage = page ?? 1;
    const normalizedLimit = limit ?? 10;
    const normalizedSortBy = sortBy ?? "dateTime";
    const normalizedSortDir = sortDir ?? "asc";

    const where: Prisma.ExamWhereInput = {
      userId: req.user!.userId,
      courseId,
      type,
      title: q
        ? {
            contains: q,
            mode: "insensitive",
          }
        : undefined,
      dateTime:
        from || to
          ? {
              gte: from ? parseISO(from) : undefined,
              lte: to ? parseISO(to) : undefined,
            }
          : undefined,
    };

    const [total, exams] = await prisma.$transaction([
      prisma.exam.count({ where }),
      prisma.exam.findMany({
        where,
        include: {
          course: true,
        },
        orderBy: {
          [normalizedSortBy]: normalizedSortDir,
        } as Prisma.ExamOrderByWithRelationInput,
        skip: (normalizedPage - 1) * normalizedLimit,
        take: normalizedLimit,
      }),
    ]);

    const examsWithRetro = await attachRetroData(exams);
    const totalPages = Math.ceil(total / normalizedLimit);

    res.json({
      items: examsWithRetro,
      pagination: {
        page: normalizedPage,
        limit: normalizedLimit,
        total,
        totalPages,
        hasNext: normalizedPage < totalPages,
        hasPrev: normalizedPage > 1,
      },
      sort: {
        sortBy: normalizedSortBy,
        sortDir: normalizedSortDir,
      },
    });
  }),
);

router.post(
  "/",
  validate(createExamSchema),
  asyncHandler(async (req, res) => {
    const payload = req.body;

    if (payload.courseId) {
      const course = await prisma.course.findFirst({
        where: { id: payload.courseId, userId: req.user!.userId },
      });
      if (!course) {
        res.status(400).json({ message: "Invalid courseId" });
        return;
      }
    }

    const exam = await prisma.exam.create({
      data: {
        ...payload,
        reminderOffsets: payload.reminderOffsets ?? [10080, 4320, 1440, 360, 60],
        userId: req.user!.userId,
      },
      include: {
        course: true,
      },
    });

    const [examWithRetro] = await attachRetroData([exam]);
    res.status(201).json(examWithRetro);
  }),
);

router.get(
  "/:id/retro-context",
  asyncHandler(async (req, res) => {
    const context = await getExamRetroContext(req.user!.userId, req.params.id);
    res.json(context);
  }),
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const context = await getExamRetroContext(req.user!.userId, req.params.id);
    res.json(context);
  }),
);

router.put(
  "/:id",
  validate(updateExamSchema),
  asyncHandler(async (req, res) => {
    const current = await prisma.exam.findFirst({
      where: {
        id: req.params.id,
        userId: req.user!.userId,
      },
    });

    if (!current) {
      res.status(404).json({ message: "Exam not found" });
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

    const updated = await prisma.exam.update({
      where: { id: current.id },
      data: req.body,
      include: { course: true },
    });

    const [updatedWithRetro] = await attachRetroData([updated]);
    res.json(updatedWithRetro);
  }),
);

router.patch(
  "/:id/retro",
  validate(retroExamSchema),
  asyncHandler(async (req, res) => {
    const payload = req.body as RetroPayload;
    const saved = await saveExamRetrospective(req.user!.userId, req.params.id, payload);
    res.json(saved);
  }),
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const current = await prisma.exam.findFirst({
      where: {
        id: req.params.id,
        userId: req.user!.userId,
      },
    });

    if (!current) {
      res.status(404).json({ message: "Exam not found" });
      return;
    }

    await prisma.exam.delete({ where: { id: current.id } });
    res.status(204).send();
  }),
);

export { router as examsRoutes };

