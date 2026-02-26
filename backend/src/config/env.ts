import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  BACKEND_PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET must be at least 32 chars"),
  JWT_REFRESH_SECRET: z.string().min(32, "JWT_REFRESH_SECRET must be at least 32 chars"),
  ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().default(15),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().default(7),
  FRONTEND_URL: z.string().default("http://localhost:5173"),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().default("UniPlanner <no-reply@uniplanner.local>"),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  REDIS_PASSWORD: z.string().min(16, "REDIS_PASSWORD must be at least 16 chars").optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const fieldErrors = parsed.error.flatten().fieldErrors;
  const lines = Object.entries(fieldErrors)
    .map(([key, errors]) => `  • ${key}: ${(errors ?? []).join(", ")}`)
    .join("\n");

  console.error("━━━ [boot] Invalid environment variables ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.error(lines);
  console.error("  → Copy .env.example to .env and set the missing/invalid values.");
  console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  process.exit(1);
}

const redisPasswordFromUrl = (() => {
  try {
    const url = new URL(parsed.data.REDIS_URL);
    return url.password || undefined;
  } catch {
    return undefined;
  }
})();

if (!parsed.data.REDIS_PASSWORD && !redisPasswordFromUrl) {
  console.error("REDIS_PASSWORD is required, or REDIS_URL must include a password.");
  process.exit(1);
}

export const env = {
  ...parsed.data,
  REDIS_PASSWORD: parsed.data.REDIS_PASSWORD ?? redisPasswordFromUrl!,
};
export const isProd = env.NODE_ENV === "production";
