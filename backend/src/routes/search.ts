import { Router } from "express";
import rateLimit from "express-rate-limit";
import { format } from "date-fns";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requestSchema } from "../lib/validate";
import { requireAuth } from "../middleware/auth";
import { validate } from "../middleware/validation";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();
const searchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many search requests. Try again in a minute." },
});

router.use(requireAuth);

type SearchEntityType =
  | "course"
  | "archived_course"
  | "assignment"
  | "exam"
  | "project"
  | "task"
  | "study_session";

type SearchItem = {
  id: string;
  entityType: SearchEntityType;
  title: string;
  subtitle: string;
  updatedAt: Date;
  eventDate?: Date;
};

function sortSearchItems(
  items: SearchItem[],
  sortBy: "title" | "updatedAt" | "eventDate",
  sortDir: "asc" | "desc",
): SearchItem[] {
  const direction = sortDir === "asc" ? 1 : -1;
  return [...items].sort((a, b) => {
    if (sortBy === "title") return direction * a.title.localeCompare(b.title);
    if (sortBy === "eventDate") {
      const dateA = a.eventDate?.getTime() ?? a.updatedAt.getTime();
      const dateB = b.eventDate?.getTime() ?? b.updatedAt.getTime();
      return direction * (dateA - dateB);
    }
    return direction * (a.updatedAt.getTime() - b.updatedAt.getTime());
  });
}

const searchSchema = requestSchema({
  query: z.object({
    q: z.string().trim().min(1).max(500),
    type: z.enum(["all", "course", "assignment", "exam", "project"]).optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(50).optional(),
    sortBy: z.enum(["title", "updatedAt", "eventDate"]).optional(),
    sortDir: z.enum(["asc", "desc"]).optional(),
  }),
});

