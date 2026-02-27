import { Router } from "express";
import {
  addSessionHandler,
  archiveSemesterHandler,
  createCourseHandler,
  deleteCourseHandler,
  deleteSessionHandler,
  getCourseHandler,
  getCoursesHistoryHandler,
  getGradeProjectionHandler,
  getWeeklyScheduleHandler,
  importCoursesHandler,
  listCoursesHandler,
  updateCourseHandler,
  updateSessionHandler,
} from "../controllers/coursesController";
import { requireAuth } from "../middleware/auth";
import { validate } from "../middleware/validation";
import {
  addSessionSchema,
  archiveSemesterSchema,
  createCourseSchema,
  gradeProjectionSchema,
  importCoursesSchema,
  updateCourseSchema,
  updateSessionSchema,
} from "../validators/coursesValidators";

const router = Router();

router.use(requireAuth);

router.get("/schedule/weekly", getWeeklyScheduleHandler);
router.get("/", listCoursesHandler);
router.get("/history", getCoursesHistoryHandler);
router.post("/", validate(createCourseSchema), createCourseHandler);
router.post("/import", validate(importCoursesSchema), importCoursesHandler);
router.patch("/archive-semester", validate(archiveSemesterSchema), archiveSemesterHandler);
router.get("/:id", getCourseHandler);
router.put("/:id", validate(updateCourseSchema), updateCourseHandler);
router.delete("/:id", deleteCourseHandler);
router.post("/:id/class-sessions", validate(addSessionSchema), addSessionHandler);
router.put("/class-sessions/:sessionId", validate(updateSessionSchema), updateSessionHandler);
router.delete("/class-sessions/:sessionId", deleteSessionHandler);
router.get("/:id/grade-projection", validate(gradeProjectionSchema), getGradeProjectionHandler);

export { router as coursesRoutes };
