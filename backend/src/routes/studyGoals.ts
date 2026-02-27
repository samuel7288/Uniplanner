import { Router } from "express";
import { listStudyGoalsHandler, upsertStudyGoalHandler } from "../controllers/studyGoalsController";
import { requireAuth } from "../middleware/auth";
import { validate } from "../middleware/validation";
import { updateStudyGoalSchema } from "../validators/studyGoalsValidators";

const router = Router();

router.use(requireAuth);

router.get("/", listStudyGoalsHandler);
router.put("/:courseId", validate(updateStudyGoalSchema), upsertStudyGoalHandler);

export { router as studyGoalsRoutes };

