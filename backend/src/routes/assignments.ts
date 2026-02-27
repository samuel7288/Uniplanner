import { Router } from "express";
import {
  createAssignmentHandler,
  deleteAssignmentHandler,
  getAssignment,
  getTodayFocusTasks,
  listAssignments,
  updateAssignmentHandler,
} from "../controllers/assignmentsController";
import { requireAuth } from "../middleware/auth";
import { validate } from "../middleware/validation";
import {
  createAssignmentSchema,
  listAssignmentsSchema,
  updateAssignmentSchema,
} from "../validators/assignmentsValidators";

const router = Router();

router.use(requireAuth);

router.get("/focus/today", getTodayFocusTasks);
router.get("/", validate(listAssignmentsSchema), listAssignments);
router.post("/", validate(createAssignmentSchema), createAssignmentHandler);
router.get("/:id", getAssignment);
router.put("/:id", validate(updateAssignmentSchema), updateAssignmentHandler);
router.delete("/:id", deleteAssignmentHandler);

export { router as assignmentsRoutes };
