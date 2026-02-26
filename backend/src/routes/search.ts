import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { validate } from "../middleware/validation";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

router.use(requireAuth);

type SearchEntityType = "course" | "assignment" | "exam";
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

router.get(
  "/",
  validate(
    z.object({
      body: z.object({}).passthrough(),
      params: z.object({}).passthrough(),
      query: z.object({
        q: z.string().trim().min(1).max(500),
        type: z.enum(["all", "course", "assignment", "exam"]).optional(),
        page: z.coerce.number().int().min(1).optional(),
        limit: z.coerce.number().int().min(1).max(50).optional(),
        sortBy: z.enum(["title", "updatedAt", "eventDate"]).optional(),
        sortDir: z.enum(["asc", "desc"]).optional(),
      }),
    }),
  ),
  asyncHandler(async (req, res) => {
    const {
      q,
      type,
      page,
      limit,
      sortBy,
      sortDir,
    } = req.query as {
      q?: string;
      type?: "all" | "course" | "assignment" | "exam";
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

    // Use PostgreSQL Full-Text Search via websearch_to_tsquery for better relevance
    // Falls back gracefully when no results are found.
    type RawCourse = { id: string; name: string; code: string; updatedAt: Date };
    type RawAssignment = { id: string; title: string; dueDate: Date; updatedAt: Date; courseName: string | null };
    type RawExam = { id: string; title: string; dateTime: Date; updatedAt: Date; courseName: string | null };

    const [courses, assignments, exams] = await Promise.all([
      normalizedType === "all" || normalizedType === "course"
        ? prisma.$queryRaw<RawCourse[]>`
            SELECT c.id, c.name, c.code, c."updatedAt"
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
    ]);

    const allItems: SearchItem[] = [
      ...courses.map((c) => ({
        id: c.id,
        entityType: "course" as const,
        title: c.name,
        subtitle: `Codigo: ${c.code}`,
        updatedAt: new Date(c.updatedAt),
      })),
      ...assignments.map((a) => ({
        id: a.id,
        entityType: "assignment" as const,
        title: a.title,
        subtitle: a.courseName ? `Materia: ${a.courseName}` : "Sin materia",
        updatedAt: new Date(a.updatedAt),
        eventDate: a.dueDate ? new Date(a.dueDate) : undefined,
      })),
      ...exams.map((e) => ({
        id: e.id,
        entityType: "exam" as const,
        title: e.title,
        subtitle: e.courseName ? `Materia: ${e.courseName}` : "Sin materia",
        updatedAt: new Date(e.updatedAt),
        eventDate: e.dateTime ? new Date(e.dateTime) : undefined,
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
        courses: courses.length,
        assignments: assignments.length,
        exams: exams.length,
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
