const pool = require("../config/db");
const config = require("../config/env");

// Views are buffered in memory and flushed to MySQL every N ms.
// Caveats:
//   - Per-instance buffer. Each instance flushes independently — that's fine,
//     `view_count = view_count + ?` is atomic per row in InnoDB.
//   - Up to VIEW_FLUSH_MS worth of views are lost on crash.
//   - No dedupe / no bot filtering.
// In real production, this belongs in Redis with a scheduled flush, and the
// per-post row hot-spot is why you don't UPDATE on every request.
const buffer = new Map();

exports.record = (postId) => {
  buffer.set(postId, (buffer.get(postId) || 0) + 1);
};

exports.flush = async () => {
  if (buffer.size === 0) return;
  const entries = [...buffer.entries()];
  buffer.clear();

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const [postId, delta] of entries) {
      await conn.execute(
        "UPDATE posts SET view_count = view_count + ? WHERE id = ?",
        [delta, postId],
      );
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    console.error("[viewCounter] flush failed:", err.message);
  } finally {
    conn.release();
  }
};

setInterval(() => exports.flush().catch(() => {}), config.viewFlushMs).unref();
