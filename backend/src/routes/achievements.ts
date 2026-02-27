import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { getAchievementsSummary } from "../services/achievementsService";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

router.use(requireAuth);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const summary = await getAchievementsSummary(req.user!.userId);
    res.json(summary);
  }),
);

export { router as achievementsRoutes };

