import bcrypt from "bcryptjs";
import { addDays, addHours, set } from "date-fns";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("Demo12345!", 10);

  const user = await prisma.user.upsert({
    where: { email: "demo@uniplanner.app" },
    update: {
      passwordHash,
      name: "Demo Student",
      career: "Computer Science",
      university: "UniPlanner University",
      timezone: "America/Mexico_City",
      notifyEmail: false,
      notifyInApp: true,
    },
    create: {
      email: "demo@uniplanner.app",
      passwordHash,
      name: "Demo Student",
      career: "Computer Science",
      university: "UniPlanner University",
      timezone: "America/Mexico_City",
      notifyEmail: false,
      notifyInApp: true,
    },
  });

  await prisma.notification.deleteMany({ where: { userId: user.id } });
  await prisma.grade.deleteMany({ where: { userId: user.id } });
  await prisma.project.deleteMany({ where: { userId: user.id } });
  await prisma.exam.deleteMany({ where: { userId: user.id } });
  await prisma.assignment.deleteMany({ where: { userId: user.id } });
  await prisma.tag.deleteMany({ where: { userId: user.id } });
  await prisma.course.deleteMany({ where: { userId: user.id } });

  const [algorithms, databases] = await Promise.all([
    prisma.course.create({
      data: {
        userId: user.id,
        name: "Algorithms",
        code: "CS301",
        teacher: "Dr. Rivera",
        credits: 6,
        color: "#0EA5E9",
        semester: "2026-1",
        classSessions: {
          create: [
            { dayOfWeek: 1, startTime: "09:00", endTime: "10:30", room: "A-201", modality: "PRESENTIAL" },
            { dayOfWeek: 3, startTime: "09:00", endTime: "10:30", room: "A-201", modality: "PRESENTIAL" },
          ],
        },
      },
    }),
    prisma.course.create({
      data: {
        userId: user.id,
        name: "Databases",
        code: "CS220",
        teacher: "MSc. Torres",
        credits: 5,
        color: "#14B8A6",
        semester: "2026-1",
        classSessions: {
          create: [
            { dayOfWeek: 2, startTime: "11:00", endTime: "12:30", room: "Lab-3", modality: "PRESENTIAL" },
            { dayOfWeek: 4, startTime: "11:00", endTime: "12:30", room: "Lab-3", modality: "PRESENTIAL" },
          ],
        },
      },
    }),
  ]);

  const now = new Date();

  const assignment1 = await prisma.assignment.create({
    data: {
      userId: user.id,
      courseId: algorithms.id,
      title: "Resolver hoja de grafos",
      description: "Problemas 1 al 10",
      dueDate: addDays(now, 3),
      priority: "HIGH",
      status: "PENDING",
      repeatRule: "NONE",
      attachmentLinks: ["https://campus.example.com/grafos"],
    },
  });

  await prisma.assignment.create({
    data: {
      userId: user.id,
      courseId: databases.id,
      title: "Modelo ER del proyecto",
      description: "Primera entrega",
      dueDate: addDays(now, 6),
      priority: "MEDIUM",
      status: "IN_PROGRESS",
      repeatRule: "NONE",
      attachmentLinks: [],
    },
  });

  const urgentTag = await prisma.tag.create({
    data: { userId: user.id, name: "urgente" },
  });

  await prisma.assignmentTag.create({
    data: {
      assignmentId: assignment1.id,
      tagId: urgentTag.id,
    },
  });

  await prisma.exam.createMany({
    data: [
      {
        userId: user.id,
        courseId: algorithms.id,
        title: "Parcial 1",
        dateTime: addDays(now, 8),
        type: "MIDTERM",
        location: "Auditorio B",
        syllabus: "Recursion, divide y venceras, grafos",
        weight: 25,
        reminderOffsets: [10080, 4320, 1440, 360, 60],
      },
      {
        userId: user.id,
        courseId: databases.id,
        title: "Quiz SQL",
        dateTime: addDays(now, 4),
        type: "QUIZ",
        location: "Lab-3",
        syllabus: "JOINs, subqueries",
        weight: 10,
        reminderOffsets: [1440, 360, 60],
      },
    ],
  });

  const project = await prisma.project.create({
    data: {
      userId: user.id,
      courseId: databases.id,
      name: "Proyecto gestor de inventario",
      description: "Backend + dashboard",
      startDate: now,
      dueDate: addDays(now, 30),
      status: "DOING",
      milestones: {
        create: [
          {
            title: "Diseno de base de datos",
            dueDate: addDays(now, 7),
          },
          {
            title: "API REST",
            dueDate: addDays(now, 14),
          },
        ],
      },
      tasks: {
        create: [
          { title: "Definir entidades", status: "TODO" },
          { title: "Implementar endpoints", status: "DOING" },
          { title: "Documentar Postman", status: "DONE" },
        ],
      },
    },
  });

  await prisma.grade.createMany({
    data: [
      {
        userId: user.id,
        courseId: algorithms.id,
        name: "Tarea 1",
        score: 8.5,
        maxScore: 10,
        weight: 15,
      },
      {
        userId: user.id,
        courseId: algorithms.id,
        name: "Quiz 1",
        score: 7.2,
        maxScore: 10,
        weight: 10,
      },
      {
        userId: user.id,
        courseId: databases.id,
        name: "Laboratorio 1",
        score: 9.1,
        maxScore: 10,
        weight: 20,
      },
    ],
  });

  await prisma.notification.createMany({
    data: [
      {
        userId: user.id,
        title: "Bienvenido a UniPlanner",
        message: "Tu cuenta demo se cargo correctamente.",
        type: "SYSTEM",
        read: false,
        sentAt: now,
      },
      {
        userId: user.id,
        title: "Milestone cercano",
        message: `El milestone principal de ${project.name} vence pronto.`,
        type: "MILESTONE",
        read: false,
        sentAt: addHours(now, -2),
      },
    ],
  });

  const focusTaskTime = set(now, { hours: 18, minutes: 0, seconds: 0, milliseconds: 0 });
  await prisma.assignment.create({
    data: {
      userId: user.id,
      courseId: algorithms.id,
      title: "Sesion de enfoque (Pomodoro)",
      description: "2 pomodoros de practica",
      dueDate: focusTaskTime,
      priority: "MEDIUM",
      status: "PENDING",
      repeatRule: "WEEKLY",
    },
  });

  console.log("Seed completed. Demo credentials:");
  console.log("email: demo@uniplanner.app");
  console.log("password: Demo12345!");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
