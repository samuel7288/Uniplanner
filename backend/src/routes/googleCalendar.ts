import { addHours } from "date-fns";
import jwt from "jsonwebtoken";
import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import { requestSchema } from "../lib/validate";
import { requireAuth } from "../middleware/auth";
import { validate } from "../middleware/validation";
import {
  getFreshGoogleCalendarAccess,
  getGoogleCalendarSync,
  isGoogleCalendarConfigured,
  markGoogleCalendarLastSync,
  removeGoogleCalendarSync,
  upsertGoogleCalendarSync,
} from "../services/googleCalendarSyncService";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();
const GOOGLE_EVENTS_SCOPE = "https://www.googleapis.com/auth/calendar.events";

const oauthCallbackSchema = requestSchema({
  query: z.object({
    code: z.string().optional(),
    state: z.string().optional(),
    error: z.string().optional(),
  }),
});

function frontendSettingsRedirect(status: "connected" | "error" | "cancelled"): string {
  const base = env.FRONTEND_URL.replace(/\/$/, "");
  return `${base}/settings?googleCalendar=${status}`;
}

function createGoogleOAuthState(userId: string): string {
  return jwt.sign(
    {
      userId,
      purpose: "google_calendar_oauth",
    },
    env.JWT_ACCESS_SECRET,
    { expiresIn: "10m" },
  );
}

function parseGoogleOAuthState(state: string): { userId: string } {
  const decoded = jwt.verify(state, env.JWT_ACCESS_SECRET) as {
    userId?: string;
    purpose?: string;
  };

  if (!decoded.userId || decoded.purpose !== "google_calendar_oauth") {
    throw new Error("Invalid OAuth state");
  }
  return { userId: decoded.userId };
}

function buildGoogleOAuthUrl(state: string): string {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", env.GOOGLE_CLIENT_ID!);
  url.searchParams.set("redirect_uri", env.GOOGLE_REDIRECT_URI!);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_EVENTS_SCOPE);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", state);
  return url.toString();
}

async function exchangeCodeForTokens(code: string) {
  const body = new URLSearchParams({
    code,
    client_id: env.GOOGLE_CLIENT_ID!,
    client_secret: env.GOOGLE_CLIENT_SECRET!,
    redirect_uri: env.GOOGLE_REDIRECT_URI!,
    grant_type: "authorization_code",
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!response.ok) {
    throw new Error("Google OAuth token exchange failed");
  }

  return (await response.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };
}

function sanitizeGoogleEventId(rawId: string): string {
  const normalized = rawId.toLowerCase().replace(/[^a-z0-9_-]/g, "-");
  const compact = normalized.replace(/^-+/, "").slice(0, 120);
  return compact || `up-${Date.now()}`;
}

async function upsertGoogleEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
  payload: Record<string, unknown>,
): Promise<"inserted" | "updated"> {
  const encodedCalendarId = encodeURIComponent(calendarId);
  const encodedEventId = encodeURIComponent(eventId);
  const updateUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodedCalendarId}/events/${encodedEventId}`;

  const updateResponse = await fetch(updateUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ...payload,
      id: eventId,
    }),
  });

  if (updateResponse.ok) return "updated";

  if (updateResponse.status !== 404) {
    throw new Error("Failed to update Google Calendar event");
  }

  const insertUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodedCalendarId}/events`;
  const insertResponse = await fetch(insertUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ...payload,
      id: eventId,
    }),
  });

  if (!insertResponse.ok) {
    throw new Error("Failed to insert Google Calendar event");
  }

  return "inserted";
}

router.get(
  "/oauth/callback",
  validate(oauthCallbackSchema),
  asyncHandler(async (req, res) => {
    if (!isGoogleCalendarConfigured()) {
      res.redirect(frontendSettingsRedirect("error"));
      return;
    }

    const { code, state, error } = req.query as {
      code?: string;
      state?: string;
      error?: string;
    };

    if (error || !code || !state) {
      res.redirect(frontendSettingsRedirect("cancelled"));
      return;
    }

    try {
      const { userId } = parseGoogleOAuthState(state);
      const tokenData = await exchangeCodeForTokens(code);
      const tokenExpiry = new Date(Date.now() + Math.max(300, tokenData.expires_in ?? 3600) * 1000);

      await upsertGoogleCalendarSync(userId, {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        tokenExpiry,
        calendarId: "primary",
      });

      res.redirect(frontendSettingsRedirect("connected"));
    } catch {
      res.redirect(frontendSettingsRedirect("error"));
    }
  }),
);

