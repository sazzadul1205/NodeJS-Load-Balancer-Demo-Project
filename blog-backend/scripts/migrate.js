#!/usr/bin/env node
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");

(async () => {
  const sql = fs.readFileSync(
    path.resolve(__dirname, "..", "db", "schema.sql"),
    "utf8",
  );
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "3306", 10),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    multipleStatements: true,
  });
  try {
    await conn.query(sql);
    console.log("[migrate] schema applied");
  } finally {
    await conn.end();
  }
})().catch((err) => {
  console.error("[migrate] failed:", err.message);
  process.exit(1);
});
