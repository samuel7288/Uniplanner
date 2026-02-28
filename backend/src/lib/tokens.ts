import crypto from "crypto";
import jwt, { Secret } from "jsonwebtoken";
import { env } from "../config/env";

export type AccessTokenPayload = {
  sub: string;
  email: string;
  name: string;
  type: "access";
};

export type RefreshTokenPayload = {
  sub: string;
  type: "refresh";
  jti?: string;
};

export function createAccessToken(payload: Omit<AccessTokenPayload, "type">): string {
  return jwt.sign(
    {
      ...payload,
      type: "access",
    },
    env.JWT_ACCESS_SECRET as Secret,
    { expiresIn: `${env.ACCESS_TOKEN_TTL_MINUTES}m` },
  );
}

export function createRefreshToken(userId: string): string {
  return jwt.sign(
    {
      sub: userId,
      type: "refresh",
      jti: crypto.randomUUID(),
    },
    env.JWT_REFRESH_SECRET as Secret,
    { expiresIn: `${env.REFRESH_TOKEN_TTL_DAYS}d` },
  );
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const payload = jwt.verify(token, env.JWT_ACCESS_SECRET as Secret) as AccessTokenPayload;
  if (payload.type !== "access") {
    throw new Error("Invalid token type");
  }
  return payload;
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  const payload = jwt.verify(token, env.JWT_REFRESH_SECRET as Secret) as RefreshTokenPayload;
  if (payload.type !== "refresh") {
    throw new Error("Invalid token type");
  }
  return payload;
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function generateRandomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("hex");
}
