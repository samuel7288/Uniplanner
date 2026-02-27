import { Router } from "express";
import { createStudySessionHandler, listStudySessionsHandler } from "../controllers/studySessionsController";
import { requireAuth } from "../middleware/auth";
import { validate } from "../middleware/validation";
import { createStudySessionSchema, listStudySessionsSchema } from "../validators/studySessionsValidators";

const router = Router();

router.use(requireAuth);

router.get("/", validate(listStudySessionsSchema), listStudySessionsHandler);
router.post("/", validate(createStudySessionSchema), createStudySessionHandler);

export { router as studySessionsRoutes };

