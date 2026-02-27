import { z } from "zod";
import { requestSchema } from "../lib/validate";

const updateStudyGoalBodySchema = z.object({
  weeklyMinutes: z.number().int().min(1).max(7 * 24 * 60),
});

export const updateStudyGoalSchema = requestSchema({
  params: z.object({
    courseId: z.string().min(1),
  }),
  body: updateStudyGoalBodySchema,
});

export type UpdateStudyGoalBody = z.infer<typeof updateStudyGoalSchema>["body"];

