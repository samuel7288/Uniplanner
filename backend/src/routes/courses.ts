import { Router } from "express";
import {
  addSessionHandler,
  createCourseHandler,
  deleteCourseHandler,
  deleteSessionHandler,
  getCourseHandler,
  getGradeProjectionHandler,
  getWeeklyScheduleHandler,
  listCoursesHandler,
  updateCourseHandler,
  updateSessionHandler,
} from "../controllers/coursesController";
import { requireAuth } from "../middleware/auth";
import { validate } from "../middleware/validation";
import {
  addSessionSchema,
  createCourseSchema,
  gradeProjectionSchema,
  updateCourseSchema,
  updateSessionSchema,
} from "../validators/coursesValidators";

const router = Router();

router.use(requireAuth);

router.get("/schedule/weekly", getWeeklyScheduleHandler);
router.get("/", listCoursesHandler);
router.post("/", validate(createCourseSchema), createCourseHandler);
router.get("/:id", getCourseHandler);
router.put("/:id", validate(updateCourseSchema), updateCourseHandler);
router.delete("/:id", deleteCourseHandler);
router.post("/:id/class-sessions", validate(addSessionSchema), addSessionHandler);
router.put("/class-sessions/:sessionId", validate(updateSessionSchema), updateSessionHandler);
router.delete("/class-sessions/:sessionId", deleteSessionHandler);
router.get("/:id/grade-projection", validate(gradeProjectionSchema), getGradeProjectionHandler);

export { router as coursesRoutes };
