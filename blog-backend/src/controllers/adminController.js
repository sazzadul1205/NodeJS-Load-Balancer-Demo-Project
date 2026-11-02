const pool = require("../config/db");
const config = require("../config/env");
const asyncHandler = require("../utils/asyncHandler");
const { forbidden } = require("../utils/errors");

/**
 * Truncate everything. Guarded by ADMIN_TOKEN in production.
 *
 * We take a single connection from the pool because FOREIGN_KEY_CHECKS is
 * session-scoped — if we set it on a different pooled connection the TRUNCATE
 * would run under the default (ON) and hit FK constraints.
 */
exports.reset = asyncHandler(async (req, res) => {
  const expected = process.env.ADMIN_TOKEN;
  if (expected) {
    if (req.headers["x-admin-token"] !== expected) {
      throw forbidden("invalid admin token");
    }
  } else if (config.env === "production") {
    throw forbidden("ADMIN_TOKEN must be set to allow reset in production");
  } else {
    console.warn("[admin] DB reset requested without ADMIN_TOKEN (dev mode)");
  }

  const conn = await pool.getConnection();
  try {
    await conn.query("SET FOREIGN_KEY_CHECKS=0");
    await conn.query("TRUNCATE TABLE comments");
    await conn.query("TRUNCATE TABLE posts");
    await conn.query("TRUNCATE TABLE users");
    await conn.query("SET FOREIGN_KEY_CHECKS=1");
  } finally {
    conn.release();
  }

  console.log(`[admin] DB reset — comments, posts, users truncated`);
  res.json({ ok: true, reset: ["comments", "posts", "users"] });
});
