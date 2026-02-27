import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";

export type StudyReminderPreference = {
  userId: string;
  enabled: boolean;
  minDaysWithoutStudy: number;
};

const DEFAULT_STUDY_REMINDER_PREFERENCE: Omit<StudyReminderPreference, "userId"> = {
  enabled: true,
  minDaysWithoutStudy: 3,
};

let studyReminderPreferencesReady = false;

async function ensureStudyReminderPreferencesTable(): Promise<void> {
  if (studyReminderPreferencesReady) return;

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "StudyReminderPreference" (
      "userId" TEXT PRIMARY KEY,
      "enabled" BOOLEAN NOT NULL DEFAULT true,
      "minDaysWithoutStudy" INTEGER NOT NULL DEFAULT 3,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "StudyReminderPreference_userId_fkey"
        FOREIGN KEY ("userId")
        REFERENCES "User"("id")
        ON DELETE CASCADE
        ON UPDATE CASCADE
    )
  `);

  await prisma.$executeRawUnsafe(
    `ALTER TABLE "StudyReminderPreference" ADD COLUMN IF NOT EXISTS "enabled" BOOLEAN NOT NULL DEFAULT true`,
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "StudyReminderPreference" ADD COLUMN IF NOT EXISTS "minDaysWithoutStudy" INTEGER NOT NULL DEFAULT 3`,
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "StudyReminderPreference" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`,
  );

  studyReminderPreferencesReady = true;
}

export async function getStudyReminderPreference(userId: string): Promise<StudyReminderPreference> {
  await ensureStudyReminderPreferencesTable();

  const rows = await prisma.$queryRaw<
    Array<{ userId: string; enabled: boolean; minDaysWithoutStudy: number }>
  >`
    SELECT "userId", "enabled", "minDaysWithoutStudy"
    FROM "StudyReminderPreference"
    WHERE "userId" = ${userId}
    LIMIT 1
  `;

  const row = rows[0];
  if (!row) {
    return {
      userId,
      ...DEFAULT_STUDY_REMINDER_PREFERENCE,
    };
  }

  return row;
}

export async function listStudyReminderPreferences(
  userIds: string[],
): Promise<Map<string, StudyReminderPreference>> {
  await ensureStudyReminderPreferencesTable();

  const defaults = new Map<string, StudyReminderPreference>();
  for (const userId of userIds) {
    defaults.set(userId, {
      userId,
      ...DEFAULT_STUDY_REMINDER_PREFERENCE,
    });
  }
  if (userIds.length === 0) return defaults;

  const rows = await prisma.$queryRaw<
    Array<{ userId: string; enabled: boolean; minDaysWithoutStudy: number }>
  >(
    Prisma.sql`
      SELECT "userId", "enabled", "minDaysWithoutStudy"
      FROM "StudyReminderPreference"
      WHERE "userId" IN (${Prisma.join(userIds)})
    `,
  );

  for (const row of rows) {
    defaults.set(row.userId, row);
  }

  return defaults;
}

export async function upsertStudyReminderPreference(
  userId: string,
  patch: Partial<Omit<StudyReminderPreference, "userId">>,
): Promise<StudyReminderPreference> {
  await ensureStudyReminderPreferencesTable();

  const current = await getStudyReminderPreference(userId);
  const nextEnabled = patch.enabled ?? current.enabled;
  const nextMinDays = patch.minDaysWithoutStudy ?? current.minDaysWithoutStudy;

  await prisma.$executeRaw`
    INSERT INTO "StudyReminderPreference" ("userId", "enabled", "minDaysWithoutStudy", "updatedAt")
    VALUES (${userId}, ${nextEnabled}, ${nextMinDays}, NOW())
    ON CONFLICT ("userId")
    DO UPDATE SET
      "enabled" = EXCLUDED."enabled",
      "minDaysWithoutStudy" = EXCLUDED."minDaysWithoutStudy",
      "updatedAt" = NOW()
  `;

  return {
    userId,
    enabled: nextEnabled,
    minDaysWithoutStudy: nextMinDays,
  };
}

