import { Router } from "express";
import { AssignmentPriority, AssignmentStatus, Prisma, RepeatRule } from "@prisma/client";
import { endOfDay, parseISO, startOfDay } from "date-fns";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { validate } from "../middleware/validation";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

const assignmentSchema = z.object({
  title: z.string().min(2),
  courseId: z.string().optional().nullable(),
  dueDate: z.coerce.date(),
  description: z.string().optional().nullable(),
  priority: z.nativeEnum(AssignmentPriority).default(AssignmentPriority.MEDIUM),
  status: z.nativeEnum(AssignmentStatus).default(AssignmentStatus.PENDING),
  repeatRule: z.nativeEnum(RepeatRule).default(RepeatRule.NONE),
  attachmentLinks: z.array(z.string().url()).optional(),
  tags: z.array(z.string().min(1)).optional(),
});

const createSchema = z.object({
  body: assignmentSchema,
  params: z.object({}).passthrough(),
  query: z.object({}).passthrough(),
});

const updateSchema = z.object({
  body: assignmentSchema.partial(),
  params: z.object({ id: z.string().min(1) }),
  query: z.object({}).passthrough(),
});

const listQuerySchema = z.object({
  body: z.object({}).passthrough(),
  params: z.object({}).passthrough(),
  query: z.object({
    status: z.nativeEnum(AssignmentStatus).optional(),
    courseId: z.string().optional(),
    q: z.string().optional(),
    dueFrom: z.string().optional(),
    dueTo: z.string().optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(50).optional(),
    sortBy: z.enum(["dueDate", "createdAt", "priority", "status", "title"]).optional(),
    sortDir: z.enum(["asc", "desc"]).optional(),
  }),
});

async function syncTags(assignmentId: string, userId: string, tagNames: string[] | undefined): Promise<void> {
  if (!tagNames) return;

  const normalized = Array.from(
    new Set(tagNames.map((name) => name.trim().toLowerCase()).filter((name) => name.length > 0)),
  );

  await prisma.assignmentTag.deleteMany({
    where: {
      assignmentId,
    },
  });

  for (const tagName of normalized) {
    const tag = await prisma.tag.upsert({
      where: {
        userId_name: {
          userId,
          name: tagName,
        },
      },
      create: {
        userId,
        name: tagName,
      },
      update: {},
    });

    await prisma.assignmentTag.create({
      data: {
        assignmentId,
        tagId: tag.id,
      },
    });
  }
}

function mapAssignment<T extends { assignmentTags: Array<{ tag: { name: string } }> }>(assignment: T) {
  return {
    ...assignment,
    tags: assignment.assignmentTags.map((entry) => entry.tag.name),
  };
}

router.use(requireAuth);

router.get(
  "/focus/today",
  asyncHandler(async (req, res) => {
    const now = new Date();
    const tasks = await prisma.assignment.findMany({
      where: {
        userId: req.user!.userId,
        dueDate: {
          gte: startOfDay(now),
          lte: endOfDay(now),
        },
        status: {
          not: AssignmentStatus.DONE,
        },
      },
      include: {
        course: true,
      },
      orderBy: {
        dueDate: "asc",
      },
    });

    res.json({ tasks });
  }),
);

