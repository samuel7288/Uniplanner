import { ProjectStatus, ProjectTaskStatus } from "@prisma/client";
import { z } from "zod";
import { requestSchema } from "../lib/validate";

const projectBodySchema = z.object({
  courseId: z.string().optional().nullable(),
  name: z.string().min(2).max(255),
  description: z.string().max(5000).optional().nullable(),
  startDate: z.coerce.date().optional().nullable(),
  dueDate: z.coerce.date().optional().nullable(),
  status: z.nativeEnum(ProjectStatus).default(ProjectStatus.TODO),
});

const milestoneBodySchema = z.object({
  title: z.string().min(2).max(255),
  description: z.string().max(5000).optional().nullable(),
  dueDate: z.coerce.date().optional().nullable(),
  completed: z.boolean().optional(),
});

const taskBodySchema = z.object({
  title: z.string().min(2).max(255),
  description: z.string().max(5000).optional().nullable(),
  dueDate: z.coerce.date().optional().nullable(),
  status: z.nativeEnum(ProjectTaskStatus).optional(),
});

export const listProjectsSchema = requestSchema({
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

export const createProjectSchema = requestSchema({
  body: projectBodySchema,
});

export const updateProjectSchema = requestSchema({
  body: projectBodySchema.partial(),
  params: z.object({ id: z.string().min(1) }),
});

export const createMilestoneSchema = requestSchema({
  body: milestoneBodySchema,
  params: z.object({ id: z.string().min(1) }),
});

export const updateMilestoneSchema = requestSchema({
  body: milestoneBodySchema.partial(),
  params: z.object({ milestoneId: z.string().min(1) }),
});

export const createTaskSchema = requestSchema({
  body: taskBodySchema,
  params: z.object({ id: z.string().min(1) }),
});

export const updateTaskSchema = requestSchema({
  body: taskBodySchema.partial(),
  params: z.object({ taskId: z.string().min(1) }),
});

export type ListProjectsQuery = z.infer<typeof listProjectsSchema>["query"];
export type CreateProjectBody = z.infer<typeof createProjectSchema>["body"];
export type UpdateProjectBody = z.infer<typeof updateProjectSchema>["body"];
export type CreateMilestoneBody = z.infer<typeof createMilestoneSchema>["body"];
export type UpdateMilestoneBody = z.infer<typeof updateMilestoneSchema>["body"];
export type CreateTaskBody = z.infer<typeof createTaskSchema>["body"];
export type UpdateTaskBody = z.infer<typeof updateTaskSchema>["body"];
