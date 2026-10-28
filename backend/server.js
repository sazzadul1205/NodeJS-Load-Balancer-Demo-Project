const http = require("http");
const mysql = require("mysql2/promise");

const PORT = parseInt(process.env.PORT || "8001", 10);
const NAME = process.env.NAME || `api-${PORT}`;
const STARTED_AT = Date.now();

// ---------- Request counter ----------
const stats = {
  total: 0,
  byMethod: { GET: 0, POST: 0, PUT: 0, PATCH: 0, DELETE: 0, OTHER: 0 },
  byPath: {},
  healthChecks: 0,
  errors: 0,
};

function bumpCounter(method, path) {
  stats.total += 1;
  const m = stats.byMethod[method] !== undefined ? method : "OTHER";
  stats.byMethod[m] += 1;
  stats.byPath[path] = (stats.byPath[path] || 0) + 1;
}

// ---------- MySQL ----------
const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "3306", 10),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "lb_demo",
  connectionLimit: 10,
  waitForConnections: true,
  queueLimit: 0,
});

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
};

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json", ...CORS });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (c) => {
      raw += c;
      if (raw.length > 1e6) req.destroy();
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  const t0 = Date.now();
  const pathname = req.url.split("?")[0];

  // CORS preflight — not counted (it's not "real work")
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS);
    return res.end();
  }

  // ---------- Log every request with routing info ----------
  const xTarget = req.headers["x-target"] || "-";
  const xFwdFor = req.headers["x-forwarded-for"] || "-";
  const xFwdBy = req.headers["x-forwarded-by"] || "-";

  // Health checks get their own counter and shorter log
  if (pathname === "/health") {
    stats.healthChecks += 1;
    console.log(
      `[${NAME}] HEALTH #${stats.healthChecks} from x-target=${xTarget}`,
    );
    return json(res, 200, {
      status: "ok",
      name: NAME,
      port: PORT,
      uptimeSec: Math.round((Date.now() - STARTED_AT) / 1000),
      handled: stats.total,
      healthChecks: stats.healthChecks,
    });
  }

  // Real request — count it
  bumpCounter(req.method, pathname);

  console.log(
    `[${NAME}] #${stats.total} ${req.method} ${req.url} ` +
      `| x-target=${xTarget} x-forwarded-for=${xFwdFor} x-forwarded-by=${xFwdBy}`,
  );

  try {
    if (req.method === "GET" && pathname === "/submissions") {
      const [rows] = await pool.query(
        `SELECT id, name, email, message, served_by, created_at
           FROM submissions ORDER BY id DESC LIMIT 50`,
      );
      return json(res, 200, rows);
    }

    if (req.method === "GET" && pathname === "/stats") {
      const [[totals]] = await pool.query(
        `SELECT COUNT(*) AS total FROM submissions`,
      );
      const [rows] = await pool.query(
        `SELECT served_by, COUNT(*) AS count
           FROM submissions GROUP BY served_by ORDER BY served_by`,
      );
      return json(res, 200, {
        total: totals.total,
        byBackend: rows,
        // Also return this node's own in-memory counters
        node: { name: NAME, port: PORT, ...stats },
      });
    }

    if (req.method === "GET" && pathname === "/self-stats") {
      return json(res, 200, {
        name: NAME,
        port: PORT,
        pid: process.pid,
        uptimeSec: Math.round((Date.now() - STARTED_AT) / 1000),
        ...stats,
      });
    }

    if (req.method === "POST" && pathname === "/submit") {
      const body = await readBody(req);
      const name = (body.name || "").trim();
      const email = (body.email || "").trim();
      const message = (body.message || "").trim();
      if (!name || !email) {
        stats.errors += 1;
        return json(res, 400, {
          error: "name and email required",
          servedBy: NAME,
        });
      }

      const [result] = await pool.execute(
        `INSERT INTO submissions (name, email, message, served_by) VALUES (?, ?, ?, ?)`,
        [name.slice(0, 100), email.slice(0, 200), message.slice(0, 2000), NAME],
      );
      return json(res, 201, {
        id: result.insertId,
        servedBy: NAME,
        handled: stats.total,
        ms: Date.now() - t0,
      });
    }

    return json(res, 404, { error: "not found", path: pathname });
  } catch (err) {
    stats.errors += 1;
    console.error(`[${NAME}] ERROR #${stats.total}: ${err.message}`);
    return json(res, 500, { error: "internal error", servedBy: NAME });
  }
});

// ---------- Periodic self-report every 30s ----------
setInterval(() => {
  if (stats.total === 0 && stats.healthChecks === 0) return;
  const uptime = Math.round((Date.now() - STARTED_AT) / 1000);
  console.log(
    `[${NAME}] 📊 total=${stats.total} ` +
      `GET=${stats.byMethod.GET} POST=${stats.byMethod.POST} ` +
      `health=${stats.healthChecks} errors=${stats.errors} uptime=${uptime}s`,
  );
}, 30000);

server.listen(PORT, () => {
  console.log(
    `[${NAME}] listening on http://localhost:${PORT} (pid ${process.pid})`,
  );
});

process.on("SIGINT", async () => {
  console.log(`\n[${NAME}] shutting down. Final stats:`, stats);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
});
