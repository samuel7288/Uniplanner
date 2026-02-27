import { prisma } from "../lib/prisma";
import { calculateCourseProjection } from "../utils/grading";
import type {
  AddSessionBody,
  CreateCourseBody,
  UpdateCourseBody,
  UpdateSessionBody,
} from "../validators/coursesValidators";

type HttpError = Error & { status?: number };

function createHttpError(status: number, message: string): HttpError {
  const error = new Error(message) as HttpError;
  error.status = status;
  return error;
}

export async function getWeeklySchedule(userId: string) {
  const courses = await prisma.course.findMany({
    where: { userId },
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
    where: { userId },
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
    },
    include: {
      grades: true,
    },
  });

  if (!course) throw createHttpError(404, "Course not found");

  const projection = calculateCourseProjection(
    course.grades.map((grade) => ({
      score: grade.score,
      maxScore: grade.maxScore,
      weight: grade.weight,
    })),
    target,
  );

  return {
    courseId: course.id,
    courseName: course.name,
    target,
    ...projection,
  };
}
