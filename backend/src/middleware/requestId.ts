import { randomUUID } from "crypto";
import { NextFunction, Request, Response } from "express";

function normalizeRequestId(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > 128) return null;
  return trimmed;
}

export function attachRequestId(req: Request, res: Response, next: NextFunction): void {
  const existing = normalizeRequestId(req.get("x-request-id") ?? undefined);
  const requestId = existing ?? randomUUID();

  req.requestId = requestId;
  (req as Request & { id?: string }).id = requestId;
  res.setHeader("x-request-id", requestId);
  next();
}
