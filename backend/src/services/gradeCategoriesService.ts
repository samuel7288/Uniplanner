import { Prisma } from "@prisma/client";
import { randomUUID } from "crypto";
import { prisma } from "../lib/prisma";

type HttpError = Error & { status?: number };

export type GradeCategoryRecord = {
  id: string;
  userId: string;
  courseId: string;
  name: string;
  weight: number;
  createdAt: Date;
  updatedAt: Date;
};

type GradeCategoryPatch = {
  name?: string;
  weight?: number;
};

let gradeCategoriesInfraReady = false;

function createHttpError(status: number, message: string): HttpError {
  const error = new Error(message) as HttpError;
  error.status = status;
  return error;
}

async function ensureCourseBelongsToUser(courseId: string, userId: string): Promise<void> {
  const course = await prisma.course.findFirst({
    where: {
      id: courseId,
      userId,
      archived: false,
    },
    select: {
      id: true,
    },
  });

  if (!course) {
    throw createHttpError(404, "Course not found");
  }
}

async function getDefinedWeightTotal(userId: string, courseId: string, excludeId?: string): Promise<number> {
  const whereSql = excludeId
    ? Prisma.sql`WHERE "userId" = ${userId} AND "courseId" = ${courseId} AND "id" <> ${excludeId}`
    : Prisma.sql`WHERE "userId" = ${userId} AND "courseId" = ${courseId}`;

  const rows = await prisma.$queryRaw<Array<{ total: number }>>(Prisma.sql`
    SELECT COALESCE(SUM("weight"), 0)::double precision AS total
    FROM "GradeCategory"
    ${whereSql}
  `);

  return rows[0]?.total ?? 0;
}

