import { Prisma, ProjectStatus, ProjectTaskStatus } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { validate } from "../middleware/validation";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

const projectSchema = z.object({
  courseId: z.string().optional().nullable(),
  name: z.string().min(2).max(255),
  description: z.string().max(5000).optional().nullable(),
  startDate: z.coerce.date().optional().nullable(),
  dueDate: z.coerce.date().optional().nullable(),
  status: z.nativeEnum(ProjectStatus).default(ProjectStatus.TODO),
});

const milestoneSchema = z.object({
  title: z.string().min(2).max(255),
  description: z.string().max(5000).optional().nullable(),
  dueDate: z.coerce.date().optional().nullable(),
  completed: z.boolean().optional(),
});

const taskSchema = z.object({
  title: z.string().min(2).max(255),
  description: z.string().max(5000).optional().nullable(),
  dueDate: z.coerce.date().optional().nullable(),
  status: z.nativeEnum(ProjectTaskStatus).optional(),
});

router.use(requireAuth);

const listProjectsSchema = z.object({
  body: z.object({}).passthrough(),
  params: z.object({}).passthrough(),
  query: z.object({
    q: z.string().max(255).optional(),
    courseId: z.string().optional(),
    status: z.nativeEnum(ProjectStatus).optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(50).optional(),
    sortBy: z.enum(["createdAt", "dueDate", "name", "status"]).optional(),
    sortDir: z.enum(["asc", "desc"]).optional(),
  }),
});

router.get(
  "/",
  validate(listProjectsSchema),
  asyncHandler(async (req, res) => {
    const { q, courseId, status, page, limit, sortBy, sortDir } = req.query as {
      q?: string;
      courseId?: string;
      status?: ProjectStatus;
      page?: number;
      limit?: number;
      sortBy?: "createdAt" | "dueDate" | "name" | "status";
      sortDir?: "asc" | "desc";
    };

    const normalizedPage = page ?? 1;
    const normalizedLimit = limit ?? 10;
    const normalizedSortBy = sortBy ?? "createdAt";
    const normalizedSortDir = sortDir ?? "desc";

    const where: Prisma.ProjectWhereInput = {
      userId: req.user!.userId,
      courseId,
      status,
      name: q
        ? {
            contains: q,
            mode: "insensitive",
          }
        : undefined,
    };

    const [total, projects] = await prisma.$transaction([
      prisma.project.count({ where }),
      prisma.project.findMany({
        where,
        include: {
          course: true,
          milestones: true,
          tasks: true,
        },
        orderBy: {
          [normalizedSortBy]: normalizedSortDir,
        } as Prisma.ProjectOrderByWithRelationInput,
        skip: (normalizedPage - 1) * normalizedLimit,
        take: normalizedLimit,
      }),
    ]);

    const totalPages = Math.ceil(total / normalizedLimit);

    res.json({
      items: projects,
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
  validate(
    z.object({
      body: projectSchema,
      params: z.object({}).passthrough(),
      query: z.object({}).passthrough(),
    }),
  ),
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

    const project = await prisma.project.create({
      data: {
        ...payload,
        userId: req.user!.userId,
      },
      include: {
        course: true,
        milestones: true,
        tasks: true,
      },
    });

    res.status(201).json(project);
  }),
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const project = await prisma.project.findFirst({
      where: {
        id: req.params.id,
        userId: req.user!.userId,
      },
      include: {
        course: true,
        milestones: true,
        tasks: true,
      },
    });

    if (!project) {
      res.status(404).json({ message: "Project not found" });
      return;
    }

    res.json(project);
  }),
);

