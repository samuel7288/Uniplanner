import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const optionalNonEmptyString = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}, z.string().optional());

const optionalPort = z.preprocess((value) => {
  if (value === "" || value === undefined || value === null) return undefined;
  return value;
}, z.coerce.number().int().positive().optional());

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  BACKEND_PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET must be at least 32 chars"),
  JWT_REFRESH_SECRET: z.string().min(32, "JWT_REFRESH_SECRET must be at least 32 chars"),
  ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().default(15),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().default(7),
  FRONTEND_URL: z.string().default("http://localhost:5173"),
  SMTP_HOST: optionalNonEmptyString,
  SMTP_PORT: optionalPort,
  SMTP_USER: optionalNonEmptyString,
  SMTP_PASS: optionalNonEmptyString,
  EMAIL_FROM: z.string().default("UniPlanner <no-reply@uniplanner.local>"),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  REDIS_PASSWORD: z.string().min(16, "REDIS_PASSWORD must be at least 16 chars").optional(),
}).superRefine((data, ctx) => {
  const smtpFields = [data.SMTP_HOST, data.SMTP_PORT, data.SMTP_USER, data.SMTP_PASS];
  const definedCount = smtpFields.filter((value) => value !== undefined).length;
  if (definedCount !== 0 && definedCount !== 4) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["SMTP_HOST"],
      message: "If SMTP is configured, SMTP_HOST, SMTP_PORT, SMTP_USER and SMTP_PASS are all required",
    });
  }
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
