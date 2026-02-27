import { AssignmentPriority, AssignmentStatus, RepeatRule } from "@prisma/client";
import { z } from "zod";
import { requestSchema } from "../lib/validate";

const assignmentBodySchema = z.object({
  title: z.string().min(2).max(255),
  courseId: z.string().optional().nullable(),
  dueDate: z.coerce.date(),
  description: z.string().max(5000).optional().nullable(),
  priority: z.nativeEnum(AssignmentPriority).default(AssignmentPriority.MEDIUM),
  status: z.nativeEnum(AssignmentStatus).default(AssignmentStatus.PENDING),
  repeatRule: z.nativeEnum(RepeatRule).default(RepeatRule.NONE),
  attachmentLinks: z.array(z.string().url()).optional(),
  tags: z.array(z.string().min(1).max(50)).optional(),
});

const assignmentUpdateBodySchema = assignmentBodySchema.partial();

export const listAssignmentsSchema = requestSchema({
  query: z.object({
    status: z.nativeEnum(AssignmentStatus).optional(),
    courseId: z.string().optional(),
    q: z.string().max(255).optional(),
    dueFrom: z.string().optional(),
    dueTo: z.string().optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(50).optional(),
    sortBy: z.enum(["dueDate", "createdAt", "priority", "status", "title"]).optional(),
    sortDir: z.enum(["asc", "desc"]).optional(),
  }),
});

export const createAssignmentSchema = requestSchema({
  body: assignmentBodySchema,
});

export const updateAssignmentSchema = requestSchema({
  body: assignmentUpdateBodySchema,
  params: z.object({ id: z.string().min(1) }),
});

export type ListAssignmentsQuery = z.infer<typeof listAssignmentsSchema>["query"];
export type CreateAssignmentBody = z.infer<typeof createAssignmentSchema>["body"];
export type UpdateAssignmentBody = z.infer<typeof updateAssignmentSchema>["body"];
