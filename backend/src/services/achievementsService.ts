import { addDays, endOfWeek, startOfDay, startOfWeek } from "date-fns";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";

type AchievementCatalogEntry = {
  type: string;
  name: string;
  description: string;
};

const ACHIEVEMENT_CATALOG: AchievementCatalogEntry[] = [
  { type: "FIRST_SESSION", name: "Primera sesion", description: "Completa tu primera sesion de estudio." },
  { type: "STREAK_3", name: "En racha", description: "Estudia 3 dias consecutivos." },
  { type: "STREAK_7", name: "Semana completa", description: "Estudia 7 dias consecutivos." },
  { type: "STREAK_30", name: "Mes consistente", description: "Estudia 30 dias consecutivos." },
  { type: "WEEKLY_GOAL_1", name: "Meta cumplida", description: "Cumple una meta semanal por primera vez." },
  { type: "NIGHT_OWL", name: "Buho nocturno", description: "Realiza 5 sesiones despues de las 22:00." },
  { type: "EARLY_BIRD", name: "Madrugador", description: "Realiza 5 sesiones antes de las 08:00." },
  { type: "MARATHON", name: "Maraton", description: "Registra una sesion de 3h o mas." },
];

const RECENT_UNLOCK_HOURS = 24;

let achievementsInfraReady = false;

function getAchievementByType(type: string): AchievementCatalogEntry | null {
  return ACHIEVEMENT_CATALOG.find((entry) => entry.type === type) ?? null;
}

async function ensureAchievementsInfrastructure(): Promise<void> {
  if (achievementsInfraReady) return;

  await prisma.$executeRawUnsafe(
    `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "studyStreak" INTEGER NOT NULL DEFAULT 0`,
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "longestStreak" INTEGER NOT NULL DEFAULT 0`,
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastStudyDate" TIMESTAMP(3)`,
  );

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Achievement" (
      "id" SERIAL PRIMARY KEY,
      "userId" TEXT NOT NULL,
      "type" TEXT NOT NULL,
      "unlockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "Achievement_userId_fkey"
        FOREIGN KEY ("userId")
        REFERENCES "User"("id")
        ON DELETE CASCADE
        ON UPDATE CASCADE,
      CONSTRAINT "Achievement_userId_type_key"
        UNIQUE ("userId", "type")
    )
  `);

  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "Achievement_userId_idx" ON "Achievement"("userId")`,
  );

  achievementsInfraReady = true;
}

async function unlockAchievement(userId: string, type: string): Promise<boolean> {
  await prisma.$executeRaw`
    INSERT INTO "Achievement" ("userId", "type", "unlockedAt")
    VALUES (${userId}, ${type}, NOW())
    ON CONFLICT ("userId", "type") DO NOTHING
  `;

  const rows = await prisma.$queryRaw<Array<{ count: number }>>`
    SELECT COUNT(*)::int AS "count"
    FROM "Achievement"
    WHERE "userId" = ${userId}
      AND "type" = ${type}
      AND "unlockedAt" >= NOW() - INTERVAL '5 seconds'
  `;
  return (rows[0]?.count ?? 0) > 0;
}

async function getUserStreak(userId: string): Promise<{ current: number; longest: number; lastStudyDate: Date | null }> {
  await ensureAchievementsInfrastructure();
  const rows = await prisma.$queryRaw<
    Array<{ studyStreak: number; longestStreak: number; lastStudyDate: Date | null }>
  >`
    SELECT
      COALESCE("studyStreak", 0) AS "studyStreak",
      COALESCE("longestStreak", 0) AS "longestStreak",
      "lastStudyDate"
    FROM "User"
    WHERE "id" = ${userId}
    LIMIT 1
  `;
  const row = rows[0];
  return {
    current: row?.studyStreak ?? 0,
    longest: row?.longestStreak ?? 0,
    lastStudyDate: row?.lastStudyDate ?? null,
  };
}

async function hasWeeklyGoalCompletion(userId: string): Promise<boolean> {
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 });

  const rows = await prisma.$queryRaw<Array<{ achieved: boolean }>>`
    SELECT EXISTS (
      SELECT 1
      FROM "StudyGoal" g
      INNER JOIN (
        SELECT "courseId", SUM("duration")::int AS total
        FROM "StudySession"
        WHERE "userId" = ${userId}
          AND "startTime" >= ${weekStart}
          AND "startTime" <= ${weekEnd}
        GROUP BY "courseId"
      ) s ON s."courseId" = g."courseId"
      WHERE g."userId" = ${userId}
        AND s.total >= g."weeklyMinutes"
    ) AS achieved
  `;

  return rows[0]?.achieved ?? false;
}

