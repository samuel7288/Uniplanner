import { SessionModality } from "@prisma/client";
import { z } from "zod";
import { requestSchema } from "../lib/validate";

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

const createCourseBodySchema = z.object({
  name: z.string().min(2).max(255),
  code: z.string().min(2).max(100),
  teacher: z.string().max(255).optional().nullable(),
  credits: z.number().int().min(0).optional().nullable(),
  color: z.string().max(32).optional().nullable(),
  semester: z.string().max(100).optional().nullable(),
  classSessions: z.array(classSessionSchema).optional(),
});

const updateCourseBodySchema = z.object({
  name: z.string().min(2).max(255).optional(),
  code: z.string().min(2).max(100).optional(),
  teacher: z.string().max(255).optional().nullable(),
  credits: z.number().int().min(0).optional().nullable(),
  color: z.string().max(32).optional().nullable(),
  semester: z.string().max(100).optional().nullable(),
});

export const createCourseSchema = requestSchema({
  body: createCourseBodySchema,
});

export const updateCourseSchema = requestSchema({
  body: updateCourseBodySchema,
  params: z.object({ id: z.string().min(1) }),
});

export const gradeProjectionSchema = requestSchema({
  params: z.object({ id: z.string().min(1) }),
  query: z.object({
    target: z.coerce.number().min(0).max(10).default(7),
  }),
});

export const addSessionSchema = requestSchema({
  body: classSessionSchema,
  params: z.object({
    id: z.string().min(1),
  }),
});

export const updateSessionSchema = requestSchema({
  body: partialClassSessionSchema,
  params: z.object({
    sessionId: z.string().min(1),
  }),
});

const importSessionSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  room: z.string().max(255).optional().nullable(),
  modality: z.nativeEnum(SessionModality).default(SessionModality.PRESENTIAL),
}).refine((data) => data.startTime < data.endTime, {
  path: ["endTime"],
  message: "endTime must be later than startTime",
});

const importCourseRowSchema = z.object({
  name: z.string().min(2).max(255),
  code: z.string().min(2).max(100),
  teacher: z.string().max(255).optional().nullable(),
  credits: z.number().int().min(0).optional().nullable(),
  color: z.string().max(32).optional().nullable(),
  semester: z.string().max(100).optional().nullable(),
  sessions: z.array(importSessionSchema).optional(),
});

export const importCoursesSchema = requestSchema({
  body: z.object({
    courses: z.array(importCourseRowSchema).min(1).max(200),
  }),
});

export type CreateCourseBody = z.infer<typeof createCourseSchema>["body"];
export type UpdateCourseBody = z.infer<typeof updateCourseSchema>["body"];
export type AddSessionBody = z.infer<typeof addSessionSchema>["body"];
export type UpdateSessionBody = z.infer<typeof updateSessionSchema>["body"];
export type GradeProjectionQuery = z.infer<typeof gradeProjectionSchema>["query"];
export type ImportCourseRow = z.infer<typeof importCourseRowSchema>;
export type ImportCoursesBody = z.infer<typeof importCoursesSchema>["body"];
