import { NextFunction, Request, Response } from "express";
import { env } from "../config/env";

const STATE_CHANGING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function toOrigin(value?: string): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

const allowedOrigin = toOrigin(env.FRONTEND_URL);

export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  if (!STATE_CHANGING_METHODS.has(req.method)) {
    next();
    return;
  }

  const origin = toOrigin(req.get("origin") ?? undefined);
  const refererOrigin = toOrigin(req.get("referer") ?? undefined);

  // Non-browser/API clients usually do not send Origin/Referer.
  if (!origin && !refererOrigin) {
    next();
    return;
  }

  if (!allowedOrigin) {
    res.status(500).json({ message: "Invalid FRONTEND_URL configuration" });
    return;
  }

  if (origin === allowedOrigin || refererOrigin === allowedOrigin) {
    next();
    return;
  }

  res.status(403).json({ message: "CSRF validation failed" });
}