router.use(requireAuth);

router.get(
  "/status",
  asyncHandler(async (req, res) => {
    if (!isGoogleCalendarConfigured()) {
      res.json({
        configured: false,
        connected: false,
        lastSyncAt: null,
        calendarId: null,
      });
      return;
    }

    const sync = await getGoogleCalendarSync(req.user!.userId);
    res.json({
      configured: true,
      connected: Boolean(sync),
      lastSyncAt: sync?.lastSyncAt?.toISOString() ?? null,
      calendarId: sync?.calendarId ?? null,
    });
  }),
);

router.get(
  "/connect-url",
  asyncHandler(async (req, res) => {
    if (!isGoogleCalendarConfigured()) {
      res.status(503).json({ message: "Google Calendar integration is not configured" });
      return;
    }

    const state = createGoogleOAuthState(req.user!.userId);
    res.json({
      url: buildGoogleOAuthUrl(state),
    });
  }),
);

router.post(
  "/sync",
  asyncHandler(async (req, res) => {
    if (!isGoogleCalendarConfigured()) {
      res.status(503).json({ message: "Google Calendar integration is not configured" });
      return;
    }

    const access = await getFreshGoogleCalendarAccess(req.user!.userId);
    if (!access) {
      res.status(400).json({ message: "Google Calendar is not connected" });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { timezone: true },
    });
    const timezone = user?.timezone || "UTC";

    const [assignments, exams] = await Promise.all([
      prisma.assignment.findMany({
        where: {
          userId: req.user!.userId,
          status: {
            in: ["PENDING", "IN_PROGRESS"],
          },
        },
        include: {
          course: true,
        },
      }),
      prisma.exam.findMany({
        where: {
          userId: req.user!.userId,
        },
        include: {
          course: true,
        },
      }),
    ]);

    let inserted = 0;
    let updated = 0;

    for (const assignment of assignments) {
      const eventId = sanitizeGoogleEventId(`up-assignment-${assignment.id}`);
      const result = await upsertGoogleEvent(access.accessToken, access.calendarId, eventId, {
        summary: `Entrega: ${assignment.title}`,
        description: [assignment.course?.name, assignment.description].filter(Boolean).join("\n"),
        start: {
          dateTime: assignment.dueDate.toISOString(),
          timeZone: timezone,
        },
        end: {
          dateTime: addHours(assignment.dueDate, 1).toISOString(),
          timeZone: timezone,
        },
      });
      if (result === "inserted") inserted += 1;
      else updated += 1;
    }

    for (const exam of exams) {
      const eventId = sanitizeGoogleEventId(`up-exam-${exam.id}`);
      const result = await upsertGoogleEvent(access.accessToken, access.calendarId, eventId, {
        summary: `Examen: ${exam.title}`,
        description: [exam.course?.name, exam.syllabus].filter(Boolean).join("\n"),
        location: exam.location ?? undefined,
        start: {
          dateTime: exam.dateTime.toISOString(),
          timeZone: timezone,
        },
        end: {
          dateTime: addHours(exam.dateTime, 2).toISOString(),
          timeZone: timezone,
        },
      });
      if (result === "inserted") inserted += 1;
      else updated += 1;
    }

    await markGoogleCalendarLastSync(req.user!.userId);

    res.json({
      synced: assignments.length + exams.length,
      inserted,
      updated,
    });
  }),
);

router.delete(
  "/disconnect",
  asyncHandler(async (req, res) => {
    const sync = await getGoogleCalendarSync(req.user!.userId);

    if (sync?.refreshToken) {
      const revokeBody = new URLSearchParams({ token: sync.refreshToken });
      await fetch("https://oauth2.googleapis.com/revoke", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: revokeBody,
      }).catch(() => {
        // Best-effort token revocation.
      });
    }

    await removeGoogleCalendarSync(req.user!.userId);
    res.json({ connected: false });
  }),
);

export { router as googleCalendarRoutes };

