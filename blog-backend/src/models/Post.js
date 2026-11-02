const pool = require("../config/db");

const LIST_COLUMNS = `
  p.id, p.title, p.slug, p.excerpt, p.published,
  p.view_count, p.created_at, p.updated_at,
  u.id AS author_id, u.username AS author_username
`;
const DETAIL_COLUMNS = `${LIST_COLUMNS}, p.body`;
const FROM = "FROM posts p JOIN users u ON u.id = p.author_id";

exports.create = async ({
  authorId,
  title,
  slug,
  excerpt,
  body,
  published,
}) => {
  const [result] = await pool.execute(
    `INSERT INTO posts (author_id, title, slug, excerpt, body, published)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [authorId, title, slug, excerpt || null, body, published ? 1 : 0],
  );
  return result.insertId;
};

exports.findById = async (id) => {
  const [rows] = await pool.execute(
    `SELECT ${DETAIL_COLUMNS} ${FROM} WHERE p.id = ? LIMIT 1`,
    [id],
  );
  return rows[0] || null;
};

exports.findBySlug = async (slug) => {
  const [rows] = await pool.execute(
    `SELECT ${DETAIL_COLUMNS} ${FROM} WHERE p.slug = ? LIMIT 1`,
    [slug],
  );
  return rows[0] || null;
};

exports.list = async ({ page, limit, authorId, search }) => {
  const where = ["p.published = 1"];
  const params = [];

  if (authorId) {
    where.push("p.author_id = ?");
    params.push(authorId);
  }
  if (search) {
    where.push("MATCH(p.title, p.body) AGAINST (? IN NATURAL LANGUAGE MODE)");
    params.push(search);
  }

  const whereSql = `WHERE ${where.join(" AND ")}`;
  const offset = (page - 1) * limit;

  const [countRows] = await pool.execute(
    `SELECT COUNT(*) AS total ${FROM} ${whereSql}`,
    params,
  );

  const [rows] = await pool.execute(
    `SELECT ${LIST_COLUMNS} ${FROM} ${whereSql}
     ORDER BY p.created_at DESC, p.id DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );

  return { rows, total: countRows[0].total };
};

exports.update = async (id, patch) => {
  const fields = [];
  const params = [];
  for (const key of ["title", "excerpt", "body", "published"]) {
    if (patch[key] === undefined) continue;
    fields.push(`${key} = ?`);
    params.push(key === "published" ? (patch[key] ? 1 : 0) : patch[key]);
  }
  if (!fields.length) return false;
  params.push(id);
  await pool.execute(
    `UPDATE posts SET ${fields.join(", ")} WHERE id = ?`,
    params,
  );
  return true;
};

exports.remove = async (id) => {
  await pool.execute("DELETE FROM posts WHERE id = ?", [id]);
};
