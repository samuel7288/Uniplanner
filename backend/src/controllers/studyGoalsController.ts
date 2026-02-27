import { asyncHandler } from "../utils/asyncHandler";
import { listCurrentWeekStudyGoals, upsertStudyGoal } from "../services/studyGoalsService";
import type { UpdateStudyGoalBody } from "../validators/studyGoalsValidators";

export const listStudyGoalsHandler = asyncHandler(async (req, res) => {
  const goals = await listCurrentWeekStudyGoals(req.user!.userId);
  res.json(goals);
});

export const upsertStudyGoalHandler = asyncHandler(async (req, res) => {
  const payload = req.body as UpdateStudyGoalBody;
  const goal = await upsertStudyGoal(req.user!.userId, req.params.courseId, payload.weeklyMinutes);
  res.json(goal);
});

