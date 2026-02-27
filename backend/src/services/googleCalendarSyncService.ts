import { env } from "../config/env";
import { prisma } from "../lib/prisma";

export type GoogleCalendarSyncRecord = {
  id: number;
  userId: string;
  accessToken: string;
  refreshToken: string;
  tokenExpiry: Date;
  calendarId: string;
  lastSyncAt: Date | null;
};

let googleCalendarInfraReady = false;

export function isGoogleCalendarConfigured(): boolean {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_REDIRECT_URI);
}

export async function ensureGoogleCalendarInfrastructure(): Promise<void> {
  if (googleCalendarInfraReady) return;

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "GoogleCalendarSync" (
      "id" SERIAL PRIMARY KEY,
      "userId" TEXT NOT NULL UNIQUE,
      "accessToken" TEXT NOT NULL,
      "refreshToken" TEXT NOT NULL,
      "tokenExpiry" TIMESTAMP(3) NOT NULL,
      "calendarId" TEXT NOT NULL,
      "lastSyncAt" TIMESTAMP(3),
      CONSTRAINT "GoogleCalendarSync_userId_fkey"
        FOREIGN KEY ("userId")
        REFERENCES "User"("id")
        ON DELETE CASCADE
        ON UPDATE CASCADE
    )
  `);

  await prisma.$executeRawUnsafe(
    `ALTER TABLE "GoogleCalendarSync" ADD COLUMN IF NOT EXISTS "accessToken" TEXT NOT NULL DEFAULT ''`,
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "GoogleCalendarSync" ADD COLUMN IF NOT EXISTS "refreshToken" TEXT NOT NULL DEFAULT ''`,
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "GoogleCalendarSync" ADD COLUMN IF NOT EXISTS "tokenExpiry" TIMESTAMP(3) NOT NULL DEFAULT NOW()`,
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "GoogleCalendarSync" ADD COLUMN IF NOT EXISTS "calendarId" TEXT NOT NULL DEFAULT 'primary'`,
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "GoogleCalendarSync" ADD COLUMN IF NOT EXISTS "lastSyncAt" TIMESTAMP(3)`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "GoogleCalendarSync_userId_key" ON "GoogleCalendarSync"("userId")`,
  );

  googleCalendarInfraReady = true;
}

export async function getGoogleCalendarSync(userId: string): Promise<GoogleCalendarSyncRecord | null> {
  await ensureGoogleCalendarInfrastructure();

  const rows = await prisma.$queryRaw<GoogleCalendarSyncRecord[]>`
    SELECT
      "id",
      "userId",
      "accessToken",
      "refreshToken",
      "tokenExpiry",
      "calendarId",
      "lastSyncAt"
    FROM "GoogleCalendarSync"
    WHERE "userId" = ${userId}
    LIMIT 1
  `;

  return rows[0] ?? null;
}

export async function upsertGoogleCalendarSync(
  userId: string,
  payload: {
    accessToken: string;
    refreshToken?: string;
    tokenExpiry: Date;
    calendarId: string;
    lastSyncAt?: Date | null;
  },
): Promise<void> {
  await ensureGoogleCalendarInfrastructure();

  await prisma.$executeRaw`
    INSERT INTO "GoogleCalendarSync" (
      "userId",
      "accessToken",
      "refreshToken",
      "tokenExpiry",
      "calendarId",
      "lastSyncAt"
    )
    VALUES (
      ${userId},
      ${payload.accessToken},
      ${payload.refreshToken ?? ""},
      ${payload.tokenExpiry},
      ${payload.calendarId},
      ${payload.lastSyncAt ?? null}
    )
    ON CONFLICT ("userId")
    DO UPDATE SET
      "accessToken" = EXCLUDED."accessToken",
      "refreshToken" = CASE
        WHEN EXCLUDED."refreshToken" = '' THEN "GoogleCalendarSync"."refreshToken"
        ELSE EXCLUDED."refreshToken"
      END,
      "tokenExpiry" = EXCLUDED."tokenExpiry",
      "calendarId" = EXCLUDED."calendarId",
      "lastSyncAt" = COALESCE(EXCLUDED."lastSyncAt", "GoogleCalendarSync"."lastSyncAt")
  `;
}

export async function removeGoogleCalendarSync(userId: string): Promise<void> {
  await ensureGoogleCalendarInfrastructure();
  await prisma.$executeRaw`
    DELETE FROM "GoogleCalendarSync"
    WHERE "userId" = ${userId}
  `;
}

export async function markGoogleCalendarLastSync(userId: string): Promise<void> {
  await ensureGoogleCalendarInfrastructure();
  await prisma.$executeRaw`
    UPDATE "GoogleCalendarSync"
    SET "lastSyncAt" = NOW()
    WHERE "userId" = ${userId}
  `;
}

async function refreshGoogleAccessToken(
  userId: string,
  record: GoogleCalendarSyncRecord,
): Promise<GoogleCalendarSyncRecord> {
  if (!isGoogleCalendarConfigured()) {
    throw new Error("Google Calendar integration is not configured");
  }
  if (!record.refreshToken) {
    throw new Error("Missing Google refresh token");
  }

  const body = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID!,
    client_secret: env.GOOGLE_CLIENT_SECRET!,
    refresh_token: record.refreshToken,
    grant_type: "refresh_token",
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!response.ok) {
    throw new Error("Google token refresh failed");
  }

  const tokenData = (await response.json()) as {
    access_token: string;
    expires_in: number;
    refresh_token?: string;
  };
  const nextExpiry = new Date(Date.now() + Math.max(300, tokenData.expires_in ?? 3600) * 1000);

  await upsertGoogleCalendarSync(userId, {
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token ?? record.refreshToken,
    tokenExpiry: nextExpiry,
    calendarId: record.calendarId || "primary",
  });

  const refreshed = await getGoogleCalendarSync(userId);
  if (!refreshed) {
    throw new Error("Google sync record missing after token refresh");
  }
  return refreshed;
}

export async function getFreshGoogleCalendarAccess(userId: string): Promise<{
  accessToken: string;
  calendarId: string;
} | null> {
  const current = await getGoogleCalendarSync(userId);
  if (!current) return null;

  const expiresSoon = current.tokenExpiry.getTime() <= Date.now() + 60_000;
  if (!expiresSoon) {
    return {
      accessToken: current.accessToken,
      calendarId: current.calendarId || "primary",
    };
  }

  const refreshed = await refreshGoogleAccessToken(userId, current);
  return {
    accessToken: refreshed.accessToken,
    calendarId: refreshed.calendarId || "primary",
  };
}

