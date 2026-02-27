import { prisma } from "../lib/prisma";
import { calculateCourseProjection } from "../utils/grading";
import { ensureGradeCategoriesInfrastructure } from "./gradeCategoriesService";
import type {
  AddSessionBody,
  ArchiveSemesterBody,
  CreateCourseBody,
  ImportCourseRow,
  UpdateCourseBody,
  UpdateSessionBody,
} from "../validators/coursesValidators";

type HttpError = Error & { status?: number };

function createHttpError(status: number, message: string): HttpError {
  const error = new Error(message) as HttpError;
  error.status = status;
  return error;
}

type CourseGradeRow = {
  id: string;
  name: string;
  score: number;
  maxScore: number;
  weight: number;
  categoryId: string | null;
};

type CourseGradeCategoryRow = {
  id: string;
  name: string;
  weight: number;
};

async function listCourseGradesWithCategory(
  userId: string,
  courseId: string,
): Promise<CourseGradeRow[]> {
  await ensureGradeCategoriesInfrastructure();

  return prisma.$queryRaw<CourseGradeRow[]>`
    SELECT
      "id",
      "name",
      "score",
      "maxScore",
      "weight",
      "categoryId"
    FROM "Grade"
    WHERE "userId" = ${userId}
      AND "courseId" = ${courseId}
    ORDER BY "createdAt" ASC
  `;
}

async function listCourseGradeCategories(
  userId: string,
  courseId: string,
): Promise<CourseGradeCategoryRow[]> {
  await ensureGradeCategoriesInfrastructure();

  return prisma.$queryRaw<CourseGradeCategoryRow[]>`
    SELECT
      "id",
      "name",
      "weight"
    FROM "GradeCategory"
    WHERE "userId" = ${userId}
      AND "courseId" = ${courseId}
    ORDER BY "createdAt" ASC, "name" ASC
  `;
}

export async function getWeeklySchedule(userId: string) {
  const courses = await prisma.course.findMany({
    where: {
      userId,
      archived: false,
    },
    include: { classSessions: true },
    orderBy: { name: "asc" },
  });

  return courses.flatMap((course) =>
    course.classSessions.map((session) => ({
      id: session.id,
      courseId: course.id,
      courseName: course.name,
      code: course.code,
      color: course.color,
      dayOfWeek: session.dayOfWeek,
      startTime: session.startTime,
      endTime: session.endTime,
      room: session.room,
      modality: session.modality,
    })),
  );
}