router.get(
  "/",
  searchLimiter,
  validate(searchSchema),
  asyncHandler(async (req, res) => {
    const { q, type, page, limit, sortBy, sortDir } = req.query as {
      q?: string;
      type?: "all" | "course" | "assignment" | "exam" | "project";
      page?: number;
      limit?: number;
      sortBy?: "title" | "updatedAt" | "eventDate";
      sortDir?: "asc" | "desc";
    };

    const searchQuery = q ?? "";
    const normalizedType = type ?? "all";
    const normalizedPage = page ?? 1;
    const normalizedLimit = limit ?? 10;
    const normalizedSortBy = sortBy ?? "updatedAt";
    const normalizedSortDir = sortDir ?? "desc";
    const userId = req.user!.userId;

    type RawCourse = {
      id: string;
      name: string;
      code: string;
      updatedAt: Date;
      archived: boolean;
      archivedAt: Date | null;
    };
    type RawAssignment = {
      id: string;
      title: string;
      dueDate: Date;
      updatedAt: Date;
      courseName: string | null;
    };
    type RawExam = {
      id: string;
      title: string;
      dateTime: Date;
      updatedAt: Date;
      courseName: string | null;
    };
    type RawProject = {
      id: string;
      name: string;
      dueDate: Date | null;
      updatedAt: Date;
      courseName: string | null;
    };
    type RawTask = {
      id: string;
      title: string;
      dueDate: Date | null;
      updatedAt: Date;
      projectId: string;
      projectName: string;
    };
    type RawStudySession = {
      id: string;
      startTime: Date;
      updatedAt: Date;
      duration: number;
      courseName: string;
      courseCode: string;
    };

    const [courses, assignments, exams, projects, tasks, studySessions] = await Promise.all([
      normalizedType === "all" || normalizedType === "course"
        ? prisma.$queryRaw<RawCourse[]>`
            SELECT c.id, c.name, c.code, c."updatedAt", c."archived", c."archivedAt"
            FROM "Course" c
            WHERE c."userId" = ${userId}
              AND to_tsvector('simple', c.name || ' ' || COALESCE(c.code, '') || ' ' || COALESCE(c.teacher, ''))
                  @@ websearch_to_tsquery('simple', ${searchQuery})
            ORDER BY ts_rank(
              to_tsvector('simple', c.name || ' ' || COALESCE(c.code, '') || ' ' || COALESCE(c.teacher, '')),
              websearch_to_tsquery('simple', ${searchQuery})
            ) DESC
          `
        : Promise.resolve([]),

      normalizedType === "all" || normalizedType === "assignment"
        ? prisma.$queryRaw<RawAssignment[]>`
            SELECT a.id, a.title, a."dueDate", a."updatedAt",
                   co.name AS "courseName"
            FROM "Assignment" a
            LEFT JOIN "Course" co ON co.id = a."courseId"
            WHERE a."userId" = ${userId}
              AND to_tsvector('simple', a.title || ' ' || COALESCE(a.description, ''))
                  @@ websearch_to_tsquery('simple', ${searchQuery})
            ORDER BY ts_rank(
              to_tsvector('simple', a.title || ' ' || COALESCE(a.description, '')),
              websearch_to_tsquery('simple', ${searchQuery})
            ) DESC
          `
        : Promise.resolve([]),

      normalizedType === "all" || normalizedType === "exam"
        ? prisma.$queryRaw<RawExam[]>`
            SELECT e.id, e.title, e."dateTime", e."updatedAt",
                   co.name AS "courseName"
            FROM "Exam" e
            LEFT JOIN "Course" co ON co.id = e."courseId"
            WHERE e."userId" = ${userId}
              AND to_tsvector('simple', e.title || ' ' || COALESCE(e.syllabus, '') || ' ' || COALESCE(e.location, ''))
                  @@ websearch_to_tsquery('simple', ${searchQuery})
            ORDER BY ts_rank(
              to_tsvector('simple', e.title || ' ' || COALESCE(e.syllabus, '') || ' ' || COALESCE(e.location, '')),
              websearch_to_tsquery('simple', ${searchQuery})
            ) DESC
          `
        : Promise.resolve([]),

      normalizedType === "all" || normalizedType === "project"
        ? prisma.$queryRaw<RawProject[]>`
            SELECT p.id, p.name, p."dueDate", p."updatedAt",
                   co.name AS "courseName"
            FROM "Project" p
            LEFT JOIN "Course" co ON co.id = p."courseId"
            WHERE p."userId" = ${userId}
              AND to_tsvector('simple', p.name || ' ' || COALESCE(p.description, ''))
                  @@ websearch_to_tsquery('simple', ${searchQuery})
            ORDER BY ts_rank(
              to_tsvector('simple', p.name || ' ' || COALESCE(p.description, '')),
              websearch_to_tsquery('simple', ${searchQuery})
            ) DESC
          `
        : Promise.resolve([]),

      normalizedType === "all" || normalizedType === "project"
        ? prisma.$queryRaw<RawTask[]>`
            SELECT t.id, t.title, t."dueDate", t."updatedAt",
                   p.id AS "projectId", p.name AS "projectName"
            FROM "ProjectTask" t
            INNER JOIN "Project" p ON p.id = t."projectId"
            WHERE p."userId" = ${userId}
              AND to_tsvector('simple', t.title || ' ' || COALESCE(t.description, ''))
                  @@ websearch_to_tsquery('simple', ${searchQuery})
            ORDER BY ts_rank(
              to_tsvector('simple', t.title || ' ' || COALESCE(t.description, '')),
              websearch_to_tsquery('simple', ${searchQuery})
            ) DESC
          `
        : Promise.resolve([]),

      normalizedType === "all" || normalizedType === "course"
        ? prisma
            .$queryRaw<RawStudySession[]>`
              SELECT s.id, s."startTime", s."createdAt" AS "updatedAt", s."duration",
                     c.name AS "courseName", c.code AS "courseCode"
              FROM "StudySession" s
              INNER JOIN "Course" c ON c.id = s."courseId"
              WHERE s."userId" = ${userId}
                AND to_tsvector('simple', c.name || ' ' || COALESCE(c.code, ''))
                    @@ websearch_to_tsquery('simple', ${searchQuery})
              ORDER BY s."startTime" DESC
              LIMIT 5
            `
            .catch(() => [])
        : Promise.resolve([]),
    ]);

    const allItems: SearchItem[] = [
      ...courses.map((c) => ({
        id: c.id,
        entityType: c.archived ? ("archived_course" as const) : ("course" as const),
        title: c.name,
        subtitle: c.archived
          ? `Archivado · Codigo: ${c.code}${c.archivedAt ? ` · ${format(new Date(c.archivedAt), "dd/MM/yyyy")}` : ""}`
          : `Codigo: ${c.code}`,
        updatedAt: new Date(c.updatedAt),
      })),
      ...assignments.map((a) => ({
        id: a.id,
        entityType: "assignment" as const,
        title: a.title,
        subtitle: `${a.courseName ? `Materia: ${a.courseName}` : "Sin materia"} · vence ${format(new Date(a.dueDate), "dd/MM HH:mm")}`,
        updatedAt: new Date(a.updatedAt),
        eventDate: a.dueDate ? new Date(a.dueDate) : undefined,
      })),
      ...exams.map((e) => ({
        id: e.id,
        entityType: "exam" as const,
        title: e.title,
        subtitle: `${e.courseName ? `Materia: ${e.courseName}` : "Sin materia"} · ${format(new Date(e.dateTime), "dd/MM HH:mm")}`,
        updatedAt: new Date(e.updatedAt),
        eventDate: e.dateTime ? new Date(e.dateTime) : undefined,
      })),
      ...projects.map((project) => ({
        id: project.id,
        entityType: "project" as const,
        title: project.name,
        subtitle: `${project.courseName ? `Materia: ${project.courseName}` : "Sin materia"}${project.dueDate ? ` · vence ${format(new Date(project.dueDate), "dd/MM")}` : ""}`,
        updatedAt: new Date(project.updatedAt),
        eventDate: project.dueDate ? new Date(project.dueDate) : undefined,
      })),
      ...tasks.map((task) => ({
        id: task.id,
        entityType: "task" as const,
        title: task.title,
        subtitle: `Proyecto: ${task.projectName}${task.dueDate ? ` · vence ${format(new Date(task.dueDate), "dd/MM HH:mm")}` : ""}`,
        updatedAt: new Date(task.updatedAt),
        eventDate: task.dueDate ? new Date(task.dueDate) : undefined,
      })),
      ...studySessions.map((session) => ({
        id: session.id,
        entityType: "study_session" as const,
        title: `Sesion de estudio · ${session.courseName}`,
        subtitle: `${session.courseCode} · ${session.duration} min`,
        updatedAt: new Date(session.updatedAt),
        eventDate: session.startTime ? new Date(session.startTime) : undefined,
      })),
    ];

    const sortedItems = sortSearchItems(allItems, normalizedSortBy, normalizedSortDir);
    const total = sortedItems.length;
    const totalPages = Math.ceil(total / normalizedLimit);
    const pagedItems = sortedItems.slice((normalizedPage - 1) * normalizedLimit, normalizedPage * normalizedLimit);

    res.json({
      items: pagedItems.map((item) => ({
        ...item,
        updatedAt: item.updatedAt.toISOString(),
        eventDate: item.eventDate?.toISOString(),
      })),
      counts: {
        courses: courses.filter((course) => !course.archived).length,
        archivedCourses: courses.filter((course) => course.archived).length,
        assignments: assignments.length,
        exams: exams.length,
        projects: projects.length,
        tasks: tasks.length,
        studySessions: studySessions.length,
        total,
      },
      pagination: {
        page: normalizedPage,
        limit: normalizedLimit,
        total,
        totalPages,
        hasNext: normalizedPage < totalPages,
        hasPrev: normalizedPage > 1,
      },
      sort: { sortBy: normalizedSortBy, sortDir: normalizedSortDir },
      filters: { q: searchQuery, type: normalizedType },
    });
  }),
);

export { router as searchRoutes };
