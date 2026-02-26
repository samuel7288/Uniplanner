import { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { logger } from "../lib/logger";

export function notFound(_req: Request, _res: Response, next: NextFunction): void {
  const error = new Error("Route not found") as Error & { status?: number };
  error.status = 404;
  next(error);
}

export function errorHandler(
  err: Error & { status?: number; details?: unknown },
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const isPrismaDbUnavailable =
    err instanceof Prisma.PrismaClientInitializationError ||
    err.message.includes("Can't reach database server") ||
    err.message.includes("Connection refused") ||
    err.message.includes("ECONNREFUSED");

  const status = err.status ?? (isPrismaDbUnavailable ? 503 : 500);
  const message = isPrismaDbUnavailable ? "Database unavailable. Try again in a moment." : err.message;

  if (status >= 500) {
    logger.error({ err, method: req.method, url: req.url }, "Unhandled server error");
  }

  res.status(status).json({
    message: message || "Internal Server Error",
    details: err.details,
  });
}
