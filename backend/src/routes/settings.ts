import bcrypt from "bcryptjs";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requestSchema } from "../lib/validate";
import { requireAuth } from "../middleware/auth";
import { validate } from "../middleware/validation";
import {
  getStudyReminderPreference,
  upsertStudyReminderPreference,
} from "../services/studyReminderPreferencesService";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();
const BCRYPT_SALT_ROUNDS = 12;

const updateProfileSchema = requestSchema({
  body: z.object({
    name: z.string().min(2).optional(),
    career: z.string().nullable().optional(),
    university: z.string().nullable().optional(),
    timezone: z.string().optional(),
  }),
});

const updatePreferencesSchema = requestSchema({
  body: z.object({
    notifyInApp: z.boolean().optional(),
    notifyEmail: z.boolean().optional(),
    darkModePref: z.boolean().optional(),
    themePreset: z.enum(["ocean", "forest", "sunset", "midnight", "sepia", "violet"]).optional(),
    browserPushEnabled: z.boolean().optional(),
  }),
});

const updateStudyReminderSchema = requestSchema({
  body: z.object({
    enabled: z.boolean().optional(),
    minDaysWithoutStudy: z.coerce.number().int().min(1).max(14).optional(),
  }),
});

const changePasswordSchema = requestSchema({
  body: z
    .object({
      currentPassword: z.string().min(8).max(72),
      newPassword: z.string().min(8).max(72),
    })
    .refine((data) => data.currentPassword !== data.newPassword, {
      path: ["newPassword"],
      message: "La nueva contrasena debe ser diferente a la actual",
    }),
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

router.get(
  "/study-reminders",
  asyncHandler(async (req, res) => {
    const preference = await getStudyReminderPreference(req.user!.userId);
    res.json({
      enabled: preference.enabled,
      minDaysWithoutStudy: preference.minDaysWithoutStudy,
    });
  }),
);

router.put(
  "/study-reminders",
  validate(updateStudyReminderSchema),
  asyncHandler(async (req, res) => {
    const { enabled, minDaysWithoutStudy } = req.body as {
      enabled?: boolean;
      minDaysWithoutStudy?: number;
    };

    const updated = await upsertStudyReminderPreference(req.user!.userId, {
      enabled,
      minDaysWithoutStudy,
    });

    res.json({
      enabled: updated.enabled,
      minDaysWithoutStudy: updated.minDaysWithoutStudy,
    });
  }),
);

router.post(
  "/change-password",
  validate(changePasswordSchema),
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body as {
      currentPassword: string;
      newPassword: string;
    };

    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { id: true, passwordHash: true },
    });

    if (!user) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    const matches = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!matches) {
      res.status(400).json({ message: "La contrasena actual no es correcta" });
      return;
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { passwordHash },
      }),
      prisma.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    res.clearCookie("refreshToken", { path: "/api/auth" });
    res.json({
      message: "Password updated successfully",
    });
  }),
);

export { router as settingsRoutes };
