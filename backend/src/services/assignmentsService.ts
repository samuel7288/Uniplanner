import { AssignmentStatus, Prisma } from "@prisma/client";
import { endOfDay, parseISO, startOfDay } from "date-fns";
import { prisma } from "../lib/prisma";
import { notifyStudyGroupMembersForEvaluation } from "./studyGroupsService";
import type {
  CreateAssignmentBody,
  ListAssignmentsQuery,
  UpdateAssignmentBody,
} from "../validators/assignmentsValidators";

type HttpError = Error & { status?: number };

function createHttpError(status: number, message: string): HttpError {
  const error = new Error(message) as HttpError;
  error.status = status;
  return error;
}

type AssignmentWithRelations = Prisma.AssignmentGetPayload<{
  include: {
    course: true;
    assignmentTags: {
      include: {
        tag: true;
      };
    };
  };
}>;

let assignmentEstimatedMinutesReady = false;

function mapAssignment(assignment: AssignmentWithRelations, estimatedMinutes: number | null = null) {
  return {
    ...assignment,
    estimatedMinutes,
    tags: assignment.assignmentTags.map((entry) => entry.tag.name),
  };
}

async function ensureCourseBelongsToUser(courseId: string, userId: string): Promise<void> {
  const course = await prisma.course.findFirst({
    where: {
      id: courseId,
      userId,
    },
  });

  if (!course) throw createHttpError(400, "Invalid courseId");
}

async function syncTags(assignmentId: string, userId: string, tagNames: string[] | undefined): Promise<void> {
  if (!tagNames) return;

  const normalized = Array.from(
    new Set(tagNames.map((name) => name.trim().toLowerCase()).filter((name) => name.length > 0)),
  );

  await prisma.assignmentTag.deleteMany({
    where: {
      assignmentId,
    },
  });

  for (const tagName of normalized) {
    const tag = await prisma.tag.upsert({
      where: {
        userId_name: {
          userId,
          name: tagName,
        },
      },
      create: {
        userId,
        name: tagName,
      },
      update: {},
    });

    await prisma.assignmentTag.create({
      data: {
        assignmentId,
        tagId: tag.id,
      },
    });
  }
}

