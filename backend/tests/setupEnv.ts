process.env.NODE_ENV = "test";
process.env.BACKEND_PORT = process.env.BACKEND_PORT || "4000";
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/uniplanner?schema=public";
process.env.JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET || "test_access_secret_1234567890_abcdefghijklmn";
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || "test_refresh_secret_1234567890_abcdefghijklmn";
process.env.ACCESS_TOKEN_TTL_MINUTES = process.env.ACCESS_TOKEN_TTL_MINUTES || "15";
process.env.REFRESH_TOKEN_TTL_DAYS = process.env.REFRESH_TOKEN_TTL_DAYS || "7";
process.env.FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";
process.env.REDIS_PASSWORD = process.env.REDIS_PASSWORD || "test_redis_password_1234567890";
process.env.REDIS_URL =
  process.env.REDIS_URL || "redis://:test_redis_password_1234567890@localhost:6379";
process.env.SMTP_HOST = process.env.SMTP_HOST || "smtp.test.local";
process.env.SMTP_PORT = process.env.SMTP_PORT || "2525";
process.env.SMTP_USER = process.env.SMTP_USER || "test-user";
process.env.SMTP_PASS = process.env.SMTP_PASS || "test-pass";