export async function evaluateAndUnlockAchievements(
  userId: string,
  streakOverride?: number,
): Promise<string[]> {
  await ensureAchievementsInfrastructure();

  const [sessionStatsRows, streakData] = await Promise.all([
    prisma
      .$queryRaw<
        Array<{ total: number; night: number; early: number; marathon: number }>
      >`
        SELECT
          COUNT(*)::int AS total,
          SUM(CASE WHEN EXTRACT(HOUR FROM "startTime") >= 22 THEN 1 ELSE 0 END)::int AS night,
          SUM(CASE WHEN EXTRACT(HOUR FROM "startTime") < 8 THEN 1 ELSE 0 END)::int AS early,
          SUM(CASE WHEN "duration" >= 180 THEN 1 ELSE 0 END)::int AS marathon
        FROM "StudySession"
        WHERE "userId" = ${userId}
      `
      .catch(() => [{ total: 0, night: 0, early: 0, marathon: 0 }]),
    getUserStreak(userId),
  ]);

  const stats = sessionStatsRows[0] ?? { total: 0, night: 0, early: 0, marathon: 0 };
  const streak = streakOverride ?? streakData.current;
  const weeklyGoalAchieved = await hasWeeklyGoalCompletion(userId).catch(() => false);

  const toUnlock: string[] = [];
  if (stats.total >= 1) toUnlock.push("FIRST_SESSION");
  if (streak >= 3) toUnlock.push("STREAK_3");
  if (streak >= 7) toUnlock.push("STREAK_7");
  if (streak >= 30) toUnlock.push("STREAK_30");
  if (weeklyGoalAchieved) toUnlock.push("WEEKLY_GOAL_1");
  if ((stats.night ?? 0) >= 5) toUnlock.push("NIGHT_OWL");
  if ((stats.early ?? 0) >= 5) toUnlock.push("EARLY_BIRD");
  if ((stats.marathon ?? 0) >= 1) toUnlock.push("MARATHON");

  const newlyUnlocked: string[] = [];
  for (const type of toUnlock) {
    const inserted = await unlockAchievement(userId, type);
    if (inserted) newlyUnlocked.push(type);
  }

  return newlyUnlocked;
}

export async function processDailyStudyStreaks(now: Date): Promise<void> {
  await ensureAchievementsInfrastructure();
  if (!(now.getHours() === 0 && now.getMinutes() === 0)) return;

  const dayToCheck = startOfDay(addDays(now, -1));
  const previousDay = startOfDay(addDays(dayToCheck, -1));

  const [users, studiedRows] = await Promise.all([
    prisma.$queryRaw<
      Array<{ id: string; studyStreak: number; longestStreak: number; lastStudyDate: Date | null }>
    >`
      SELECT
        "id",
        COALESCE("studyStreak", 0) AS "studyStreak",
        COALESCE("longestStreak", 0) AS "longestStreak",
        "lastStudyDate"
      FROM "User"
    `,
    prisma
      .$queryRaw<Array<{ userId: string }>>`
        SELECT DISTINCT "userId" AS "userId"
        FROM "StudySession"
        WHERE "startTime" >= ${dayToCheck}
          AND "startTime" <= ${new Date(dayToCheck.getTime() + 24 * 60 * 60 * 1000 - 1)}
      `
      .catch(() => []),
  ]);

  const studiedSet = new Set(studiedRows.map((row) => row.userId));

  for (const user of users) {
    const studiedYesterday = studiedSet.has(user.id);
    const lastDate = user.lastStudyDate ? startOfDay(new Date(user.lastStudyDate)) : null;

    if (studiedYesterday) {
      if (lastDate && lastDate.getTime() === dayToCheck.getTime()) {
        continue;
      }

      const extendsStreak = lastDate && lastDate.getTime() === previousDay.getTime();
      const nextStreak = extendsStreak ? user.studyStreak + 1 : 1;
      const nextLongest = Math.max(user.longestStreak, nextStreak);

      await prisma.$executeRaw`
        UPDATE "User"
        SET
          "studyStreak" = ${nextStreak},
          "longestStreak" = ${nextLongest},
          "lastStudyDate" = ${dayToCheck}
        WHERE "id" = ${user.id}
      `;

      await evaluateAndUnlockAchievements(user.id, nextStreak);
      continue;
    }

    if (user.studyStreak !== 0) {
      await prisma.$executeRaw`
        UPDATE "User"
        SET "studyStreak" = 0
        WHERE "id" = ${user.id}
      `;
    }
  }
}

export async function getAchievementsSummary(userId: string) {
  await ensureAchievementsInfrastructure();
  await evaluateAndUnlockAchievements(userId);

  const [streak, unlockedRows] = await Promise.all([
    getUserStreak(userId),
    prisma.$queryRaw<Array<{ type: string; unlockedAt: Date }>>`
      SELECT "type", "unlockedAt"
      FROM "Achievement"
      WHERE "userId" = ${userId}
      ORDER BY "unlockedAt" DESC
    `,
  ]);

  const unlockedByType = new Map(unlockedRows.map((row) => [row.type, row.unlockedAt]));
  const recentThreshold = addDays(new Date(), -1);

  const items = ACHIEVEMENT_CATALOG.map((entry) => {
    const unlockedAt = unlockedByType.get(entry.type);
    return {
      type: entry.type,
      name: entry.name,
      description: entry.description,
      unlocked: Boolean(unlockedAt),
      unlockedAt: unlockedAt ? unlockedAt.toISOString() : null,
    };
  });

  const recentlyUnlocked = unlockedRows
    .filter((row) => row.unlockedAt >= recentThreshold)
    .map((row) => {
      const meta = getAchievementByType(row.type);
      return {
        type: row.type,
        name: meta?.name ?? row.type,
        unlockedAt: row.unlockedAt.toISOString(),
      };
    });

  return {
    streak: {
      current: streak.current,
      longest: streak.longest,
      lastStudyDate: streak.lastStudyDate?.toISOString() ?? null,
    },
    items,
    recentlyUnlocked,
    metadata: {
      recentWindowHours: RECENT_UNLOCK_HOURS,
    },
  };
}

