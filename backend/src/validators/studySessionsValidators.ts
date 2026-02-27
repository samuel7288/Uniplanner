import { z } from "zod";
import { requestSchema } from "../lib/validate";

const createStudySessionBodySchema = z
  .object({
    courseId: z.string().min(1),
    startTime: z.coerce.date(),
    endTime: z.coerce.date(),
    duration: z.number().int().min(1).max(24 * 60).optional(),
  })
  .refine((data) => data.endTime > data.startTime, {
    path: ["endTime"],
    message: "endTime must be later than startTime",
  });

const listStudySessionsQuerySchema = z.object({
  week: z.enum(["current"]).default("current"),
});

export const createStudySessionSchema = requestSchema({
  body: createStudySessionBodySchema,
});

export const listStudySessionsSchema = requestSchema({
  query: listStudySessionsQuerySchema,
});

export type CreateStudySessionBody = z.infer<typeof createStudySessionSchema>["body"];
export type ListStudySessionsQuery = z.infer<typeof listStudySessionsSchema>["query"];