router.get(
  "/",
  validate(listQuerySchema),
  asyncHandler(async (req, res) => {
    const { status, courseId, q, dueFrom, dueTo, page, limit, sortBy, sortDir } = req.query as {
      status?: AssignmentStatus;
      courseId?: string;
      q?: string;
      dueFrom?: string;
      dueTo?: string;
      page?: number;
      limit?: number;
      sortBy?: "dueDate" | "createdAt" | "priority" | "status" | "title";
      sortDir?: "asc" | "desc";
    };

    const normalizedPage = page ?? 1;
    const normalizedLimit = limit ?? 10;
    const normalizedSortBy = sortBy ?? "dueDate";
    const normalizedSortDir = sortDir ?? "asc";

    const where: Prisma.AssignmentWhereInput = {
      userId: req.user!.userId,
      status,
      courseId,
      title: q
        ? {
            contains: q,
            mode: "insensitive",
          }
        : undefined,
      dueDate:
        dueFrom || dueTo
          ? {
              gte: dueFrom ? parseISO(dueFrom) : undefined,
              lte: dueTo ? parseISO(dueTo) : undefined,
            }
          : undefined,
    };

    const [total, assignments] = await prisma.$transaction([
      prisma.assignment.count({ where }),
      prisma.assignment.findMany({
        where,
        include: {
          course: true,
          assignmentTags: {
            include: {
              tag: true,
            },
          },
        },
        orderBy: {
          [normalizedSortBy]: normalizedSortDir,
        } as Prisma.AssignmentOrderByWithRelationInput,
        skip: (normalizedPage - 1) * normalizedLimit,
        take: normalizedLimit,
      }),
    ]);

    const totalPages = Math.ceil(total / normalizedLimit);

    res.json({
      items: assignments.map(mapAssignment),
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
  validate(createSchema),
  asyncHandler(async (req, res) => {
    const { tags, attachmentLinks, ...payload } = req.body;

    if (payload.courseId) {
      const course = await prisma.course.findFirst({
        where: {
          id: payload.courseId,
          userId: req.user!.userId,
        },
      });

      if (!course) {
        res.status(400).json({ message: "Invalid courseId" });
        return;
      }
    }

    const assignment = await prisma.assignment.create({
      data: {
        ...payload,
        userId: req.user!.userId,
        attachmentLinks: attachmentLinks ?? [],
      },
      include: {
        course: true,
        assignmentTags: {
          include: {
            tag: true,
          },
        },
      },
    });

    await syncTags(assignment.id, req.user!.userId, tags);

    const hydrated = await prisma.assignment.findUniqueOrThrow({
      where: { id: assignment.id },
      include: {
        course: true,
        assignmentTags: {
          include: {
            tag: true,
          },
        },
      },
    });

    res.status(201).json(mapAssignment(hydrated));
  }),
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const assignment = await prisma.assignment.findFirst({
      where: {
        id: req.params.id,
        userId: req.user!.userId,
      },
      include: {
        course: true,
        assignmentTags: {
          include: {
            tag: true,
          },
        },
      },
    });

    if (!assignment) {
      res.status(404).json({ message: "Assignment not found" });
      return;
    }

    res.json(mapAssignment(assignment));
  }),
);

router.put(
  "/:id",
  validate(updateSchema),
  asyncHandler(async (req, res) => {
    const { tags, ...payload } = req.body;

    const current = await prisma.assignment.findFirst({
      where: {
        id: req.params.id,
        userId: req.user!.userId,
      },
    });

    if (!current) {
      res.status(404).json({ message: "Assignment not found" });
      return;
    }

    if (payload.courseId) {
      const course = await prisma.course.findFirst({
        where: {
          id: payload.courseId,
          userId: req.user!.userId,
        },
      });

      if (!course) {
        res.status(400).json({ message: "Invalid courseId" });
        return;
      }
    }

    const updated = await prisma.assignment.update({
      where: {
        id: current.id,
      },
      data: payload,
      include: {
        course: true,
        assignmentTags: {
          include: {
            tag: true,
          },
        },
      },
    });

    await syncTags(updated.id, req.user!.userId, tags);

    const hydrated = await prisma.assignment.findUniqueOrThrow({
      where: { id: updated.id },
      include: {
        course: true,
        assignmentTags: {
          include: {
            tag: true,
          },
        },
      },
    });

    res.json(mapAssignment(hydrated));
  }),
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const current = await prisma.assignment.findFirst({
      where: {
        id: req.params.id,
        userId: req.user!.userId,
      },
    });

    if (!current) {
      res.status(404).json({ message: "Assignment not found" });
      return;
    }

    await prisma.assignment.delete({
      where: {
        id: current.id,
      },
    });

    res.status(204).send();
  }),
);

export { router as assignmentsRoutes };

