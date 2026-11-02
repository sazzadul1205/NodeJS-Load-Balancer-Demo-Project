// Explicit whitelist — never spread the raw DB row (password_hash must never leak).
exports.user = (row) => ({
  id: row.id,
  username: row.username,
  email: row.email,
  bio: row.bio,
  createdAt: row.created_at,
});
