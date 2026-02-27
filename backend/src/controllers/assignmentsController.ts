import { asyncHandler } from "../utils/asyncHandler";
import type {
  CreateAssignmentBody,
  ListAssignmentsQuery,
  UpdateAssignmentBody,
} from "../validators/assignmentsValidators";
import {
  createAssignment,
  deleteAssignment,
  getAssignmentById,
  getFocusAssignments,
  listAssignmentsForUser,
  updateAssignment,
} from "../services/assignmentsService";

export const getTodayFocusTasks = asyncHandler(async (req, res) => {
  const tasks = await getFocusAssignments(req.user!.userId);
  res.json({ tasks });
});

export const listAssignments = asyncHandler(async (req, res) => {
  const query = req.query as ListAssignmentsQuery;
  const result = await listAssignmentsForUser(req.user!.userId, query);
  res.json(result);
});

export const createAssignmentHandler = asyncHandler(async (req, res) => {
  const payload = req.body as CreateAssignmentBody;
  const assignment = await createAssignment(req.user!.userId, payload);
  res.status(201).json(assignment);
});

export const getAssignment = asyncHandler(async (req, res) => {
  const assignment = await getAssignmentById(req.user!.userId, req.params.id);
  res.json(assignment);
});

export const updateAssignmentHandler = asyncHandler(async (req, res) => {
  const payload = req.body as UpdateAssignmentBody;
  const updated = await updateAssignment(req.user!.userId, req.params.id, payload);
  res.json(updated);
});

export const deleteAssignmentHandler = asyncHandler(async (req, res) => {
  await deleteAssignment(req.user!.userId, req.params.id);
  res.status(204).send();
});