export async function ensureGradeCategoriesInfrastructure(): Promise<void> {
  if (gradeCategoriesInfraReady) return;

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "GradeCategory" (
      "id" TEXT PRIMARY KEY,
      "userId" TEXT NOT NULL,
      "courseId" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "weight" DOUBLE PRECISION NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "GradeCategory_userId_fkey"
        FOREIGN KEY ("userId")
        REFERENCES "User"("id")
        ON DELETE CASCADE
        ON UPDATE CASCADE,
      CONSTRAINT "GradeCategory_courseId_fkey"
        FOREIGN KEY ("courseId")
        REFERENCES "Course"("id")
        ON DELETE CASCADE
        ON UPDATE CASCADE
    )
  `);

  await prisma.$executeRawUnsafe(
    `ALTER TABLE "GradeCategory" ADD COLUMN IF NOT EXISTS "name" TEXT NOT NULL DEFAULT 'Categoria'`,
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "GradeCategory" ADD COLUMN IF NOT EXISTS "weight" DOUBLE PRECISION NOT NULL DEFAULT 0`,
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "GradeCategory" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`,
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "GradeCategory" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`,
  );

  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "GradeCategory_userId_idx" ON "GradeCategory"("userId")`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "GradeCategory_courseId_idx" ON "GradeCategory"("courseId")`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "GradeCategory_userId_courseId_idx" ON "GradeCategory"("userId", "courseId")`,
  );

  await prisma.$executeRawUnsafe(
    `ALTER TABLE "Grade" ADD COLUMN IF NOT EXISTS "categoryId" TEXT`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "Grade_categoryId_idx" ON "Grade"("categoryId")`,
  );
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'Grade_categoryId_fkey'
      ) THEN
        ALTER TABLE "Grade"
          ADD CONSTRAINT "Grade_categoryId_fkey"
          FOREIGN KEY ("categoryId")
          REFERENCES "GradeCategory"("id")
          ON DELETE SET NULL
          ON UPDATE CASCADE;
      END IF;
    END $$;
  `);

  gradeCategoriesInfraReady = true;
}

export async function listGradeCategoriesForCourse(
  userId: string,
  courseId: string,
): Promise<GradeCategoryRecord[]> {
  await ensureGradeCategoriesInfrastructure();
  await ensureCourseBelongsToUser(courseId, userId);

  return prisma.$queryRaw<GradeCategoryRecord[]>`
    SELECT
      "id",
      "userId",
      "courseId",
      "name",
      "weight",
      "createdAt",
      "updatedAt"
    FROM "GradeCategory"
    WHERE "userId" = ${userId}
      AND "courseId" = ${courseId}
    ORDER BY "createdAt" ASC, "name" ASC
  `;
}

export async function getGradeCategoryForUser(
  userId: string,
  categoryId: string,
): Promise<GradeCategoryRecord | null> {
  await ensureGradeCategoriesInfrastructure();

  const rows = await prisma.$queryRaw<GradeCategoryRecord[]>`
    SELECT
      "id",
      "userId",
      "courseId",
      "name",
      "weight",
      "createdAt",
      "updatedAt"
    FROM "GradeCategory"
    WHERE "id" = ${categoryId}
      AND "userId" = ${userId}
    LIMIT 1
  `;

  return rows[0] ?? null;
}

export async function createGradeCategory(
  userId: string,
  courseId: string,
  payload: { name: string; weight: number },
): Promise<GradeCategoryRecord> {
  await ensureGradeCategoriesInfrastructure();
  await ensureCourseBelongsToUser(courseId, userId);

  const normalizedName = payload.name.trim();
  if (!normalizedName) {
    throw createHttpError(400, "Category name is required");
  }

  const currentTotal = await getDefinedWeightTotal(userId, courseId);
  const nextTotal = currentTotal + payload.weight;
  if (nextTotal > 100.0001) {
    throw createHttpError(400, "Category weights cannot exceed 100%");
  }

  const id = randomUUID();
  const now = new Date();

  await prisma.$executeRaw`
    INSERT INTO "GradeCategory" ("id", "userId", "courseId", "name", "weight", "createdAt", "updatedAt")
    VALUES (${id}, ${userId}, ${courseId}, ${normalizedName}, ${payload.weight}, ${now}, ${now})
  `;

  const created = await getGradeCategoryForUser(userId, id);
  if (!created) {
    throw createHttpError(500, "Category could not be created");
  }

  return created;
}

export async function updateGradeCategory(
  userId: string,
  categoryId: string,
  patch: GradeCategoryPatch,
): Promise<GradeCategoryRecord> {
  await ensureGradeCategoriesInfrastructure();

  const current = await getGradeCategoryForUser(userId, categoryId);
  if (!current) {
    throw createHttpError(404, "Category not found");
  }

  const nextName = patch.name !== undefined ? patch.name.trim() : current.name;
  if (!nextName) {
    throw createHttpError(400, "Category name is required");
  }

  const nextWeight = patch.weight ?? current.weight;
  const totalWithoutCurrent = await getDefinedWeightTotal(userId, current.courseId, current.id);
  if (totalWithoutCurrent + nextWeight > 100.0001) {
    throw createHttpError(400, "Category weights cannot exceed 100%");
  }

  await prisma.$executeRaw`
    UPDATE "GradeCategory"
    SET
      "name" = ${nextName},
      "weight" = ${nextWeight},
      "updatedAt" = NOW()
    WHERE "id" = ${current.id}
      AND "userId" = ${userId}
  `;

  const updated = await getGradeCategoryForUser(userId, current.id);
  if (!updated) {
    throw createHttpError(500, "Category could not be updated");
  }
  return updated;
}

export async function deleteGradeCategory(userId: string, categoryId: string): Promise<void> {
  await ensureGradeCategoriesInfrastructure();

  const current = await getGradeCategoryForUser(userId, categoryId);
  if (!current) {
    throw createHttpError(404, "Category not found");
  }

  await prisma.$transaction([
    prisma.$executeRaw`
      UPDATE "Grade"
      SET "categoryId" = NULL
      WHERE "categoryId" = ${current.id}
    `,
    prisma.$executeRaw`
      DELETE FROM "GradeCategory"
      WHERE "id" = ${current.id}
        AND "userId" = ${userId}
    `,
  ]);
}

