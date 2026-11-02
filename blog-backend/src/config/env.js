require("dotenv").config();

// Fail loud in production, warn in dev.
if (!process.env.JWT_SECRET) {
  if (process.env.NODE_ENV === "production") {
    console.error("[config] JWT_SECRET is required in production");
    process.exit(1);
  }
  console.warn("[config] JWT_SECRET not set — using insecure dev default");
}

module.exports = {
  env: process.env.NODE_ENV || "development",
  port: parseInt(process.env.PORT || "9001", 10),
  name: process.env.NAME || `blog-${process.env.PORT || "9001"}`,
  jwt: {
    secret: process.env.JWT_SECRET || "dev-only-change-me",
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  },
  db: {
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "3306", 10),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "blog",
  },
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || "60000", 10),
    max: parseInt(process.env.RATE_LIMIT_MAX || "3000", 10),
    authMax: parseInt(process.env.AUTH_RATE_LIMIT_MAX || "20", 10),
  },
  viewFlushMs: parseInt(process.env.VIEW_FLUSH_MS || "10000", 10),
};
