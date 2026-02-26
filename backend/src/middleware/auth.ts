import { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "../lib/tokens";

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    const error = new Error("Unauthorized") as Error & { status?: number };
    error.status = 401;
    next(error);
    return;
  }

  const token = authHeader.replace("Bearer ", "").trim();

  try {
    const payload = verifyAccessToken(token);
    req.user = {
      userId: payload.sub,
      email: payload.email,
      name: payload.name,
    };
    next();
  } catch {
    const error = new Error("Invalid or expired token") as Error & { status?: number };
    error.status = 401;
    next(error);
  }
}
