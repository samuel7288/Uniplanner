import { asyncHandler } from "../utils/asyncHandler";
import type {
  CreateMilestoneBody,
  CreateProjectBody,
  CreateTaskBody,
  ListProjectsQuery,
  UpdateMilestoneBody,
  UpdateProjectBody,
  UpdateTaskBody,
} from "../validators/projectsValidators";
import {
  createMilestone,
  createProject,
  createTask,
  deleteMilestone,
  deleteProject,
  deleteTask,
  getProjectById,
  listProjectsForUser,
  updateMilestone,
  updateProject,
  updateTask,
} from "../services/projectsService";

export const listProjectsHandler = asyncHandler(async (req, res) => {
  const query = req.query as ListProjectsQuery;
  const result = await listProjectsForUser(req.user!.userId, query);
  res.json(result);
});

export const createProjectHandler = asyncHandler(async (req, res) => {
  const payload = req.body as CreateProjectBody;
  const project = await createProject(req.user!.userId, payload);
  res.status(201).json(project);
});

export const getProjectHandler = asyncHandler(async (req, res) => {
  const project = await getProjectById(req.user!.userId, req.params.id);
  res.json(project);
});

export const updateProjectHandler = asyncHandler(async (req, res) => {
  const payload = req.body as UpdateProjectBody;
  const updated = await updateProject(req.user!.userId, req.params.id, payload);
  res.json(updated);
});

export const deleteProjectHandler = asyncHandler(async (req, res) => {
  await deleteProject(req.user!.userId, req.params.id);
  res.status(204).send();
});

export const createMilestoneHandler = asyncHandler(async (req, res) => {
  const payload = req.body as CreateMilestoneBody;
  const milestone = await createMilestone(req.user!.userId, req.params.id, payload);
  res.status(201).json(milestone);
});

export const updateMilestoneHandler = asyncHandler(async (req, res) => {
  const payload = req.body as UpdateMilestoneBody;
  const milestone = await updateMilestone(req.user!.userId, req.params.milestoneId, payload);
  res.json(milestone);
});

export const deleteMilestoneHandler = asyncHandler(async (req, res) => {
  await deleteMilestone(req.user!.userId, req.params.milestoneId);
  res.status(204).send();
});

export const createTaskHandler = asyncHandler(async (req, res) => {
  const payload = req.body as CreateTaskBody;
  const task = await createTask(req.user!.userId, req.params.id, payload);
  res.status(201).json(task);
});

export const updateTaskHandler = asyncHandler(async (req, res) => {
  const payload = req.body as UpdateTaskBody;
  const task = await updateTask(req.user!.userId, req.params.taskId, payload);
  res.json(task);
});

export const deleteTaskHandler = asyncHandler(async (req, res) => {
  await deleteTask(req.user!.userId, req.params.taskId);
  res.status(204).send();
});
