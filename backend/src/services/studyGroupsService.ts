import { Prisma } from "@prisma/client";
import { addDays } from "date-fns";
import { randomUUID } from "crypto";
import { env } from "../config/env";
import { sendEmail } from "../lib/email";
import { prisma } from "../lib/prisma";

type HttpError = Error & { status?: number };

type GroupRole = "admin" | "member";

export type StudyGroupRecord = {
  id: number;
  name: string;
  courseId: string | null;
  createdBy: string;
  createdAt: Date;
};

type StudyGroupMemberRecord = {
  userId: string;
  groupId: number;
  role: GroupRole;
  joinedAt: Date;
};

type GroupInviteRecord = {
  id: number;
  groupId: number;
  email: string;
  token: string;
  expiresAt: Date;
  accepted: boolean;
  acceptedAt: Date | null;
};

let studyGroupsInfraReady = false;

function createHttpError(status: number, message: string): HttpError {
  const error = new Error(message) as HttpError;
  error.status = status;
  return error;
}

export async function ensureStudyGroupsInfrastructure(): Promise<void> {
  if (studyGroupsInfraReady) return;

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "StudyGroup" (
      "id" SERIAL PRIMARY KEY,
      "name" TEXT NOT NULL,
      "courseId" TEXT,
      "createdBy" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "StudyGroup_createdBy_fkey"
        FOREIGN KEY ("createdBy")
        REFERENCES "User"("id")
        ON DELETE CASCADE
        ON UPDATE CASCADE,
      CONSTRAINT "StudyGroup_courseId_fkey"
        FOREIGN KEY ("courseId")
        REFERENCES "Course"("id")
        ON DELETE SET NULL
        ON UPDATE CASCADE
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "StudyGroupMember" (
      "userId" TEXT NOT NULL,
      "groupId" INTEGER NOT NULL,
      "role" TEXT NOT NULL DEFAULT 'member',
      "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY ("userId", "groupId"),
      CONSTRAINT "StudyGroupMember_userId_fkey"
        FOREIGN KEY ("userId")
        REFERENCES "User"("id")
        ON DELETE CASCADE
        ON UPDATE CASCADE,
      CONSTRAINT "StudyGroupMember_groupId_fkey"
        FOREIGN KEY ("groupId")
        REFERENCES "StudyGroup"("id")
        ON DELETE CASCADE
        ON UPDATE CASCADE
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "GroupInvite" (
      "id" SERIAL PRIMARY KEY,
      "groupId" INTEGER NOT NULL,
      "email" TEXT NOT NULL,
      "token" TEXT NOT NULL UNIQUE,
      "expiresAt" TIMESTAMP(3) NOT NULL,
      "accepted" BOOLEAN NOT NULL DEFAULT false,
      "acceptedAt" TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "GroupInvite_groupId_fkey"
        FOREIGN KEY ("groupId")
        REFERENCES "StudyGroup"("id")
        ON DELETE CASCADE
        ON UPDATE CASCADE
    )
  `);

  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "StudyGroup_courseId_idx" ON "StudyGroup"("courseId")`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "StudyGroupMember_groupId_idx" ON "StudyGroupMember"("groupId")`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "GroupInvite_groupId_idx" ON "GroupInvite"("groupId")`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "GroupInvite_token_key" ON "GroupInvite"("token")`,
  );

  studyGroupsInfraReady = true;
}

async function getGroupById(groupId: number): Promise<StudyGroupRecord | null> {
  const rows = await prisma.$queryRaw<StudyGroupRecord[]>`
    SELECT "id", "name", "courseId", "createdBy", "createdAt"
    FROM "StudyGroup"
    WHERE "id" = ${groupId}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

async function getMembership(userId: string, groupId: number): Promise<StudyGroupMemberRecord | null> {
  const rows = await prisma.$queryRaw<StudyGroupMemberRecord[]>`
    SELECT "userId", "groupId", "role", "joinedAt"
    FROM "StudyGroupMember"
    WHERE "userId" = ${userId}
      AND "groupId" = ${groupId}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

async function requireGroupMember(userId: string, groupId: number) {
  await ensureStudyGroupsInfrastructure();
  const [group, membership] = await Promise.all([getGroupById(groupId), getMembership(userId, groupId)]);
  if (!group || !membership) {
    throw createHttpError(404, "Study group not found");
  }
  return { group, membership };
}

async function requireGroupAdmin(userId: string, groupId: number) {
  const { group, membership } = await requireGroupMember(userId, groupId);
  if (membership.role !== "admin") {
    throw createHttpError(403, "Only group admins can perform this action");
  }
  return { group, membership };
}

export async function createStudyGroup(
  userId: string,
  payload: { name: string; courseId?: string | null },
): Promise<StudyGroupRecord> {
  await ensureStudyGroupsInfrastructure();

  const name = payload.name.trim();
  if (!name) throw createHttpError(400, "Group name is required");

  if (payload.courseId) {
    const course = await prisma.course.findFirst({
      where: {
        id: payload.courseId,
        userId,
      },
      select: { id: true },
    });
    if (!course) throw createHttpError(400, "Invalid courseId");
  }

  const rows = await prisma.$queryRaw<Array<{ id: number }>>`
    INSERT INTO "StudyGroup" ("name", "courseId", "createdBy")
    VALUES (${name}, ${payload.courseId ?? null}, ${userId})
    RETURNING "id"
  `;
  const groupId = rows[0]?.id;
  if (!groupId) throw createHttpError(500, "Group could not be created");

  await prisma.$executeRaw`
    INSERT INTO "StudyGroupMember" ("userId", "groupId", "role")
    VALUES (${userId}, ${groupId}, 'admin')
    ON CONFLICT ("userId", "groupId") DO NOTHING
  `;

  const group = await getGroupById(groupId);
  if (!group) throw createHttpError(500, "Group could not be created");
  return group;
}

export async function listStudyGroupsForUser(userId: string) {
  await ensureStudyGroupsInfrastructure();

  return prisma.$queryRaw<
    Array<{
      id: number;
      name: string;
      courseId: string | null;
      createdAt: Date;
      role: GroupRole;
      membersCount: number;
      courseName: string | null;
      courseCode: string | null;
    }>
  >`
    SELECT
      g."id",
      g."name",
      g."courseId",
      g."createdAt",
      m."role",
      c."name" AS "courseName",
      c."code" AS "courseCode",
      (
        SELECT COUNT(*)::int
        FROM "StudyGroupMember" gm
        WHERE gm."groupId" = g."id"
      ) AS "membersCount"
    FROM "StudyGroup" g
    INNER JOIN "StudyGroupMember" m
      ON m."groupId" = g."id"
    LEFT JOIN "Course" c
      ON c."id" = g."courseId"
    WHERE m."userId" = ${userId}
    ORDER BY g."createdAt" DESC
  `;
}

export async function listStudyGroupMembersForUser(userId: string, groupId: number) {
  await requireGroupMember(userId, groupId);

  return prisma.$queryRaw<
    Array<{
      userId: string;
      name: string;
      email: string;
      role: GroupRole;
      joinedAt: Date;
    }>
  >`
    SELECT
      m."userId",
      u."name",
      u."email",
      m."role",
      m."joinedAt"
    FROM "StudyGroupMember" m
    INNER JOIN "User" u
      ON u."id" = m."userId"
    WHERE m."groupId" = ${groupId}
    ORDER BY
      CASE WHEN m."role" = 'admin' THEN 0 ELSE 1 END,
      m."joinedAt" ASC
  `;
}

export async function inviteToStudyGroup(
  userId: string,
  groupId: number,
  email: string,
): Promise<GroupInviteRecord> {
  await requireGroupAdmin(userId, groupId);

  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) throw createHttpError(400, "Invite email is required");

  const token = randomUUID();
  const expiresAt = addDays(new Date(), 7);

  const rows = await prisma.$queryRaw<GroupInviteRecord[]>`
    INSERT INTO "GroupInvite" ("groupId", "email", "token", "expiresAt")
    VALUES (${groupId}, ${normalizedEmail}, ${token}, ${expiresAt})
    RETURNING "id", "groupId", "email", "token", "expiresAt", "accepted", "acceptedAt"
  `;
  const invite = rows[0];
  if (!invite) throw createHttpError(500, "Invite could not be created");

  const acceptUrl = `${env.FRONTEND_URL.replace(/\/$/, "")}/settings?groupInvite=${token}`;
  await sendEmail({
    to: normalizedEmail,
    subject: "Invitacion a grupo de estudio en UniPlanner",
    text: `Te invitaron a un grupo de estudio. Abre este enlace para aceptar: ${acceptUrl}`,
  });

  return invite;
}

export async function acceptStudyGroupInvite(userId: string, token: string) {
  await ensureStudyGroupsInfrastructure();

  const inviteRows = await prisma.$queryRaw<GroupInviteRecord[]>`
    SELECT "id", "groupId", "email", "token", "expiresAt", "accepted", "acceptedAt"
    FROM "GroupInvite"
    WHERE "token" = ${token}
    LIMIT 1
  `;
  const invite = inviteRows[0];
  if (!invite) throw createHttpError(404, "Invite not found");
  if (invite.accepted) throw createHttpError(400, "Invite already accepted");
  if (invite.expiresAt < new Date()) throw createHttpError(400, "Invite has expired");

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  if (!user) throw createHttpError(404, "User not found");
  if (user.email.trim().toLowerCase() !== invite.email.trim().toLowerCase()) {
    throw createHttpError(403, "Invite email does not match the authenticated user");
  }

  await prisma.$transaction([
    prisma.$executeRaw`
      INSERT INTO "StudyGroupMember" ("userId", "groupId", "role")
      VALUES (${userId}, ${invite.groupId}, 'member')
      ON CONFLICT ("userId", "groupId") DO NOTHING
    `,
    prisma.$executeRaw`
      UPDATE "GroupInvite"
      SET
        "accepted" = true,
        "acceptedAt" = NOW()
      WHERE "id" = ${invite.id}
    `,
  ]);

  const group = await getGroupById(invite.groupId);
  if (!group) throw createHttpError(404, "Study group not found");
  return group;
}

export async function getGroupCalendarForUser(userId: string, groupId: number) {
  const { group } = await requireGroupMember(userId, groupId);

  const memberRows = await prisma.$queryRaw<Array<{ userId: string; name: string }>>`
    SELECT m."userId", u."name"
    FROM "StudyGroupMember" m
    INNER JOIN "User" u ON u."id" = m."userId"
    WHERE m."groupId" = ${groupId}
  `;
  const memberIds = memberRows.map((member) => member.userId);
  const memberNameById = new Map(memberRows.map((member) => [member.userId, member.name]));
  if (memberIds.length === 0) return [];

  const [assignments, exams] = await Promise.all([
    prisma.assignment.findMany({
      where: {
        userId: { in: memberIds },
        ...(group.courseId ? { courseId: group.courseId } : {}),
      },
      include: {
        course: true,
      },
    }),
    prisma.exam.findMany({
      where: {
        userId: { in: memberIds },
        ...(group.courseId ? { courseId: group.courseId } : {}),
      },
      include: {
        course: true,
      },
    }),
  ]);

  const assignmentEvents = assignments.map((assignment) => ({
    id: `group-assignment-${assignment.id}`,
    title: `[Grupo] ${assignment.title}`,
    start: assignment.dueDate.toISOString(),
    end: assignment.dueDate.toISOString(),
    type: "group" as const,
    courseId: assignment.courseId ?? null,
    sourceUserId: assignment.userId,
    sourceUserName: memberNameById.get(assignment.userId) ?? "Miembro",
    courseName: assignment.course?.name ?? null,
  }));

  const examEvents = exams.map((exam) => ({
    id: `group-exam-${exam.id}`,
    title: `[Grupo] ${exam.title}`,
    start: exam.dateTime.toISOString(),
    end: exam.dateTime.toISOString(),
    type: "group" as const,
    courseId: exam.courseId ?? null,
    sourceUserId: exam.userId,
    sourceUserName: memberNameById.get(exam.userId) ?? "Miembro",
    courseName: exam.course?.name ?? null,
  }));

  return [...assignmentEvents, ...examEvents].sort((a, b) => a.start.localeCompare(b.start));
}

export async function listGroupCalendarEventsForUser(userId: string) {
  await ensureStudyGroupsInfrastructure();

  const groups = await prisma.$queryRaw<Array<{ groupId: number }>>`
    SELECT "groupId"
    FROM "StudyGroupMember"
    WHERE "userId" = ${userId}
  `;

  const uniqueGroupIds = Array.from(new Set(groups.map((entry) => entry.groupId)));
  const allEvents = await Promise.all(
    uniqueGroupIds.map((groupId) => getGroupCalendarForUser(userId, groupId)),
  );
  return allEvents.flat();
}

export async function removeStudyGroupMember(
  adminUserId: string,
  groupId: number,
  memberUserId: string,
): Promise<void> {
  await requireGroupAdmin(adminUserId, groupId);
  if (adminUserId === memberUserId) {
    throw createHttpError(400, "Admin cannot remove themselves from the group");
  }

  await prisma.$executeRaw`
    DELETE FROM "StudyGroupMember"
    WHERE "groupId" = ${groupId}
      AND "userId" = ${memberUserId}
  `;
}

export async function notifyStudyGroupMembersForEvaluation(
  actorUserId: string,
  courseId: string | null | undefined,
  title: string,
  kind: "exam" | "assignment",
): Promise<void> {
  await ensureStudyGroupsInfrastructure();
  if (!courseId) return;

  const targetRows = await prisma.$queryRaw<Array<{ groupId: number; userId: string }>>`
    SELECT DISTINCT g."id" AS "groupId", m2."userId"
    FROM "StudyGroup" g
    INNER JOIN "StudyGroupMember" m
      ON m."groupId" = g."id"
      AND m."userId" = ${actorUserId}
    INNER JOIN "StudyGroupMember" m2
      ON m2."groupId" = g."id"
    WHERE (g."courseId" IS NULL OR g."courseId" = ${courseId})
      AND m2."userId" <> ${actorUserId}
  `;

  for (const row of targetRows) {
    const eventKey = `group-eval:${row.groupId}:${kind}:${actorUserId}:${title}:${row.userId}`;
    await prisma.notification.create({
      data: {
        userId: row.userId,
        title: "Nueva evaluacion en grupo",
        message:
          kind === "exam"
            ? `Un miembro del grupo agrego el examen "${title}".`
            : `Un miembro del grupo agrego la tarea "${title}".`,
        type: "SYSTEM",
        eventKey,
      },
    }).catch(() => {
      // Dedup via unique eventKey.
    });
  }
}
