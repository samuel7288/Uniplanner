/**
 * OpenAPI 3.0 specification for the UniPlanner API.
 * Served as interactive docs at GET /api/docs
 */
export const openApiDocument = {
  openapi: "3.0.3",
  info: {
    title: "UniPlanner API",
    version: "1.0.0",
    description:
      "REST API for UniPlanner — a full-stack university planning application. " +
      "Manages courses, assignments, exams, projects, grades, calendar and notifications.",
    contact: { name: "UniPlanner" },
  },
  servers: [{ url: "/api", description: "Current server" }],
  tags: [
    { name: "Auth", description: "Authentication & session management" },
    { name: "Courses", description: "Academic courses and class sessions" },
    { name: "Assignments", description: "Homework and tasks" },
    { name: "Exams", description: "Exams and quizzes" },
    { name: "Projects", description: "Projects, milestones and kanban tasks" },
    { name: "Grades", description: "Grade records per course" },
    { name: "Dashboard", description: "Summary statistics" },
    { name: "Calendar", description: "Unified calendar and .ics export" },
    { name: "Notifications", description: "In-app notification management" },
    { name: "Search", description: "Cross-entity full-text search" },
    { name: "Settings", description: "User profile and preferences" },
    { name: "Planning", description: "Weekly planning view" },
  ],
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
    },
    schemas: {
      Error: {
        type: "object",
        properties: {
          message: { type: "string" },
          details: { type: "array", items: { type: "object", properties: { path: { type: "string" }, message: { type: "string" } } } },
        },
      },
      User: {
        type: "object",
        properties: {
          id: { type: "string" },
          email: { type: "string", format: "email" },
          name: { type: "string" },
          career: { type: "string", nullable: true },
          university: { type: "string", nullable: true },
          timezone: { type: "string" },
          notifyInApp: { type: "boolean" },
          notifyEmail: { type: "boolean" },
        },
      },
      Course: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          code: { type: "string" },
          teacher: { type: "string", nullable: true },
          credits: { type: "integer", nullable: true },
          color: { type: "string", nullable: true },
          semester: { type: "string", nullable: true },
        },
      },
      Assignment: {
        type: "object",
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          description: { type: "string", nullable: true },
          dueDate: { type: "string", format: "date-time" },
          priority: { type: "string", enum: ["LOW", "MEDIUM", "HIGH"] },
          status: { type: "string", enum: ["PENDING", "IN_PROGRESS", "DONE"] },
          repeatRule: { type: "string", enum: ["NONE", "WEEKLY", "MONTHLY"] },
          attachmentLinks: { type: "array", items: { type: "string" } },
        },
      },
      Exam: {
        type: "object",
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          dateTime: { type: "string", format: "date-time" },
          type: { type: "string", enum: ["QUIZ", "MIDTERM", "FINAL", "OTHER"] },
          location: { type: "string", nullable: true },
          syllabus: { type: "string", nullable: true },
          weight: { type: "number", nullable: true },
          reminderOffsets: { type: "array", items: { type: "integer" } },
        },
      },
      Notification: {
        type: "object",
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          message: { type: "string" },
          type: { type: "string", enum: ["EXAM", "ASSIGNMENT", "MILESTONE", "SYSTEM"] },
          read: { type: "boolean" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      Pagination: {
        type: "object",
        properties: {
          page: { type: "integer" },
          limit: { type: "integer" },
          total: { type: "integer" },
          totalPages: { type: "integer" },
          hasNext: { type: "boolean" },
          hasPrev: { type: "boolean" },
        },
      },
    },
  },
  security: [{ bearerAuth: [] }],
  paths: {
    "/auth/register": {
      post: {
        tags: ["Auth"],
        summary: "Register a new user",
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "password", "name"],
                properties: {
                  email: { type: "string", format: "email" },
                  password: { type: "string", minLength: 8, maxLength: 72 },
                  name: { type: "string", minLength: 2 },
                  career: { type: "string" },
                  university: { type: "string" },
                  timezone: { type: "string", example: "America/Mexico_City" },
                },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "User registered. Refresh token is set as HttpOnly cookie.",
            content: { "application/json": { schema: { type: "object", properties: { user: { $ref: "#/components/schemas/User" }, accessToken: { type: "string" } } } } },
          },
          "409": { description: "Email already registered", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Login with email and password",
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { type: "object", required: ["email", "password"], properties: { email: { type: "string", format: "email" }, password: { type: "string" } } },
            },
          },
        },
        responses: {
          "200": {
            description: "Login successful. Refresh token set as HttpOnly cookie.",
            content: { "application/json": { schema: { type: "object", properties: { user: { $ref: "#/components/schemas/User" }, accessToken: { type: "string" } } } } },
          },
          "401": { description: "Invalid credentials" },
        },
      },
    },
    "/auth/refresh": {
      post: {
        tags: ["Auth"],
        summary: "Refresh access token using the HttpOnly cookie",
        security: [],
        description: "No request body needed — reads the `refreshToken` HttpOnly cookie automatically.",
        responses: {
          "200": { description: "New access token issued", content: { "application/json": { schema: { type: "object", properties: { accessToken: { type: "string" } } } } } },
          "401": { description: "Cookie missing, expired or revoked" },
        },
      },
    },
    "/auth/logout": {
      post: {
        tags: ["Auth"],
        summary: "Revoke current refresh token and clear cookie",
        responses: {
          "200": { description: "Logged out" },
        },
      },
    },
    "/auth/me": {
      get: {
        tags: ["Auth"],
        summary: "Get the authenticated user profile",
        responses: {
          "200": { description: "User profile", content: { "application/json": { schema: { $ref: "#/components/schemas/User" } } } },
          "401": { description: "Unauthorized" },
        },
      },
    },
    "/auth/forgot-password": {
      post: {
        tags: ["Auth"],
        summary: "Request a password reset email",
        security: [],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["email"], properties: { email: { type: "string", format: "email" } } } } },
        },
        responses: { "200": { description: "Reset email sent (if address exists)" } },
      },
    },
    "/auth/reset-password": {
      post: {
        tags: ["Auth"],
        summary: "Set a new password using a reset token",
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { type: "object", required: ["token", "newPassword"], properties: { token: { type: "string" }, newPassword: { type: "string", minLength: 8 } } },
            },
          },
        },
        responses: { "200": { description: "Password updated" }, "400": { description: "Invalid or expired token" } },
      },
    },
    "/courses": {
      get: {
        tags: ["Courses"],
        summary: "List all courses for the authenticated user",
        responses: { "200": { description: "Array of courses", content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/Course" } } } } } },
      },
      post: {
        tags: ["Courses"],
        summary: "Create a new course",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { type: "object", required: ["name", "code"], properties: { name: { type: "string" }, code: { type: "string" }, teacher: { type: "string" }, credits: { type: "integer" }, color: { type: "string" }, semester: { type: "string" } } },
            },
          },
        },
        responses: { "201": { description: "Course created", content: { "application/json": { schema: { $ref: "#/components/schemas/Course" } } } } },
      },
    },
    "/assignments": {
      get: {
        tags: ["Assignments"],
        summary: "List assignments with optional filters",
        parameters: [
          { name: "status", in: "query", schema: { type: "string", enum: ["PENDING", "IN_PROGRESS", "DONE"] } },
          { name: "priority", in: "query", schema: { type: "string", enum: ["LOW", "MEDIUM", "HIGH"] } },
          { name: "courseId", in: "query", schema: { type: "string" } },
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
        ],
        responses: { "200": { description: "Paginated assignments" } },
      },
      post: {
        tags: ["Assignments"],
        summary: "Create a new assignment",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { type: "object", required: ["title", "dueDate"], properties: { title: { type: "string" }, dueDate: { type: "string", format: "date-time" }, courseId: { type: "string" }, description: { type: "string" }, priority: { type: "string", enum: ["LOW", "MEDIUM", "HIGH"] }, status: { type: "string", enum: ["PENDING", "IN_PROGRESS", "DONE"] } } },
            },
          },
        },
        responses: { "201": { description: "Assignment created", content: { "application/json": { schema: { $ref: "#/components/schemas/Assignment" } } } } },
      },
    },
    "/exams": {
      get: { tags: ["Exams"], summary: "List all exams", responses: { "200": { description: "Array of exams" } } },
      post: {
        tags: ["Exams"],
        summary: "Create a new exam",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { type: "object", required: ["title", "dateTime"], properties: { title: { type: "string" }, dateTime: { type: "string", format: "date-time" }, courseId: { type: "string" }, type: { type: "string", enum: ["QUIZ", "MIDTERM", "FINAL", "OTHER"] }, location: { type: "string" }, weight: { type: "number" }, reminderOffsets: { type: "array", items: { type: "integer" } } } },
            },
          },
        },
        responses: { "201": { description: "Exam created", content: { "application/json": { schema: { $ref: "#/components/schemas/Exam" } } } } },
      },
    },
    "/dashboard/summary": {
      get: {
        tags: ["Dashboard"],
        summary: "Get dashboard summary statistics",
        responses: {
          "200": {
            description: "Dashboard KPIs including upcoming events, grades at risk, completion rates",
            content: { "application/json": { schema: { type: "object" } } },
          },
        },
      },
    },
    "/search": {
      get: {
        tags: ["Search"],
        summary: "Full-text search across courses, assignments and exams (PostgreSQL FTS)",
        parameters: [
          { name: "q", in: "query", required: true, schema: { type: "string" } },
          { name: "type", in: "query", schema: { type: "string", enum: ["all", "course", "assignment", "exam"] } },
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "limit", in: "query", schema: { type: "integer", default: 10 } },
          { name: "sortBy", in: "query", schema: { type: "string", enum: ["title", "updatedAt", "eventDate"] } },
          { name: "sortDir", in: "query", schema: { type: "string", enum: ["asc", "desc"] } },
        ],
        responses: { "200": { description: "Search results with pagination" } },
      },
    },
    "/calendar/events": {
      get: {
        tags: ["Calendar"],
        summary: "Get calendar events (classes, assignments, exams, milestones)",
        parameters: [
          { name: "types", in: "query", schema: { type: "string", example: "class,assignment,exam,milestone" } },
          { name: "courseId", in: "query", schema: { type: "string" } },
        ],
        responses: { "200": { description: "Array of FullCalendar-compatible event objects" } },
      },
    },
    "/calendar/ics": {
      get: {
        tags: ["Calendar"],
        summary: "Export calendar as iCalendar (.ics) file",
        parameters: [
          { name: "types", in: "query", schema: { type: "string" } },
          { name: "courseId", in: "query", schema: { type: "string" } },
        ],
        responses: { "200": { description: "iCalendar file", content: { "text/calendar": { schema: { type: "string" } } } } },
      },
    },
    "/notifications": {
      get: {
        tags: ["Notifications"],
        summary: "List notifications for the authenticated user",
        parameters: [
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
          { name: "unreadOnly", in: "query", schema: { type: "boolean" } },
        ],
        responses: { "200": { description: "Paginated notifications" } },
      },
    },
    "/settings/profile": {
      patch: {
        tags: ["Settings"],
        summary: "Update user profile",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { type: "object", properties: { name: { type: "string" }, career: { type: "string" }, university: { type: "string" }, timezone: { type: "string" } } },
            },
          },
        },
        responses: { "200": { description: "Updated user profile", content: { "application/json": { schema: { $ref: "#/components/schemas/User" } } } } },
      },
    },
  },
};
