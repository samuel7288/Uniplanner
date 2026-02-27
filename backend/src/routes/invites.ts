import { Router } from "express";
import { z } from "zod";
import { requestSchema } from "../lib/validate";
import { requireAuth } from "../middleware/auth";
import { validate } from "../middleware/validation";
import { acceptStudyGroupInvite } from "../services/studyGroupsService";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

const acceptInviteSchema = requestSchema({
  params: z.object({
    token: z.string().min(8),
  }),
});

router.use(requireAuth);

router.get(
  "/:token",
  validate(acceptInviteSchema),
  asyncHandler(async (req, res) => {
    const group = await acceptStudyGroupInvite(req.user!.userId, req.params.token);
    res.json({
      accepted: true,
      group,
    });
  }),
);

export { router as invitesRoutes };

