import { asyncHandler } from "../utils/asyncHandler";
import { createStudySession, listCurrentWeekSessions } from "../services/studySessionsService";
import type { CreateStudySessionBody } from "../validators/studySessionsValidators";

export const createStudySessionHandler = asyncHandler(async (req, res) => {
  const payload = req.body as CreateStudySessionBody;
  const session = await createStudySession(req.user!.userId, payload);
  res.status(201).json(session);
});

export const listStudySessionsHandler = asyncHandler(async (req, res) => {
  const sessions = await listCurrentWeekSessions(req.user!.userId);
  res.json(sessions);
});