router.put(
  "/:id",
  validate(
    z.object({
      body: projectSchema.partial(),
      params: z.object({ id: z.string().min(1) }),
      query: z.object({}).passthrough(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const current = await prisma.project.findFirst({
      where: {
        id: req.params.id,
        userId: req.user!.userId,
      },
    });

    if (!current) {
      res.status(404).json({ message: "Project not found" });
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

    const updated = await prisma.project.update({
      where: { id: current.id },
      data: req.body,
      include: {
        course: true,
        milestones: true,
        tasks: true,
      },
    });

    res.json(updated);
  }),
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const current = await prisma.project.findFirst({
      where: {
        id: req.params.id,
        userId: req.user!.userId,
      },
    });

    if (!current) {
      res.status(404).json({ message: "Project not found" });
      return;
    }

    await prisma.project.delete({ where: { id: current.id } });
    res.status(204).send();
  }),
);

router.post(
  "/:id/milestones",
  validate(
    z.object({
      body: milestoneSchema,
      params: z.object({ id: z.string().min(1) }),
      query: z.object({}).passthrough(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const project = await prisma.project.findFirst({
      where: {
        id: req.params.id,
        userId: req.user!.userId,
      },
    });

    if (!project) {
      res.status(404).json({ message: "Project not found" });
      return;
    }

    const milestone = await prisma.milestone.create({
      data: {
        ...req.body,
        projectId: project.id,
      },
    });

    res.status(201).json(milestone);
  }),
);

router.patch(
  "/milestones/:milestoneId",
  validate(
    z.object({
      body: milestoneSchema.partial(),
      params: z.object({ milestoneId: z.string().min(1) }),
      query: z.object({}).passthrough(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const milestone = await prisma.milestone.findUnique({
      where: { id: req.params.milestoneId },
      include: {
        project: true,
      },
    });

    if (!milestone || milestone.project.userId !== req.user!.userId) {
      res.status(404).json({ message: "Milestone not found" });
      return;
    }

    const updated = await prisma.milestone.update({
      where: { id: milestone.id },
      data: req.body,
    });

    res.json(updated);
  }),
);

router.delete(
  "/milestones/:milestoneId",
  asyncHandler(async (req, res) => {
    const milestone = await prisma.milestone.findUnique({
      where: { id: req.params.milestoneId },
      include: {
        project: true,
      },
    });

    if (!milestone || milestone.project.userId !== req.user!.userId) {
      res.status(404).json({ message: "Milestone not found" });
      return;
    }

    await prisma.milestone.delete({ where: { id: milestone.id } });
    res.status(204).send();
  }),
);

router.post(
  "/:id/tasks",
  validate(
    z.object({
      body: taskSchema,
      params: z.object({ id: z.string().min(1) }),
      query: z.object({}).passthrough(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const project = await prisma.project.findFirst({
      where: {
        id: req.params.id,
        userId: req.user!.userId,
      },
    });

    if (!project) {
      res.status(404).json({ message: "Project not found" });
      return;
    }

    const task = await prisma.projectTask.create({
      data: {
        ...req.body,
        status: req.body.status ?? ProjectTaskStatus.TODO,
        projectId: project.id,
      },
    });

    res.status(201).json(task);
  }),
);

router.patch(
  "/tasks/:taskId",
  validate(
    z.object({
      body: taskSchema.partial(),
      params: z.object({ taskId: z.string().min(1) }),
      query: z.object({}).passthrough(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const task = await prisma.projectTask.findUnique({
      where: { id: req.params.taskId },
      include: {
        project: true,
      },
    });

    if (!task || task.project.userId !== req.user!.userId) {
      res.status(404).json({ message: "Task not found" });
      return;
    }

    const updated = await prisma.projectTask.update({
      where: { id: task.id },
      data: req.body,
    });

    res.json(updated);
  }),
);

router.delete(
  "/tasks/:taskId",
  asyncHandler(async (req, res) => {
    const task = await prisma.projectTask.findUnique({
      where: { id: req.params.taskId },
      include: {
        project: true,
      },
    });

    if (!task || task.project.userId !== req.user!.userId) {
      res.status(404).json({ message: "Task not found" });
      return;
    }

    await prisma.projectTask.delete({ where: { id: task.id } });
    res.status(204).send();
  }),
);

export { router as projectsRoutes };
