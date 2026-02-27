import { Router } from "express";
import {
  createMilestoneHandler,
  createProjectHandler,
  createTaskHandler,
  deleteMilestoneHandler,
  deleteProjectHandler,
  deleteTaskHandler,
  getProjectHandler,
  listProjectsHandler,
  updateMilestoneHandler,
  updateProjectHandler,
  updateTaskHandler,
} from "../controllers/projectsController";
import { requireAuth } from "../middleware/auth";
import { validate } from "../middleware/validation";
import {
  createMilestoneSchema,
  createProjectSchema,
  createTaskSchema,
  listProjectsSchema,
  updateMilestoneSchema,
  updateProjectSchema,
  updateTaskSchema,
} from "../validators/projectsValidators";

const router = Router();

router.use(requireAuth);

router.get("/", validate(listProjectsSchema), listProjectsHandler);
router.post("/", validate(createProjectSchema), createProjectHandler);
router.get("/:id", getProjectHandler);
router.put("/:id", validate(updateProjectSchema), updateProjectHandler);
router.delete("/:id", deleteProjectHandler);
router.post("/:id/milestones", validate(createMilestoneSchema), createMilestoneHandler);
router.patch("/milestones/:milestoneId", validate(updateMilestoneSchema), updateMilestoneHandler);
router.delete("/milestones/:milestoneId", deleteMilestoneHandler);
router.post("/:id/tasks", validate(createTaskSchema), createTaskHandler);
router.patch("/tasks/:taskId", validate(updateTaskSchema), updateTaskHandler);
router.delete("/tasks/:taskId", deleteTaskHandler);

export { router as projectsRoutes };
