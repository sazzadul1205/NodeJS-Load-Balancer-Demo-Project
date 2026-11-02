const pool = require("../config/db");

const SELECT = `
  SELECT c.id, c.post_id, c.author_id, c.body, c.created_at,
         u.username AS author_username
    FROM comments c
    JOIN users u ON u.id = c.author_id
`;

exports.listForPost = async (postId, { page, limit }) => {
  const offset = (page - 1) * limit;
  const [countRows] = await pool.execute(
    "SELECT COUNT(*) AS total FROM comments WHERE post_id = ?",
    [postId],
  );
  const [rows] = await pool.execute(
    `${SELECT} WHERE c.post_id = ?
     ORDER BY c.created_at DESC, c.id DESC
     LIMIT ? OFFSET ?`,
    [postId, limit, offset],
  );
  return { rows, total: countRows[0].total };
};

exports.findById = async (id) => {
  const [rows] = await pool.execute(`${SELECT} WHERE c.id = ? LIMIT 1`, [id]);
  return rows[0] || null;
};

exports.create = async ({ postId, authorId, body }) => {
  const [result] = await pool.execute(
    "INSERT INTO comments (post_id, author_id, body) VALUES (?, ?, ?)",
    [postId, authorId, body],
  );
  return result.insertId;
};

exports.remove = async (id) => {
  await pool.execute("DELETE FROM comments WHERE id = ?", [id]);
};
