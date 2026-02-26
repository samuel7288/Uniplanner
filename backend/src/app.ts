import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import pinoHttp from "pino-http";
import swaggerUi from "swagger-ui-express";
import { openApiDocument } from "./docs/openapi";
import { env, isProd } from "./config/env";
import { logger } from "./lib/logger";
import { prisma } from "./lib/prisma";
import { isRedisReady } from "./lib/queue";
import { csrfProtection } from "./middleware/csrf";
import { errorHandler, notFound } from "./middleware/error";
import { authRoutes } from "./routes/auth";
import { assignmentsRoutes } from "./routes/assignments";
import { calendarRoutes } from "./routes/calendar";
import { coursesRoutes } from "./routes/courses";
import { dashboardRoutes } from "./routes/dashboard";
import { examsRoutes } from "./routes/exams";
import { gradesRoutes } from "./routes/grades";
import { notificationsRoutes } from "./routes/notifications";
import { planningRoutes } from "./routes/planning";
import { projectsRoutes } from "./routes/projects";
import { searchRoutes } from "./routes/search";
import { settingsRoutes } from "./routes/settings";

export const app = express();

app.set("trust proxy", 1);

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many authentication attempts. Try again later." },
});

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
  }),
);
app.use(globalLimiter);
app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: "2mb" }));
app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === "/api/health" } }));
app.use(csrfProtection);

// Interactive API documentation
if (!isProd) {
  app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(openApiDocument, { customSiteTitle: "UniPlanner API" }));
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "UniPlanner API",
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

// /api/ready — full dependency check for orchestrators / deploy gates.
// Use this endpoint (not /api/health) to decide if traffic can be routed.
app.get("/api/ready", async (_req, res) => {
  let dbStatus: "ready" | "unavailable" = "unavailable";
  let redisStatus: "ready" | "unavailable" = "unavailable";

  // Check DB
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbStatus = "ready";
  } catch {
    // db unavailable — logged below
  }

  // Check Redis (synchronous status from ioredis)
  redisStatus = isRedisReady() ? "ready" : "unavailable";

  const allReady = dbStatus === "ready" && redisStatus === "ready";

  if (!allReady) {
    logger.warn({ dbStatus, redisStatus }, "/api/ready: one or more dependencies unavailable");
  }

  res.status(allReady ? 200 : 503).json({
    ok: allReady,
    service: "UniPlanner API",
    db: dbStatus,
    redis: redisStatus,
    timestamp: new Date().toISOString(),
  });
});

app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/courses", coursesRoutes);
app.use("/api/assignments", assignmentsRoutes);
app.use("/api/exams", examsRoutes);
app.use("/api/projects", projectsRoutes);
app.use("/api/grades", gradesRoutes);
app.use("/api/notifications", notificationsRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/planning", planningRoutes);
app.use("/api/calendar", calendarRoutes);
app.use("/api/search", searchRoutes);

app.use(notFound);
app.use(errorHandler);
