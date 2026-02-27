import { Prisma, ProjectTaskStatus } from "@prisma/client";
import { prisma } from "../lib/prisma";
import type {
  CreateMilestoneBody,
  CreateProjectBody,
  CreateTaskBody,
  ListProjectsQuery,
  UpdateMilestoneBody,
  UpdateProjectBody,
  UpdateTaskBody,
} from "../validators/projectsValidators";

type HttpError = Error & { status?: number };

function createHttpError(status: number, message: string): HttpError {
  const error = new Error(message) as HttpError;
  error.status = status;
  return error;
}

function hasInvalidDateRange(startDate?: Date | null, dueDate?: Date | null): boolean {
  return Boolean(startDate && dueDate && startDate > dueDate);
}

async function ensureCourseBelongsToUser(courseId: string, userId: string): Promise<void> {
  const course = await prisma.course.findFirst({
    where: { id: courseId, userId },
  });
  if (!course) throw createHttpError(400, "Invalid courseId");
}

export async function listProjectsForUser(userId: string, query: ListProjectsQuery) {
  const { q, courseId, status, page, limit, sortBy, sortDir } = query;

  const normalizedPage = page ?? 1;
  const normalizedLimit = limit ?? 10;
  const normalizedSortBy = sortBy ?? "createdAt";
  const normalizedSortDir = sortDir ?? "desc";

  const where: Prisma.ProjectWhereInput = {
    userId,
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
        _count: {
          select: {
            milestones: true,
            tasks: true,
          },
        },
        milestones: {
          orderBy: { dueDate: "asc" },
          take: 5,
        },
        tasks: {
          orderBy: { createdAt: "desc" },
          take: 30,
        },
      },
      orderBy: {
        [normalizedSortBy]: normalizedSortDir,
      } as Prisma.ProjectOrderByWithRelationInput,
      skip: (normalizedPage - 1) * normalizedLimit,
      take: normalizedLimit,
    }),
  ]);

  const totalPages = Math.ceil(total / normalizedLimit);

  return {
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
  };
}

export async function createProject(userId: string, payload: CreateProjectBody) {
  if (hasInvalidDateRange(payload.startDate, payload.dueDate)) {
    throw createHttpError(400, "startDate must be before or equal to dueDate");
  }

  if (payload.courseId) await ensureCourseBelongsToUser(payload.courseId, userId);

  return prisma.project.create({
    data: {
      ...payload,
      userId,
    },
    include: {
      course: true,
      milestones: true,
      tasks: true,
    },
  });
}

export async function getProjectById(userId: string, projectId: string) {
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      userId,
    },
    include: {
      course: true,
      milestones: true,
      tasks: true,
    },
  });

  if (!project) throw createHttpError(404, "Project not found");
  return project;
}

export async function updateProject(userId: string, projectId: string, payload: UpdateProjectBody) {
  const current = await prisma.project.findFirst({
    where: {
      id: projectId,
      userId,
    },
  });

  if (!current) throw createHttpError(404, "Project not found");

  if (payload.courseId) await ensureCourseBelongsToUser(payload.courseId, userId);

  const nextStartDate = payload.startDate !== undefined ? payload.startDate : current.startDate;
  const nextDueDate = payload.dueDate !== undefined ? payload.dueDate : current.dueDate;
  if (hasInvalidDateRange(nextStartDate, nextDueDate)) {
    throw createHttpError(400, "startDate must be before or equal to dueDate");
  }

  return prisma.project.update({
    where: { id: current.id },
    data: payload,
    include: {
      course: true,
      milestones: true,
      tasks: true,
    },
  });
}

export async function deleteProject(userId: string, projectId: string): Promise<void> {
  const current = await prisma.project.findFirst({
    where: {
      id: projectId,
      userId,
    },
  });

  if (!current) throw createHttpError(404, "Project not found");
  await prisma.project.delete({ where: { id: current.id } });
}

export async function createMilestone(userId: string, projectId: string, payload: CreateMilestoneBody) {
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      userId,
    },
  });

  if (!project) throw createHttpError(404, "Project not found");

  return prisma.milestone.create({
    data: {
      ...payload,
      projectId: project.id,
    },
  });
}

export async function updateMilestone(userId: string, milestoneId: string, payload: UpdateMilestoneBody) {
  const milestone = await prisma.milestone.findUnique({
    where: { id: milestoneId },
    include: {
      project: true,
    },
  });

  if (!milestone || milestone.project.userId !== userId) {
    throw createHttpError(404, "Milestone not found");
  }

  return prisma.milestone.update({
    where: { id: milestone.id },
    data: payload,
  });
}

export async function deleteMilestone(userId: string, milestoneId: string): Promise<void> {
  const milestone = await prisma.milestone.findUnique({
    where: { id: milestoneId },
    include: {
      project: true,
    },
  });

  if (!milestone || milestone.project.userId !== userId) {
    throw createHttpError(404, "Milestone not found");
  }

  await prisma.milestone.delete({ where: { id: milestone.id } });
}

export async function createTask(userId: string, projectId: string, payload: CreateTaskBody) {
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      userId,
    },
  });

  if (!project) throw createHttpError(404, "Project not found");

  return prisma.projectTask.create({
    data: {
      ...payload,
      status: payload.status ?? ProjectTaskStatus.TODO,
      projectId: project.id,
    },
  });
}

export async function updateTask(userId: string, taskId: string, payload: UpdateTaskBody) {
  const task = await prisma.projectTask.findUnique({
    where: { id: taskId },
    include: {
      project: true,
    },
  });

  if (!task || task.project.userId !== userId) {
    throw createHttpError(404, "Task not found");
  }

  return prisma.projectTask.update({
    where: { id: task.id },
    data: payload,
  });
}

export async function deleteTask(userId: string, taskId: string): Promise<void> {
  const task = await prisma.projectTask.findUnique({
    where: { id: taskId },
    include: {
      project: true,
    },
  });

  if (!task || task.project.userId !== userId) {
    throw createHttpError(404, "Task not found");
  }

  await prisma.projectTask.delete({ where: { id: task.id } });
}
