const pool = require("../config/db");

const COLS = "id, username, email, bio, password_hash, created_at";

exports.create = async ({ username, email, passwordHash }) => {
  const [result] = await pool.execute(
    "INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)",
    [username, email, passwordHash],
  );
  return result.insertId;
};

exports.findById = async (id) => {
  const [rows] = await pool.execute(
    `SELECT ${COLS} FROM users WHERE id = ? LIMIT 1`,
    [id],
  );
  return rows[0] || null;
};

exports.findByEmail = async (email) => {
  const [rows] = await pool.execute(
    `SELECT ${COLS} FROM users WHERE email = ? LIMIT 1`,
    [email],
  );
  return rows[0] || null;
};

exports.findByUsername = async (username) => {
  const [rows] = await pool.execute(
    `SELECT ${COLS} FROM users WHERE username = ? LIMIT 1`,
    [username],
  );
  return rows[0] || null;
};
