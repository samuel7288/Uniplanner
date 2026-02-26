import request from "supertest";
import { addDays } from "date-fns";
import { app } from "../src/app";
import { prisma } from "../src/lib/prisma";

describe("UniPlanner API critical flows", () => {
  const random = Date.now();
  const email = `tester-${random}@example.com`;
  const password = "Password123!";
  let accessToken = "";
  let courseId = "";
  let assignmentId = "";
  let examId = "";

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await prisma.$disconnect();
  });

  it("registers and logs in", async () => {
    const registerResponse = await request(app).post("/api/auth/register").send({
      email,
      password,
      name: "Test User",
      timezone: "UTC",
    });

    expect(registerResponse.status).toBe(201);
    expect(registerResponse.body.accessToken).toBeDefined();
    const registerCookies = ([] as string[]).concat(registerResponse.headers["set-cookie"] ?? []);
    expect(registerCookies.some((cookie) => cookie.includes("refreshToken="))).toBe(true);

    const loginResponse = await request(app).post("/api/auth/login").send({
      email,
      password,
    });

    expect(loginResponse.status).toBe(200);
    accessToken = loginResponse.body.accessToken;
    expect(accessToken).toBeTruthy();
    const loginCookies = ([] as string[]).concat(loginResponse.headers["set-cookie"] ?? []);
    expect(loginCookies.some((cookie) => cookie.includes("refreshToken="))).toBe(true);
  });

  it("creates course and assignment, then updates assignment", async () => {
    const courseResponse = await request(app)
      .post("/api/courses")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        name: "Software Architecture",
        code: `SA-${random}`,
        semester: "2026-1",
      });

    expect(courseResponse.status).toBe(201);
    courseId = courseResponse.body.id;

    const assignmentResponse = await request(app)
      .post("/api/assignments")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        title: "Entrega de arquitectura",
        courseId,
        dueDate: addDays(new Date(), 2).toISOString(),
        priority: "HIGH",
        status: "PENDING",
        tags: ["api", "critical"],
      });

    expect(assignmentResponse.status).toBe(201);
    assignmentId = assignmentResponse.body.id;

    const updateResponse = await request(app)
      .put(`/api/assignments/${assignmentId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        status: "IN_PROGRESS",
      });

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.status).toBe("IN_PROGRESS");
  });

  it("creates, reads and deletes exam", async () => {
    const createResponse = await request(app)
      .post("/api/exams")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        title: "Final architecture",
        courseId,
        dateTime: addDays(new Date(), 5).toISOString(),
        type: "FINAL",
        reminderOffsets: [1440, 60],
      });

    expect(createResponse.status).toBe(201);
    examId = createResponse.body.id;

    const listResponse = await request(app)
      .get("/api/exams")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(listResponse.status).toBe(200);
    expect(Array.isArray(listResponse.body.items)).toBe(true);
    expect(listResponse.body.items.some((exam: { id: string }) => exam.id === examId)).toBe(true);

    const deleteResponse = await request(app)
      .delete(`/api/exams/${examId}`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(deleteResponse.status).toBe(204);
  });
});
