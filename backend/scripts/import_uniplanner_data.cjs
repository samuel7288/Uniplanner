const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const filePath = process.argv[2];
const userEmail = process.argv[3] || "demo@uniplanner.app";

if (!filePath) {
  console.error("Usage: node scripts/import_uniplanner_data.cjs <jsonPath> [userEmail]");
  process.exit(1);
}

function parseDateTime(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text) return null;

  let normalized = text;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    normalized = `${text}T00:00:00`;
  } else if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}$/.test(text)) {
    normalized = `${text.replace(" ", "T")}:00`;
  } else if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}$/.test(text)) {
    normalized = text.replace(" ", "T");
  }

  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseIntOrNull(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : null;
}

function parseFloatOrNull(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function parseList(value) {
  if (!value) return [];
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeEnum(value, allowed, fallback) {
  const candidate = String(value || "")
    .trim()
    .toUpperCase();
  return allowed.includes(candidate) ? candidate : fallback;
}

function sheetRows(payload, ...names) {
  for (const name of names) {
    if (Array.isArray(payload?.sheets?.[name])) return payload.sheets[name];
  }
  return [];
}

async function main() {
  const absolutePath = path.resolve(filePath);
  const payload = JSON.parse(fs.readFileSync(absolutePath, "utf-8"));

  const user = await prisma.user.findUnique({ where: { email: userEmail } });
  if (!user) {
    throw new Error(`User not found for email: ${userEmail}`);
  }

  const summary = {
    courses: 0,
    classSessions: 0,
    assignments: 0,
    assignmentTags: 0,
    exams: 0,
    projects: 0,
    milestones: 0,
    projectTasks: 0,
    grades: 0,
    skipped: {
      assignments: 0,
      exams: 0,
      projects: 0,
      milestones: 0,
      projectTasks: 0,
      grades: 0,
      classSessions: 0,
    },
  };

  await prisma.notification.deleteMany({ where: { userId: user.id } });
  await prisma.grade.deleteMany({ where: { userId: user.id } });
  await prisma.project.deleteMany({ where: { userId: user.id } });
  await prisma.exam.deleteMany({ where: { userId: user.id } });
  await prisma.assignment.deleteMany({ where: { userId: user.id } });
  await prisma.tag.deleteMany({ where: { userId: user.id } });
  await prisma.course.deleteMany({ where: { userId: user.id } });

  const courseRows = sheetRows(payload, "materias", "courses");
  const courseIdByCode = new Map();
  const projectIdByName = new Map();

  for (const row of courseRows) {
    const code = String(row.code || "").trim();
    const name = String(row.name || "").trim();
    if (!code || !name) continue;

    const created = await prisma.course.create({
      data: {
        userId: user.id,
        code,
        name,
        teacher: String(row.teacher || "").trim() || null,
        credits: parseIntOrNull(row.credits),
        color: String(row.color || "").trim() || null,
        semester: String(row.semester || "").trim() || null,
      },
    });
    courseIdByCode.set(code, created.id);
    summary.courses += 1;
  }

  const classSessionRows = sheetRows(payload, "horarios", "class_sessions");
  for (const row of classSessionRows) {
    const courseCode = String(row.course_code || "").trim();
    const courseId = courseIdByCode.get(courseCode);
    if (!courseId) {
      summary.skipped.classSessions += 1;
      continue;
    }

    const dayOfWeek = parseIntOrNull(row.day_of_week);
    const startTime = String(row.start_time || "").trim();
    const endTime = String(row.end_time || "").trim();
    if (dayOfWeek === null || !startTime || !endTime) {
      summary.skipped.classSessions += 1;
      continue;
    }

    await prisma.classSession.create({
      data: {
        courseId,
        dayOfWeek,
        startTime,
        endTime,
        room: String(row.room || "").trim() || null,
        modality: normalizeEnum(row.modality, ["PRESENTIAL", "ONLINE"], "PRESENTIAL"),
      },
    });
    summary.classSessions += 1;
  }

  const assignmentRows = sheetRows(payload, "tareas", "assignments");
  for (const row of assignmentRows) {
    const title = String(row.title || "").trim();
    const dueDate = parseDateTime(row.due_date);
    if (!title || !dueDate) {
      summary.skipped.assignments += 1;
      continue;
    }

    const courseCode = String(row.course_code || "").trim();
    const courseId = courseCode ? courseIdByCode.get(courseCode) || null : null;

    const assignment = await prisma.assignment.create({
      data: {
        userId: user.id,
        courseId,
        title,
        dueDate,
        description: String(row.description || "").trim() || null,
        priority: normalizeEnum(row.priority, ["LOW", "MEDIUM", "HIGH"], "MEDIUM"),
        status: normalizeEnum(row.status, ["PENDING", "IN_PROGRESS", "DONE"], "PENDING"),
        repeatRule: normalizeEnum(row.repeat_rule, ["NONE", "WEEKLY", "MONTHLY"], "NONE"),
        attachmentLinks: parseList(row.attachment_links),
      },
    });
    summary.assignments += 1;

    const tags = [...new Set(parseList(row.tags))];
    for (const tagName of tags) {
      const tag = await prisma.tag.upsert({
        where: {
          userId_name: {
            userId: user.id,
            name: tagName,
          },
        },
        update: {},
        create: {
          userId: user.id,
          name: tagName,
        },
      });

      await prisma.assignmentTag.create({
        data: {
          assignmentId: assignment.id,
          tagId: tag.id,
        },
      });
      summary.assignmentTags += 1;
    }
  }

  const examRows = sheetRows(payload, "examenes", "exams");
  for (const row of examRows) {
    const title = String(row.title || "").trim();
    const dateTime = parseDateTime(row.date_time);
    if (!title || !dateTime) {
      summary.skipped.exams += 1;
      continue;
    }

    const courseCode = String(row.course_code || "").trim();
    const courseId = courseCode ? courseIdByCode.get(courseCode) || null : null;
    const reminderOffsets = parseList(row.reminder_offsets)
      .map((item) => Number(item))
      .filter((item) => Number.isFinite(item) && item > 0);

    await prisma.exam.create({
      data: {
        userId: user.id,
        courseId,
        title,
        dateTime,
        type: normalizeEnum(row.type, ["QUIZ", "MIDTERM", "FINAL", "OTHER"], "OTHER"),
        location: String(row.location || "").trim() || null,
        syllabus: String(row.syllabus || "").trim() || null,
        weight: parseFloatOrNull(row.weight),
        reminderOffsets: reminderOffsets.length ? reminderOffsets : [10080, 4320, 1440, 360, 60],
      },
    });
    summary.exams += 1;
  }

  const projectRows = sheetRows(payload, "proyectos", "projects");
  for (const row of projectRows) {
    const name = String(row.name || "").trim();
    if (!name) {
      summary.skipped.projects += 1;
      continue;
    }

    const courseCode = String(row.course_code || "").trim();
    const courseId = courseCode ? courseIdByCode.get(courseCode) || null : null;

    const project = await prisma.project.create({
      data: {
        userId: user.id,
        courseId,
        name,
        description: String(row.description || "").trim() || null,
        startDate: parseDateTime(row.start_date),
        dueDate: parseDateTime(row.due_date),
        status: normalizeEnum(row.status, ["TODO", "DOING", "DONE"], "TODO"),
      },
    });
    projectIdByName.set(name, project.id);
    summary.projects += 1;
  }

  const milestoneRows = sheetRows(payload, "milestones");
  for (const row of milestoneRows) {
    const projectName = String(row.project_name || "").trim();
    const title = String(row.title || "").trim();
    const projectId = projectIdByName.get(projectName);
    if (!projectId || !title) {
      summary.skipped.milestones += 1;
      continue;
    }

    await prisma.milestone.create({
      data: {
        projectId,
        title,
        description: String(row.description || "").trim() || null,
        dueDate: parseDateTime(row.due_date),
        completed: String(row.completed || "").trim().toLowerCase() === "true",
      },
    });
    summary.milestones += 1;
  }

  const projectTaskRows = sheetRows(payload, "project_tasks");
  for (const row of projectTaskRows) {
    const projectName = String(row.project_name || "").trim();
    const title = String(row.title || "").trim();
    const projectId = projectIdByName.get(projectName);
    if (!projectId || !title) {
      summary.skipped.projectTasks += 1;
      continue;
    }

    await prisma.projectTask.create({
      data: {
        projectId,
        title,
        description: String(row.description || "").trim() || null,
        dueDate: parseDateTime(row.due_date),
        status: normalizeEnum(row.status, ["TODO", "DOING", "DONE"], "TODO"),
      },
    });
    summary.projectTasks += 1;
  }

  const gradeRows = sheetRows(payload, "notas", "grades");
  for (const row of gradeRows) {
    const courseCode = String(row.course_code || "").trim();
    const courseId = courseIdByCode.get(courseCode);
    const name = String(row.name || "").trim();
    const score = parseFloatOrNull(row.score);
    const maxScore = parseFloatOrNull(row.max_score);
    const weight = parseFloatOrNull(row.weight);

    if (!courseId || !name || score === null || maxScore === null || weight === null) {
      summary.skipped.grades += 1;
      continue;
    }

    await prisma.grade.create({
      data: {
        userId: user.id,
        courseId,
        name,
        score,
        maxScore,
        weight,
      },
    });
    summary.grades += 1;
  }

  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
