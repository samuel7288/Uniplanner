import { Router } from "express";
import { z } from "zod";
import { requestSchema } from "../lib/validate";
import { requireAuth } from "../middleware/auth";
import { validate } from "../middleware/validation";
import {
  createGradeCategory,
  deleteGradeCategory,
  listGradeCategoriesForCourse,
  updateGradeCategory,
} from "../services/gradeCategoriesService";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

const categoryBodySchema = z.object({
  name: z.string().min(1).max(120),
  weight: z.number().positive().max(100),
});

const listCategoriesSchema = requestSchema({
  params: z.object({
    courseId: z.string().min(1),
  }),
});

const createCategorySchema = requestSchema({
  params: z.object({
    courseId: z.string().min(1),
  }),
  body: categoryBodySchema,
});

const updateCategorySchema = requestSchema({
  params: z.object({
    id: z.string().min(1),
  }),
  body: categoryBodySchema.partial().refine((payload) => Object.keys(payload).length > 0, {
    message: "At least one field must be provided",
  }),
});

const deleteCategorySchema = requestSchema({
  params: z.object({
    id: z.string().min(1),
  }),
});

router.use(requireAuth);

router.get(
  "/courses/:courseId/grade-categories",
  validate(listCategoriesSchema),
  asyncHandler(async (req, res) => {
    const categories = await listGradeCategoriesForCourse(req.user!.userId, req.params.courseId);
    res.json(categories);
  }),
);

router.post(
  "/courses/:courseId/grade-categories",
  validate(createCategorySchema),
  asyncHandler(async (req, res) => {
    const category = await createGradeCategory(req.user!.userId, req.params.courseId, req.body);
    res.status(201).json(category);
  }),
);

router.put(
  "/grade-categories/:id",
  validate(updateCategorySchema),
  asyncHandler(async (req, res) => {
    const category = await updateGradeCategory(req.user!.userId, req.params.id, req.body);
    res.json(category);
  }),
);

router.delete(
  "/grade-categories/:id",
  validate(deleteCategorySchema),
  asyncHandler(async (req, res) => {
    await deleteGradeCategory(req.user!.userId, req.params.id);
    res.status(204).send();
  }),
);

export { router as gradeCategoriesRoutes };

