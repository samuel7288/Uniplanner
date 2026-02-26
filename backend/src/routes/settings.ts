import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { validate } from "../middleware/validation";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

const updateProfileSchema = z.object({
  body: z.object({
    name: z.string().min(2).optional(),
    career: z.string().nullable().optional(),
    university: z.string().nullable().optional(),
    timezone: z.string().optional(),
  }),
  query: z.object({}).passthrough(),
  params: z.object({}).passthrough(),
});

const updatePreferencesSchema = z.object({
  body: z.object({
    notifyInApp: z.boolean().optional(),
    notifyEmail: z.boolean().optional(),
    darkModePref: z.boolean().optional(),
    themePreset: z.enum(["ocean", "forest", "sunset", "violet"]).optional(),
    browserPushEnabled: z.boolean().optional(),
  }),
  query: z.object({}).passthrough(),
  params: z.object({}).passthrough(),
});

router.use(requireAuth);

router.get(
  "/profile",
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: {
        id: true,
        email: true,
        name: true,
        career: true,
        university: true,
        timezone: true,
        notifyInApp: true,
        notifyEmail: true,
        darkModePref: true,
        themePreset: true,
        browserPushEnabled: true,
      },
    });

    res.json(user);
  }),
);

router.put(
  "/profile",
  validate(updateProfileSchema),
  asyncHandler(async (req, res) => {
    const updated = await prisma.user.update({
      where: { id: req.user!.userId },
      data: req.body,
      select: {
        id: true,
        email: true,
        name: true,
        career: true,
        university: true,
        timezone: true,
        notifyInApp: true,
        notifyEmail: true,
        darkModePref: true,
        themePreset: true,
        browserPushEnabled: true,
      },
    });

    res.json(updated);
  }),
);

router.put(
  "/preferences",
  validate(updatePreferencesSchema),
  asyncHandler(async (req, res) => {
    const updated = await prisma.user.update({
      where: { id: req.user!.userId },
      data: req.body,
      select: {
        notifyInApp: true,
        notifyEmail: true,
        darkModePref: true,
        themePreset: true,
        browserPushEnabled: true,
      },
    });

    res.json(updated);
  }),
);

export { router as settingsRoutes };