export async function listCourses(userId: string) {
  return prisma.course.findMany({
    where: {
      userId,
      archived: false,
    },
    include: {
      classSessions: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}

export async function createCourse(userId: string, payload: CreateCourseBody) {
  const { classSessions, ...courseData } = payload;

  return prisma.course.create({
    data: {
      ...courseData,
      userId,
      classSessions:
        classSessions && classSessions.length > 0
          ? {
              create: classSessions,
            }
          : undefined,
    },
    include: {
      classSessions: true,
    },
  });
}

export async function getCourseById(userId: string, courseId: string) {
  const course = await prisma.course.findFirst({
    where: {
      id: courseId,
      userId,
      archived: false,
    },
    include: {
      classSessions: true,
      assignments: true,
      exams: true,
      grades: true,
      projects: true,
    },
  });

  if (!course) throw createHttpError(404, "Course not found");
  return course;
}

export async function updateCourse(userId: string, courseId: string, payload: UpdateCourseBody) {
  const course = await prisma.course.findFirst({
    where: {
      id: courseId,
      userId,
      archived: false,
    },
  });

  if (!course) throw createHttpError(404, "Course not found");

  return prisma.course.update({
    where: { id: course.id },
    data: payload,
    include: {
      classSessions: true,
    },
  });
}

export async function deleteCourse(userId: string, courseId: string): Promise<void> {
  const course = await prisma.course.findFirst({
    where: {
      id: courseId,
      userId,
      archived: false,
    },
  });

  if (!course) throw createHttpError(404, "Course not found");
  await prisma.course.delete({ where: { id: course.id } });
}

export async function addClassSession(userId: string, courseId: string, payload: AddSessionBody) {
  const course = await prisma.course.findFirst({
    where: {
      id: courseId,
      userId,
      archived: false,
    },
  });

  if (!course) throw createHttpError(404, "Course not found");

  return prisma.classSession.create({
    data: {
      ...payload,
      courseId: course.id,
    },
  });
}

export async function updateClassSession(userId: string, sessionId: string, payload: UpdateSessionBody) {
  const session = await prisma.classSession.findUnique({
    where: { id: sessionId },
    include: {
      course: true,
    },
  });

  if (!session || session.course.userId !== userId) {
    throw createHttpError(404, "Class session not found");
  }

  return prisma.classSession.update({
    where: { id: session.id },
    data: payload,
  });
}

export async function deleteClassSession(userId: string, sessionId: string): Promise<void> {
  const session = await prisma.classSession.findUnique({
    where: { id: sessionId },
    include: { course: true },
  });

  if (!session || session.course.userId !== userId) {
    throw createHttpError(404, "Class session not found");
  }

  await prisma.classSession.delete({ where: { id: session.id } });
}

export async function getGradeProjection(userId: string, courseId: string, target: number) {
  const course = await prisma.course.findFirst({
    where: {
      id: courseId,
      userId,
      archived: false,
    },
    select: {
      id: true,
      name: true,
    },
  });

  if (!course) throw createHttpError(404, "Course not found");

  const [grades, categories] = await Promise.all([
    listCourseGradesWithCategory(userId, course.id),
    listCourseGradeCategories(userId, course.id),
  ]);

  const projection = calculateCourseProjection(
    grades.map((grade) => ({
      score: grade.score,
      maxScore: grade.maxScore,
      weight: grade.weight,
      categoryId: grade.categoryId,
    })),
    target,
    {
      categories: categories.map((category) => ({
        id: category.id,
        name: category.name,
        weight: category.weight,
      })),
    },
  );

  const categoriesBreakdown = categories.map((category) => {
    const gradesInCategory = grades.filter((grade) => grade.categoryId === category.id);
    const average =
      gradesInCategory.length > 0
        ? Number(
            (
              gradesInCategory.reduce((sum, grade) => sum + (grade.score / grade.maxScore) * 10, 0) /
              gradesInCategory.length
            ).toFixed(2),
          )
        : null;

    return {
      id: category.id,
      name: category.name,
      weight: Number(category.weight.toFixed(2)),
      average,
      coveredCount: gradesInCategory.length,
      grades: gradesInCategory.map((grade) => ({
        id: grade.id,
        name: grade.name,
        score: grade.score,
        maxScore: grade.maxScore,
      })),
    };
  });

  return {
    courseId: course.id,
    courseName: course.name,
    target,
    ...projection,
    categories: categoriesBreakdown,
  };
}

export async function importCourses(userId: string, rows: ImportCourseRow[]) {
  return prisma.$transaction(async (tx) => {
    const errors: string[] = [];
    let created = 0;
    let skipped = 0;

    const normalizedRows = rows.map((row) => ({
      ...row,
      name: row.name.trim(),
      code: row.code.trim(),
      teacher: row.teacher?.trim() || null,
      semester: row.semester?.trim() || null,
      color: row.color?.trim() || null,
      sessions: row.sessions?.map((session) => ({
        ...session,
        room: session.room?.trim() || null,
      })) ?? [],
    }));

    const importCodes = Array.from(new Set(normalizedRows.map((row) => row.code)));
    const existingCodes = new Set(
      (
        await tx.course.findMany({
          where: {
            userId,
            archived: false,
            code: { in: importCodes },
          },
          select: { code: true },
        })
      ).map((course) => course.code),
    );

    const seenCodes = new Set<string>();

    for (const row of normalizedRows) {
      if (seenCodes.has(row.code) || existingCodes.has(row.code)) {
        skipped += 1;
        continue;
      }

      seenCodes.add(row.code);

      await tx.course.create({
        data: {
          userId,
          name: row.name,
          code: row.code,
          teacher: row.teacher,
          credits: row.credits ?? null,
          color: row.color,
          semester: row.semester,
          classSessions:
            row.sessions.length > 0
              ? {
                  create: row.sessions.map((session) => ({
                    dayOfWeek: session.dayOfWeek,
                    startTime: session.startTime,
                    endTime: session.endTime,
                    room: session.room,
                    modality: session.modality,
                  })),
                }
              : undefined,
        },
      });

      created += 1;
    }

    return { created, skipped, errors };
  });
}

export async function archiveSemester(userId: string, payload: ArchiveSemesterBody) {
  const now = new Date();
  const requestedSemester = payload.semester?.trim() || null;

  if (requestedSemester) {
    const result = await prisma.course.updateMany({
      where: {
        userId,
        archived: false,
        semester: requestedSemester,
      },
      data: {
        archived: true,
        archivedAt: now,
      },
    });

    return {
      semester: requestedSemester,
      archivedCount: result.count,
    };
  }

  const activeCourses = await prisma.course.findMany({
    where: {
      userId,
      archived: false,
    },
    orderBy: {
      createdAt: "desc",
    },
    select: {
      semester: true,
    },
  });

  if (activeCourses.length === 0) {
    return {
      semester: null,
      archivedCount: 0,
    };
  }

  let inferredSemester: string | null = null;
  for (const course of activeCourses) {
    const normalized = course.semester?.trim();
    if (normalized) {
      inferredSemester = normalized;
      break;
    }
  }

  const result = await prisma.course.updateMany({
    where: {
      userId,
      archived: false,
      ...(inferredSemester ? { semester: inferredSemester } : {}),
    },
    data: {
      archived: true,
      archivedAt: now,
    },
  });

  return {
    semester: inferredSemester,
    archivedCount: result.count,
  };
}

type SemesterHistoryCourse = {
  id: string;
  name: string;
  code: string;
  finalAverage: number | null;
  coveredWeight: number;
  gradesCount: number;
  archivedAt: string | null;
};

type SemesterHistoryBucket = {
  semester: string;
  archivedAt: Date;
  courses: SemesterHistoryCourse[];
};

type RetrospectiveInsightSummary = {
  samples: number;
  avgWhenOver6h: number | null;
  avgWhenUnder3h: number | null;
  bestCourseByEfficiency: string | null;
};

async function buildRetrospectiveInsights(userId: string): Promise<RetrospectiveInsightSummary> {
  try {
    const rows = await prisma.$queryRaw<
      Array<{
        courseId: string | null;
        courseName: string | null;
        obtainedGrade: number;
        studyHoursLogged: number;
      }>
    >`
      SELECT
        e."courseId",
        c."name" AS "courseName",
        e."obtainedGrade",
        e."studyHoursLogged"
      FROM "Exam" e
      LEFT JOIN "Course" c ON c."id" = e."courseId"
      WHERE e."userId" = ${userId}
        AND e."obtainedGrade" IS NOT NULL
        AND e."studyHoursLogged" IS NOT NULL
    `;

    if (rows.length === 0) {
      return {
        samples: 0,
        avgWhenOver6h: null,
        avgWhenUnder3h: null,
        bestCourseByEfficiency: null,
      };
    }

    const over6 = rows.filter((row) => row.studyHoursLogged > 6);
    const under3 = rows.filter((row) => row.studyHoursLogged < 3);

    const efficiencyByCourse = new Map<string, { totalRatio: number; count: number }>();
    for (const row of rows) {
      if (!row.courseName || row.studyHoursLogged <= 0) continue;
      const ratio = row.obtainedGrade / row.studyHoursLogged;
      const current = efficiencyByCourse.get(row.courseName) ?? { totalRatio: 0, count: 0 };
      current.totalRatio += ratio;
      current.count += 1;
      efficiencyByCourse.set(row.courseName, current);
    }

    let bestCourseByEfficiency: string | null = null;
    let bestRatio = -1;
    for (const [courseName, aggregate] of efficiencyByCourse.entries()) {
      if (aggregate.count === 0) continue;
      const averageRatio = aggregate.totalRatio / aggregate.count;
      if (averageRatio > bestRatio) {
        bestRatio = averageRatio;
        bestCourseByEfficiency = courseName;
      }
    }

    return {
      samples: rows.length,
      avgWhenOver6h:
        over6.length > 0
          ? Number((over6.reduce((sum, row) => sum + row.obtainedGrade, 0) / over6.length).toFixed(2))
          : null,
      avgWhenUnder3h:
        under3.length > 0
          ? Number((under3.reduce((sum, row) => sum + row.obtainedGrade, 0) / under3.length).toFixed(2))
          : null,
      bestCourseByEfficiency,
    };
  } catch {
    return {
      samples: 0,
      avgWhenOver6h: null,
      avgWhenUnder3h: null,
      bestCourseByEfficiency: null,
    };
  }
}

export async function getArchivedCoursesHistory(userId: string) {
  const archivedCourses = await prisma.course.findMany({
    where: {
      userId,
      archived: true,
    },
    include: {
      grades: true,
    },
    orderBy: [
      { archivedAt: "desc" },
      { createdAt: "desc" },
    ],
  });

  const grouped = new Map<string, SemesterHistoryBucket>();

  for (const course of archivedCourses) {
    const semesterLabel = course.semester?.trim() || "Sin semestre";
    const archiveDate = course.archivedAt ?? course.updatedAt;

    const existing = grouped.get(semesterLabel);
    if (!existing) {
      grouped.set(semesterLabel, {
        semester: semesterLabel,
        archivedAt: archiveDate,
        courses: [],
      });
    } else if (archiveDate > existing.archivedAt) {
      existing.archivedAt = archiveDate;
    }

    const projection = calculateCourseProjection(
      course.grades.map((grade) => ({
        score: grade.score,
        maxScore: grade.maxScore,
        weight: grade.weight,
      })),
    );

    grouped.get(semesterLabel)!.courses.push({
      id: course.id,
      name: course.name,
      code: course.code,
      finalAverage: projection.coveredWeight > 0 ? Number(projection.currentAverage.toFixed(2)) : null,
      coveredWeight: Number(projection.coveredWeight.toFixed(2)),
      gradesCount: course.grades.length,
      archivedAt: course.archivedAt?.toISOString() ?? null,
    });
  }

  const semesters = Array.from(grouped.values())
    .map((bucket) => {
      const courses = bucket.courses.sort((a, b) => a.name.localeCompare(b.name));
      const gradedCourses = courses.filter((course) => course.finalAverage !== null);
      const gpa =
        gradedCourses.length > 0
          ? Number(
              (
                gradedCourses.reduce((acc, course) => acc + (course.finalAverage ?? 0), 0) /
                gradedCourses.length
              ).toFixed(2),
            )
          : null;

      return {
        semester: bucket.semester,
        archivedAt: bucket.archivedAt.toISOString(),
        gpa,
        courseCount: courses.length,
        gradedCourses: gradedCourses.length,
        courses,
      };
    })
    .sort((a, b) => b.archivedAt.localeCompare(a.archivedAt));

  const chronological = [...semesters].sort((a, b) => a.archivedAt.localeCompare(b.archivedAt));
  let cumulativeSum = 0;
  let cumulativeCount = 0;

  const cumulative = chronological.map((semester) => {
    if (semester.gpa !== null) {
      cumulativeSum += semester.gpa;
      cumulativeCount += 1;
    }

    return {
      semester: semester.semester,
      gpa: semester.gpa,
      cumulativeGpa: cumulativeCount > 0 ? Number((cumulativeSum / cumulativeCount).toFixed(2)) : null,
    };
  });

  const insights = await buildRetrospectiveInsights(userId);

  return {
    semesters,
    cumulative,
    insights,
  };
}
