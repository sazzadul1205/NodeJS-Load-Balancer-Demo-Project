const express = require("express");
const helmet = require("helmet");
const compression = require("compression");
const cors = require("cors");
const morgan = require("morgan");

const config = require("./config/env");
const pool = require("./config/db");
const routes = require("./routes");
const requestId = require("./middleware/requestId");
const { notFound, errorHandler } = require("./middleware/errorHandler");
const { globalLimiter } = require("./middleware/rateLimit");

const app = express();

// Behind the LB later: trust one proxy hop so req.ip uses X-Forwarded-For.
app.set("trust proxy", 1);
app.disable("x-powered-by");

app.use(helmet());
app.use(compression());
app.use(cors());
app.use(express.json({ limit: "512kb" }));
app.use(requestId);

// Every response carries the instance name so you can verify round-robin.
app.use((req, res, next) => {
  res.setHeader("X-Instance", config.name);
  next();
});

morgan.token("rid", (req) => req.id);
morgan.token("target", (req) => req.headers["x-target"] || "-");
app.use(
  morgan(
    `[${config.name}] :method :url :status :res[content-length] - :response-time ms rid=:rid target=:target`,
    { skip: (req) => req.path === "/health" || req.path === "/stats" },
  ),
);

// Health & stats — NOT rate-limited so the LB's health polls don't eat quota.
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    name: config.name,
    port: config.port,
    pid: process.pid,
    uptimeSec: Math.round(process.uptime()),
  });
});

app.get("/stats", async (req, res, next) => {
  try {
    const [[u]] = await pool.query("SELECT COUNT(*) AS n FROM users");
    const [[p]] = await pool.query("SELECT COUNT(*) AS n FROM posts");
    const [[c]] = await pool.query("SELECT COUNT(*) AS n FROM comments");
    res.json({
      instance: { name: config.name, port: config.port, pid: process.pid },
      db: { users: u.n, posts: p.n, comments: c.n },
      uptimeSec: Math.round(process.uptime()),
    });
  } catch (err) {
    next(err);
  }
});

app.use(globalLimiter);
app.use("/api", routes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
