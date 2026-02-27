import { asyncHandler } from "../utils/asyncHandler";
import type {
  AddSessionBody,
  CreateCourseBody,
  GradeProjectionQuery,
  ImportCoursesBody,
  UpdateCourseBody,
  UpdateSessionBody,
} from "../validators/coursesValidators";
import {
  addClassSession,
  createCourse,
  deleteClassSession,
  deleteCourse,
  getCourseById,
  getGradeProjection,
  getWeeklySchedule,
  importCourses,
  listCourses,
  updateClassSession,
  updateCourse,
} from "../services/coursesService";

export const getWeeklyScheduleHandler = asyncHandler(async (req, res) => {
  const schedule = await getWeeklySchedule(req.user!.userId);
  res.json({ schedule });
});

export const listCoursesHandler = asyncHandler(async (req, res) => {
  const courses = await listCourses(req.user!.userId);
  res.json(courses);
});

export const createCourseHandler = asyncHandler(async (req, res) => {
  const payload = req.body as CreateCourseBody;
  const course = await createCourse(req.user!.userId, payload);
  res.status(201).json(course);
});

export const getCourseHandler = asyncHandler(async (req, res) => {
  const course = await getCourseById(req.user!.userId, req.params.id);
  res.json(course);
});

export const updateCourseHandler = asyncHandler(async (req, res) => {
  const payload = req.body as UpdateCourseBody;
  const updated = await updateCourse(req.user!.userId, req.params.id, payload);
  res.json(updated);
});

export const deleteCourseHandler = asyncHandler(async (req, res) => {
  await deleteCourse(req.user!.userId, req.params.id);
  res.status(204).send();
});

export const addSessionHandler = asyncHandler(async (req, res) => {
  const payload = req.body as AddSessionBody;
  const session = await addClassSession(req.user!.userId, req.params.id, payload);
  res.status(201).json(session);
});

export const updateSessionHandler = asyncHandler(async (req, res) => {
  const payload = req.body as UpdateSessionBody;
  const updated = await updateClassSession(req.user!.userId, req.params.sessionId, payload);
  res.json(updated);
});

export const deleteSessionHandler = asyncHandler(async (req, res) => {
  await deleteClassSession(req.user!.userId, req.params.sessionId);
  res.status(204).send();
});

export const getGradeProjectionHandler = asyncHandler(async (req, res) => {
  const { target } = req.query as GradeProjectionQuery;
  const projection = await getGradeProjection(req.user!.userId, req.params.id, target);
  res.json(projection);
});

export const importCoursesHandler = asyncHandler(async (req, res) => {
  const { courses } = req.body as ImportCoursesBody;
  const result = await importCourses(req.user!.userId, courses);
  res.json(result);
});