async function ensureAssignmentEstimatedMinutesColumn(): Promise<void> {
  if (assignmentEstimatedMinutesReady) return;

  await prisma.$executeRawUnsafe(
    `ALTER TABLE "Assignment" ADD COLUMN IF NOT EXISTS "estimatedMinutes" INTEGER`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "Assignment_userId_estimatedMinutes_idx" ON "Assignment"("userId", "estimatedMinutes")`,
  );

  assignmentEstimatedMinutesReady = true;
}

async function readEstimatedMinutesByIds(
  ids: string[],
): Promise<Map<string, number | null>> {
  if (!ids.length) return new Map();

  const rows = await prisma.$queryRaw<Array<{ id: string; estimatedMinutes: number | null }>>(
    Prisma.sql`
      SELECT a."id", a."estimatedMinutes"
      FROM "Assignment" a
      WHERE a."id" IN (${Prisma.join(ids)})
    `,
  );

  return new Map(rows.map((row) => [row.id, row.estimatedMinutes ?? null]));
}

async function setEstimatedMinutes(assignmentId: string, estimatedMinutes: number | null): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "Assignment"
    SET "estimatedMinutes" = ${estimatedMinutes}
    WHERE "id" = ${assignmentId}
  `;
}

export async function listAssignmentsForUser(userId: string, query: ListAssignmentsQuery) {
  await ensureAssignmentEstimatedMinutesColumn();

  const { status, courseId, q, dueFrom, dueTo, page, limit, sortBy, sortDir } = query;

  const normalizedPage = page ?? 1;
  const normalizedLimit = limit ?? 10;
  const normalizedSortBy = sortBy ?? "dueDate";
  const normalizedSortDir = sortDir ?? "asc";

  const where: Prisma.AssignmentWhereInput = {
    userId,
    status,
    courseId,
    title: q
      ? {
          contains: q,
          mode: "insensitive",
        }
      : undefined,
    dueDate:
      dueFrom || dueTo
        ? {
            gte: dueFrom ? parseISO(dueFrom) : undefined,
            lte: dueTo ? parseISO(dueTo) : undefined,
          }
        : undefined,
  };

  const [total, assignments] = await prisma.$transaction([
    prisma.assignment.count({ where }),
    prisma.assignment.findMany({
      where,
      include: {
        course: true,
        assignmentTags: {
          include: {
            tag: true,
          },
        },
      },
      orderBy: {
        [normalizedSortBy]: normalizedSortDir,
      } as Prisma.AssignmentOrderByWithRelationInput,
      skip: (normalizedPage - 1) * normalizedLimit,
      take: normalizedLimit,
    }),
  ]);

  const totalPages = Math.ceil(total / normalizedLimit);
  const estimatedMinutesById = await readEstimatedMinutesByIds(assignments.map((assignment) => assignment.id));

  return {
    items: assignments.map((assignment) =>
      mapAssignment(assignment, estimatedMinutesById.get(assignment.id) ?? null),
    ),
    pagination: {
      page: normalizedPage,
      limit: normalizedLimit,
      total,
      totalPages,
      hasNext: normalizedPage < totalPages,
      hasPrev: normalizedPage > 1,
    },
    sort: {
      sortBy: normalizedSortBy,
      sortDir: normalizedSortDir,
    },
  };
}

export async function getFocusAssignments(userId: string) {
  await ensureAssignmentEstimatedMinutesColumn();

  const now = new Date();
  const assignments = await prisma.assignment.findMany({
    where: {
      userId,
      dueDate: {
        gte: startOfDay(now),
        lte: endOfDay(now),
      },
      status: {
        not: AssignmentStatus.DONE,
      },
    },
    include: {
      course: true,
    },
    orderBy: {
      dueDate: "asc",
    },
  });

  const estimatedMinutesById = await readEstimatedMinutesByIds(assignments.map((assignment) => assignment.id));
  return assignments.map((assignment) => ({
    ...assignment,
    estimatedMinutes: estimatedMinutesById.get(assignment.id) ?? null,
  }));
}

export async function createAssignment(userId: string, payload: CreateAssignmentBody) {
  await ensureAssignmentEstimatedMinutesColumn();

  const { tags, attachmentLinks, estimatedMinutes, ...assignmentPayload } = payload;

  if (assignmentPayload.courseId) {
    await ensureCourseBelongsToUser(assignmentPayload.courseId, userId);
  }

  const assignment = await prisma.assignment.create({
    data: {
      ...assignmentPayload,
      userId,
      attachmentLinks: attachmentLinks ?? [],
    },
    include: {
      course: true,
      assignmentTags: {
        include: {
          tag: true,
        },
      },
    },
  });

  if (typeof estimatedMinutes === "number" || estimatedMinutes === null) {
    await setEstimatedMinutes(assignment.id, estimatedMinutes ?? null);
  }

  await syncTags(assignment.id, userId, tags);

  const hydrated = await prisma.assignment.findUniqueOrThrow({
    where: { id: assignment.id },
    include: {
      course: true,
      assignmentTags: {
        include: {
          tag: true,
        },
      },
    },
  });

  await notifyStudyGroupMembersForEvaluation(
    userId,
    hydrated.courseId ?? null,
    hydrated.title,
    "assignment",
  ).catch(() => {
    // Notification fan-out should not block assignment creation.
  });

  const estimatedMinutesById = await readEstimatedMinutesByIds([hydrated.id]);
  return mapAssignment(hydrated, estimatedMinutesById.get(hydrated.id) ?? null);
}

export async function getAssignmentById(userId: string, assignmentId: string) {
  await ensureAssignmentEstimatedMinutesColumn();

  const assignment = await prisma.assignment.findFirst({
    where: {
      id: assignmentId,
      userId,
    },
    include: {
      course: true,
      assignmentTags: {
        include: {
          tag: true,
        },
      },
    },
  });

  if (!assignment) throw createHttpError(404, "Assignment not found");
  const estimatedMinutesById = await readEstimatedMinutesByIds([assignment.id]);
  return mapAssignment(assignment, estimatedMinutesById.get(assignment.id) ?? null);
}

export async function updateAssignment(userId: string, assignmentId: string, payload: UpdateAssignmentBody) {
  await ensureAssignmentEstimatedMinutesColumn();

  const current = await prisma.assignment.findFirst({
    where: {
      id: assignmentId,
      userId,
    },
  });

  if (!current) throw createHttpError(404, "Assignment not found");

  const { tags, estimatedMinutes, ...assignmentPayload } = payload;

  if (assignmentPayload.courseId) {
    await ensureCourseBelongsToUser(assignmentPayload.courseId, userId);
  }

  const updated = await prisma.assignment.update({
    where: {
      id: current.id,
    },
    data: assignmentPayload,
    include: {
      course: true,
      assignmentTags: {
        include: {
          tag: true,
        },
      },
    },
  });

  if (typeof estimatedMinutes === "number" || estimatedMinutes === null) {
    await setEstimatedMinutes(updated.id, estimatedMinutes ?? null);
  }

  await syncTags(updated.id, userId, tags);

  const hydrated = await prisma.assignment.findUniqueOrThrow({
    where: { id: updated.id },
    include: {
      course: true,
      assignmentTags: {
        include: {
          tag: true,
        },
      },
    },
  });

  const estimatedMinutesById = await readEstimatedMinutesByIds([hydrated.id]);
  return mapAssignment(hydrated, estimatedMinutesById.get(hydrated.id) ?? null);
}

export async function deleteAssignment(userId: string, assignmentId: string): Promise<void> {
  const current = await prisma.assignment.findFirst({
    where: {
      id: assignmentId,
      userId,
    },
  });

  if (!current) throw createHttpError(404, "Assignment not found");

  await prisma.assignment.delete({
    where: {
      id: current.id,
    },
  });
}
