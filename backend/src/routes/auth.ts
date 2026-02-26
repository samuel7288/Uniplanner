import bcrypt from "bcryptjs";
import { addDays, addMinutes } from "date-fns";
import { Router, Response } from "express";
import { z } from "zod";
import { env, isProd } from "../config/env";
import { prisma } from "../lib/prisma";
import {
  createAccessToken,
  createRefreshToken,
  generateRandomToken,
  hashToken,
  verifyRefreshToken,
} from "../lib/tokens";
import { requireAuth } from "../middleware/auth";
import { validate } from "../middleware/validation";
import { asyncHandler } from "../utils/asyncHandler";
import { sendEmail } from "../lib/email";

const router = Router();

const REFRESH_COOKIE = "refreshToken";
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: isProd,
  sameSite: (isProd ? "strict" : "lax") as "strict" | "lax",
  path: "/api/auth",
  maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
};

const registerSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(8).max(72),
    name: z.string().min(2),
    career: z.string().optional(),
    university: z.string().optional(),
    timezone: z.string().optional(),
  }),
  query: z.object({}).passthrough(),
  params: z.object({}).passthrough(),
});

const loginSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(8),
  }),
  query: z.object({}).passthrough(),
  params: z.object({}).passthrough(),
});

const forgotSchema = z.object({
  body: z.object({ email: z.string().email() }),
  query: z.object({}).passthrough(),
  params: z.object({}).passthrough(),
});

const resetSchema = z.object({
  body: z.object({
    token: z.string().min(10),
    newPassword: z.string().min(8).max(72),
  }),
  query: z.object({}).passthrough(),
  params: z.object({}).passthrough(),
});

type AuthUser = { id: string; email: string; name: string };

/**
 * Creates access + refresh tokens, persists refresh hash in DB,
 * and sets the refresh token as an HttpOnly cookie on the response.
 * Returns only the short-lived access token.
 */
async function issueTokens(user: AuthUser, res: Response): Promise<{ accessToken: string }> {
  const accessToken = createAccessToken({ sub: user.id, email: user.email, name: user.name });
  const refreshToken = createRefreshToken(user.id);
  const tokenHash = hashToken(refreshToken);

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt: addDays(new Date(), env.REFRESH_TOKEN_TTL_DAYS),
    },
  });

  res.cookie(REFRESH_COOKIE, refreshToken, COOKIE_OPTIONS);
  return { accessToken };
}

router.post(
  "/register",
  validate(registerSchema),
  asyncHandler(async (req, res) => {
    const { email, password, name, career, university, timezone } = req.body;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      res.status(409).json({ message: "Email already registered" });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { email, passwordHash, name, career, university, timezone: timezone || "UTC" },
      select: {
        id: true, email: true, name: true, career: true,
        university: true, timezone: true, notifyInApp: true, notifyEmail: true,
        darkModePref: true, themePreset: true, browserPushEnabled: true,
      },
    });

    const tokens = await issueTokens(user, res);
    res.status(201).json({ user, ...tokens });
  }),
);

router.post(
  "/login",
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      res.status(401).json({ message: "Invalid credentials" });
      return;
    }

    const matches = await bcrypt.compare(password, user.passwordHash);
    if (!matches) {
      res.status(401).json({ message: "Invalid credentials" });
      return;
    }

    const tokens = await issueTokens({ id: user.id, email: user.email, name: user.name }, res);

    res.json({
      user: {
        id: user.id, email: user.email, name: user.name, career: user.career,
        university: user.university, timezone: user.timezone,
        notifyInApp: user.notifyInApp, notifyEmail: user.notifyEmail,
        darkModePref: user.darkModePref, themePreset: user.themePreset, browserPushEnabled: user.browserPushEnabled,
      },
      ...tokens,
    });
  }),
);

router.post(
  "/refresh",
  asyncHandler(async (req, res) => {
    const refreshToken = req.cookies[REFRESH_COOKIE] as string | undefined;

    if (!refreshToken) {
      res.status(401).json({ message: "No refresh token" });
      return;
    }

    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      res.clearCookie(REFRESH_COOKIE, { path: COOKIE_OPTIONS.path });
      res.status(401).json({ message: "Invalid refresh token" });
      return;
    }

    const tokenHash = hashToken(refreshToken);
    const existing = await prisma.refreshToken.findFirst({
      where: { tokenHash, userId: payload.sub, revokedAt: null, expiresAt: { gt: new Date() } },
    });

    if (!existing) {
      res.clearCookie(REFRESH_COOKIE, { path: COOKIE_OPTIONS.path });
      res.status(401).json({ message: "Refresh token expired or revoked" });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, name: true },
    });

    if (!user) {
      res.clearCookie(REFRESH_COOKIE, { path: COOKIE_OPTIONS.path });
      res.status(401).json({ message: "User not found" });
      return;
    }

    // Rotate: revoke old, issue new
    await prisma.refreshToken.update({ where: { id: existing.id }, data: { revokedAt: new Date() } });

    const tokens = await issueTokens(user, res);
    res.json(tokens);
  }),
);

router.post(
  "/logout",
  asyncHandler(async (req, res) => {
    const refreshToken = req.cookies[REFRESH_COOKIE] as string | undefined;
    if (refreshToken) {
      await prisma.refreshToken.updateMany({
        where: { tokenHash: hashToken(refreshToken), revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    res.clearCookie(REFRESH_COOKIE, { path: COOKIE_OPTIONS.path });
    res.json({ message: "Logged out" });
  }),
);

router.post(
  "/forgot-password",
  validate(forgotSchema),
  asyncHandler(async (req, res) => {
    const { email } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      const rawToken = generateRandomToken(24);
      const tokenHash = hashToken(rawToken);

      await prisma.passwordResetToken.create({
        data: { userId: user.id, tokenHash, expiresAt: addMinutes(new Date(), 15) },
      });

      const resetLink = `${env.FRONTEND_URL}/reset-password?token=${rawToken}`;
      await sendEmail({
        to: user.email,
        subject: "UniPlanner password reset",
        text: `Reset your password: ${resetLink}`,
      });

      if (!env.SMTP_HOST) {
        process.stdout.write(`[PASSWORD RESET TOKEN] ${rawToken}\n`);
      }
    }

    res.json({ message: "If the email exists, a reset instruction has been sent" });
  }),
);

router.post(
  "/reset-password",
  validate(resetSchema),
  asyncHandler(async (req, res) => {
    const { token, newPassword } = req.body;

    const existing = await prisma.passwordResetToken.findFirst({
      where: { tokenHash: hashToken(token), usedAt: null, expiresAt: { gt: new Date() } },
      include: { user: true },
    });

    if (!existing) {
      res.status(400).json({ message: "Invalid or expired reset token" });
      return;
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    await prisma.$transaction([
      prisma.user.update({ where: { id: existing.userId }, data: { passwordHash } }),
      prisma.passwordResetToken.update({ where: { id: existing.id }, data: { usedAt: new Date() } }),
      prisma.refreshToken.updateMany({ where: { userId: existing.userId, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);

    res.clearCookie(REFRESH_COOKIE, { path: COOKIE_OPTIONS.path });
    res.json({ message: "Password updated successfully" });
  }),
);

router.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: {
        id: true, email: true, name: true, career: true,
        university: true, timezone: true, notifyInApp: true, notifyEmail: true,
        darkModePref: true, themePreset: true, browserPushEnabled: true,
      },
    });
    res.json(user);
  }),
);

export { router as authRoutes };
