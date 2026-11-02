/**
 * Load Balancer — a real one, not a demo.
 *
 * Features
 *   - 4 strategies: round-robin, least-connections, random, weighted (smooth WRR)
 *   - Active health checks with hysteresis (N fails to go down, N passes to come up)
 *   - Passive health checks (proxy errors feed back into health state)
 *   - Retry on idempotent methods (GET/HEAD) against a different backend
 *   - Per-backend keep-alive agent — no TCP handshake per request
 *   - Graceful drain on disable / SIGTERM
 *   - Prometheus-style /metrics endpoint
 *   - Per-request IDs propagated to backends as x-request-id
 *
 * Env vars (all optional):
 *   PORT                    LB listen port                   (default 8000)
 *   API_PORTS               Comma list of backend ports       (default 8001,8002,8003)
 *   STRATEGY                round-robin | least-connections | random | weighted
 *   HEALTH_INTERVAL_MS      Active health poll interval       (default 5000)
 *   HEALTH_TIMEOUT_MS       Per health check timeout          (default 2000)
 *   HEALTH_FAIL_THRESHOLD   Consecutive fails → DOWN          (default 2)
 *   HEALTH_PASS_THRESHOLD   Consecutive passes → UP           (default 2)
 *   REQUEST_TIMEOUT_MS      Per proxied request timeout       (default 15000)
 *   RETRY_ON_GET            Retry idempotent on failure       (default true)
 *   MAX_RETRIES             Retry attempts per request        (default 1)
 *   DRAIN_MS                Shutdown drain window             (default 30000)
 *
 * Weights (optional, weighted strategy only):
 *   API_WEIGHTS             "8001:1,8002:2,8003:1"   (port:weight)
 */

const http = require("http");
const https = require("https");
const { URL } = require("url");
const { randomUUID } = require("crypto");

/* =====================================================================
 * 1. CONFIG
 * ===================================================================== */

const VALID_STRATEGIES = [
  "round-robin",
  "least-connections",
  "random",
  "weighted",
];

const CONFIG = {
  port: parseInt(process.env.PORT || "8000", 10),
  strategy: (process.env.STRATEGY || "round-robin").toLowerCase(),
  health: {
    intervalMs: parseInt(process.env.HEALTH_INTERVAL_MS || "5000", 10),
    timeoutMs: parseInt(process.env.HEALTH_TIMEOUT_MS || "2000", 10),
    failThreshold: parseInt(process.env.HEALTH_FAIL_THRESHOLD || "2", 10),
    passThreshold: parseInt(process.env.HEALTH_PASS_THRESHOLD || "2", 10),
  },
  request: {
    timeoutMs: parseInt(process.env.REQUEST_TIMEOUT_MS || "15000", 10),
    retryOnIdempotent: (process.env.RETRY_ON_GET || "true") === "true",
    maxRetries: parseInt(process.env.MAX_RETRIES || "1", 10),
  },
  drainMs: parseInt(process.env.DRAIN_MS || "30000", 10),
};

if (!VALID_STRATEGIES.includes(CONFIG.strategy)) {
  console.error(
    `[config] Invalid STRATEGY "${CONFIG.strategy}". ` +
      `Valid: ${VALID_STRATEGIES.join(", ")}`,
  );
  process.exit(1);
}

/* =====================================================================
 * 2. BACKEND MODEL
 * ===================================================================== */

class Backend {
  constructor(port, weight = 1) {
    this.name = `api-${port}`;
    this.port = port;
    this.url = `http://localhost:${port}`;
    this.weight = Math.max(1, weight | 0);

    // --- Availability state ---
    this.enabled = true; // admin toggle (immediate)
    this.healthy = true; // health-check verdict
    this.draining = false; // graceful drain — no new traffic

    // --- Hysteresis counters (avoid flapping) ---
    this.consecutiveFails = 0;
    this.consecutivePasses = 0;

    // --- Live load (for least-connections) ---
    this.activeRequests = 0;

    // --- Cumulative stats ---
    this.totalProxied = 0; // requests LB sent here
    this.totalFailed = 0; // proxy attempts that errored
    this.totalRetried = 0; // retried away from this backend
    this.totalRetriesReceived = 0; // retries that landed here

    // --- Health check info ---
    this.lastCheckAt = null;
    this.lastError = null;

    // --- Weighted round-robin state ---
    this.currentWeight = 0;

    // --- Keep-alive HTTP agent ---
    // One agent per backend. Reusing TCP connections is the single biggest
    // throughput win over "new connection per request". maxSockets caps how
    // many concurrent in-flight requests this backend sees from us.
    this.agent = new http.Agent({
      keepAlive: true,
      keepAliveMsecs: 10000,
      maxSockets: 200,
      maxFreeSockets: 50,
    });
  }

  /** Can this backend receive a NEW request right now? */
  get available() {
    return this.enabled && this.healthy && !this.draining;
  }
}

/* =====================================================================
 * 3. SERVER REGISTRY
 * ===================================================================== */

const PORTS = (process.env.API_PORTS || "8001,8002,8003")
  .split(",")
  .map((p) => parseInt(p.trim(), 10))
  .filter((p) => Number.isInteger(p) && p > 0 && p < 65536);

if (PORTS.length === 0) {
  console.error("[config] API_PORTS parsed to empty list");
  process.exit(1);
}

// Optional weights: "8001:1,8002:2,8003:1"
const WEIGHTS = {};
if (process.env.API_WEIGHTS) {
  for (const pair of process.env.API_WEIGHTS.split(",")) {
    const [portStr, wStr] = pair.split(":");
    const port = parseInt(portStr, 10);
    const w = parseInt(wStr, 10);
    if (Number.isInteger(port) && Number.isInteger(w) && w > 0) {
      WEIGHTS[port] = w;
    }
  }
}

const servers = PORTS.map((port) => new Backend(port, WEIGHTS[port] || 1));

// Global mutable selection state
const state = {
  rrIndex: 0, // round-robin cursor
  lbStats: {
    startedAt: Date.now(),
    totalRequests: 0,
    totalProxied: 0,
    total502: 0,
    total503: 0,
    total504: 0,
    totalRetries: 0,
  },
};

/* =====================================================================
 * 4. BALANCING STRATEGIES
 * ===================================================================== */

/** Classic round-robin. Skips unavailable backends but advances the cursor. */
function pickRoundRobin() {
  for (let i = 0; i < servers.length; i++) {
    const idx = (state.rrIndex + i) % servers.length;
    if (servers[idx].available) {
      state.rrIndex = (idx + 1) % servers.length;
      return servers[idx];
    }
  }
  return null;
}

/** Route to the backend with the fewest in-flight requests. */
function pickLeastConnections() {
  let min = Infinity;
  let candidates = [];
  for (const s of servers) {
    if (!s.available) continue;
    if (s.activeRequests < min) {
      min = s.activeRequests;
      candidates = [s];
    } else if (s.activeRequests === min) {
      candidates.push(s);
    }
  }
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  // Round-robin tie-break keeps distribution even under uniform load.
  const idx = state.rrIndex % candidates.length;
  state.rrIndex = (state.rrIndex + 1) % candidates.length;
  return candidates[idx];
}

/** Uniform random over available backends. */
function pickRandom() {
  const available = servers.filter((s) => s.available);
  if (!available.length) return null;
  return available[Math.floor(Math.random() * available.length)];
}

/**
 * Smooth Weighted Round-Robin (nginx algorithm).
 * Backend weight=2 receives 2x the requests, and it avoids the "burst then
 * starve" problem of naive WRR by recomputing `currentWeight` each tick.
 */
function pickWeighted() {
  let total = 0;
  let best = null;
  for (const s of servers) {
    if (!s.available) continue;
    s.currentWeight += s.weight;
    total += s.weight;
    if (!best || s.currentWeight > best.currentWeight) best = s;
  }
  if (!best) return null;
  best.currentWeight -= total;
  return best;
}

function pickServer() {
  switch (CONFIG.strategy) {
    case "least-connections":
      return pickLeastConnections();
    case "random":
      return pickRandom();
    case "weighted":
      return pickWeighted();
    case "round-robin":
    default:
      return pickRoundRobin();
  }
}

/* =====================================================================
 * 5. HEALTH CHECKS
 * ===================================================================== */

// Failures that mean "the port is definitely closed" — we can trust these
// and take the backend out without waiting for failThreshold. Genuine
// flakiness (timeout, reset) still goes through hysteresis.
const HARD_FAIL_CODES = new Set(["ECONNREFUSED", "ENOTFOUND", "EHOSTUNREACH"]);

function healthSuccess(server) {
  server.consecutiveFails = 0;
  server.consecutivePasses += 1;
  server.lastCheckAt = Date.now();

  if (
    !server.healthy &&
    server.consecutivePasses >= CONFIG.health.passThreshold
  ) {
    server.healthy = true;
    server.lastError = null;
    console.log(
      `[health] ${server.name} UP (after ${server.consecutivePasses} passes)`,
    );
  }
}

function healthFailure(server, reason, hard = false) {
  server.consecutivePasses = 0;
  server.consecutiveFails += 1;
  server.lastCheckAt = Date.now();
  server.lastError = reason;

  const threshold = hard ? 1 : CONFIG.health.failThreshold;
  if (server.healthy && server.consecutiveFails >= threshold) {
    server.healthy = false;
    console.log(
      `[health] ${server.name} DOWN (${reason}) after ${server.consecutiveFails} fail(s)`,
    );
  }
}

function checkOne(server) {
  if (!server.enabled || server.draining) return;

  const url = new URL("/health", server.url);
  const client = url.protocol === "https:" ? https : http;

  const req = client.request(
    url,
    { method: "GET", timeout: CONFIG.health.timeoutMs },
    (res) => {
      res.resume();
      if (res.statusCode === 200) healthSuccess(server);
      else healthFailure(server, `status ${res.statusCode}`);
    },
  );

  req.on("error", (err) => healthFailure(server, err.code || err.message));
  req.on("timeout", () => {
    req.destroy();
    healthFailure(server, "timeout");
  });
  req.end();
}

function checkAll() {
  servers.forEach(checkOne);
}

/* =====================================================================
 * 6. PROXY
 * ===================================================================== */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Request-Id",
  "Access-Control-Expose-Headers": "X-Request-Id,X-Instance,X-Target",
  "Access-Control-Max-Age": "86400",
};

function json(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    ...CORS_HEADERS,
  });
  res.end(JSON.stringify(body));
}

function proxyRequest(clientReq, clientRes, target, attempt = 1) {
  const targetUrl = new URL(clientReq.url, target.url);
  const client = targetUrl.protocol === "https:" ? https : http;

  // ---- Track in-flight for least-connections ----
  target.activeRequests += 1;
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    target.activeRequests = Math.max(0, target.activeRequests - 1);
  };

  // ---- Forwarded headers (RFC 7239 de-facto) ----
  const headers = { ...clientReq.headers };

  const remote = clientReq.socket.remoteAddress || "unknown";
  headers["x-forwarded-for"] = clientReq.headers["x-forwarded-for"]
    ? `${clientReq.headers["x-forwarded-for"]}, ${remote}`
    : remote;
  headers["x-forwarded-proto"] =
    clientReq.headers["x-forwarded-proto"] || "http";
  headers["x-forwarded-host"] =
    clientReq.headers["x-forwarded-host"] || clientReq.headers.host || "";

  headers["x-forwarded-by"] = "balance.local";
  headers["x-target"] = target.name;
  headers["x-attempt"] = String(attempt);
  headers["x-request-id"] = clientReq.id;

  const options = {
    method: clientReq.method,
    headers,
    timeout: CONFIG.request.timeoutMs,
    agent: target.agent, // keep-alive!
  };

  let responded = false;

  const proxyReq = client.request(targetUrl, options, (proxyRes) => {
    responded = true;
    clientRes.writeHead(proxyRes.statusCode, {
      ...proxyRes.headers,
      ...CORS_HEADERS,
      "X-Request-Id": clientReq.id,
    });
    proxyRes.pipe(clientRes);
    proxyRes.on("end", finish);
    proxyRes.on("error", finish);
  });

  proxyReq.on("error", (err) => {
    target.totalFailed += 1;

    // Feed passive failure into health state.
    // Hard errors (port closed) skip hysteresis — we're sure.
    const hard = HARD_FAIL_CODES.has(err.code);
    healthFailure(target, err.code || err.message, hard);

    // Can we retry? Only if:
    //  - nothing already streamed to the client
    //  - idempotent method
    //  - we haven't exhausted the budget
    //  - the client is still connected
    const canRetry =
      !responded &&
      !clientRes.headersSent &&
      !clientRes.writableEnded &&
      CONFIG.request.retryOnIdempotent &&
      (clientReq.method === "GET" || clientReq.method === "HEAD") &&
      attempt <= CONFIG.request.maxRetries;

    if (canRetry) {
      const next = pickServer();
      if (next && next !== target) {
        target.totalRetried += 1;
        next.totalRetriesReceived += 1;
        state.lbStats.totalRetries += 1;
        console.warn(
          `[lb] [${clientReq.id}] retry ${clientReq.method} ${clientReq.url} ` +
            `${target.name} → ${next.name} (attempt ${attempt + 1}/${CONFIG.request.maxRetries + 1})`,
        );
        finish();
        return proxyRequest(clientReq, clientRes, next, attempt + 1);
      }
    }

    console.error(
      `[lb] [${clientReq.id}] proxy error ${target.name}: ${err.message}`,
    );
    state.lbStats.total502 += 1;
    if (!clientRes.headersSent) {
      json(clientRes, 502, {
        error: "Bad Gateway",
        target: target.name,
        reason: err.message,
        requestId: clientReq.id,
      });
    }
    finish();
  });

  proxyReq.on("timeout", () => {
    proxyReq.destroy();
    state.lbStats.total504 += 1;
    console.error(
      `[lb] [${clientReq.id}] timeout ${target.name} after ${CONFIG.request.timeoutMs}ms`,
    );
    if (!clientRes.headersSent) {
      json(clientRes, 504, {
        error: "Gateway Timeout",
        target: target.name,
        requestId: clientReq.id,
      });
    }
    finish();
  });

  // Client hung up before we finished — abort upstream.
  clientReq.on("aborted", () => proxyReq.destroy());
  clientRes.on("close", finish);

  clientReq.pipe(proxyReq);
}

/* =====================================================================
 * 7. ADMIN API
 * ===================================================================== */

function readJson(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
    req.on("error", () => resolve({}));
  });
}

function serverSnapshot(s, extra = {}) {
  return {
    name: s.name,
    url: s.url,
    weight: s.weight,
    enabled: s.enabled,
    healthy: s.healthy,
    draining: s.draining,
    available: s.available,
    activeRequests: s.activeRequests,
    consecutiveFails: s.consecutiveFails,
    consecutivePasses: s.consecutivePasses,
    totalProxied: s.totalProxied,
    totalFailed: s.totalFailed,
    totalRetried: s.totalRetried,
    totalRetriesReceived: s.totalRetriesReceived,
    lastCheckAt: s.lastCheckAt,
    lastError: s.lastError,
    ...extra,
  };
}

async function handleAdmin(req, res, pathname) {
  // GET /admin/health — quick snapshot
  if (req.method === "GET" && pathname === "/admin/health") {
    return json(res, 200, {
      strategy: CONFIG.strategy,
      total: servers.length,
      available: servers.filter((s) => s.available).length,
      lb: state.lbStats,
      servers: servers.map((s) => ({
        name: s.name,
        enabled: s.enabled,
        healthy: s.healthy,
        draining: s.draining,
        activeRequests: s.activeRequests,
        totalProxied: s.totalProxied,
      })),
    });
  }

  // GET /admin/servers — full registry
  if (req.method === "GET" && pathname === "/admin/servers") {
    return json(
      res,
      200,
      servers.map((s) => serverSnapshot(s)),
    );
  }

  // GET /admin/config — effective config
  if (req.method === "GET" && pathname === "/admin/config") {
    return json(res, 200, { ...CONFIG, ports: PORTS, weights: WEIGHTS });
  }

  // POST /admin/strategy — swap strategy at runtime
  if (req.method === "POST" && pathname === "/admin/strategy") {
    const body = await readJson(req);
    const s = String(body.strategy || "").toLowerCase();
    if (!VALID_STRATEGIES.includes(s)) {
      return json(res, 400, {
        error: "invalid strategy",
        valid: VALID_STRATEGIES,
      });
    }
    const prev = CONFIG.strategy;
    CONFIG.strategy = s;
    console.log(`[admin] strategy ${prev} → ${s}`);
    return json(res, 200, { ok: true, strategy: s });
  }

  // POST /admin/reset — zero every counter, keep health state.
  // Health is *reality*, not bookkeeping — don't fake it.
  if (req.method === "POST" && pathname === "/admin/reset") {
    state.rrIndex = 0;
    state.lbStats = {
      startedAt: Date.now(),
      totalRequests: 0,
      totalProxied: 0,
      total502: 0,
      total503: 0,
      total504: 0,
      totalRetries: 0,
    };
    servers.forEach((s) => {
      s.totalProxied = 0;
      s.totalFailed = 0;
      s.totalRetried = 0;
      s.totalRetriesReceived = 0;
      s.currentWeight = 0;
    });
    console.log("[admin] counters reset");
    return json(res, 200, { ok: true, reset: "counters" });
  }

  // POST /admin/servers/:name/(enable|disable|drain|undrain)
  const match = pathname.match(
    /^\/admin\/servers\/([^/]+)\/(enable|disable|drain|undrain)$/,
  );
  if (req.method === "POST" && match) {
    const [, name, action] = match;
    const server = servers.find((s) => s.name === name);
    if (!server) return json(res, 404, { error: "server not found", name });

    switch (action) {
      case "enable":
        server.enabled = true;
        server.draining = false;
        // Reset hysteresis so a stale DOWN doesn't linger.
        server.consecutiveFails = 0;
        server.consecutivePasses = 0;
        console.log(`[admin] ${name} ENABLED`);
        checkOne(server); // immediate re-probe
        break;
      case "disable":
        server.enabled = false;
        server.draining = false;
        console.log(`[admin] ${name} DISABLED`);
        break;
      case "drain":
        server.draining = true;
        console.log(
          `[admin] ${name} DRAINING (${server.activeRequests} in flight)`,
        );
        break;
      case "undrain":
        server.draining = false;
        console.log(`[admin] ${name} UNDRAINED`);
        checkOne(server);
        break;
    }
    return json(res, 200, { ok: true, server: serverSnapshot(server) });
  }

  return json(res, 404, { error: "admin route not found", path: pathname });
}

/* =====================================================================
 * 8. METRICS (Prometheus text format — point a scraper at /metrics)
 * ===================================================================== */

function handleMetrics(req, res) {
  const lines = [];
  const push = (l) => lines.push(l);

  push("# HELP lb_requests_total Requests proxied per backend");
  push("# TYPE lb_requests_total counter");
  for (const s of servers) {
    push(`lb_requests_total{backend="${s.name}"} ${s.totalProxied}`);
  }

  push("# HELP lb_active_requests In-flight requests per backend");
  push("# TYPE lb_active_requests gauge");
  for (const s of servers) {
    push(`lb_active_requests{backend="${s.name}"} ${s.activeRequests}`);
  }

  push("# HELP lb_healthy Health-check status (1=up, 0=down)");
  push("# TYPE lb_healthy gauge");
  for (const s of servers) {
    push(`lb_healthy{backend="${s.name}"} ${s.healthy ? 1 : 0}`);
  }

  push("# HELP lb_enabled Admin-enabled flag (1=enabled, 0=disabled)");
  push("# TYPE lb_enabled gauge");
  for (const s of servers) {
    push(`lb_enabled{backend="${s.name}"} ${s.enabled ? 1 : 0}`);
  }

  push("# HELP lb_draining Drain flag (1=draining, 0=active)");
  push("# TYPE lb_draining gauge");
  for (const s of servers) {
    push(`lb_draining{backend="${s.name}"} ${s.draining ? 1 : 0}`);
  }

  push("# HELP lb_errors_total Failed proxy attempts per backend");
  push("# TYPE lb_errors_total counter");
  for (const s of servers) {
    push(`lb_errors_total{backend="${s.name}"} ${s.totalFailed}`);
  }

  push("# HELP lb_uptime_seconds LB uptime");
  push("# TYPE lb_uptime_seconds gauge");
  push(
    `lb_uptime_seconds ${Math.round((Date.now() - state.lbStats.startedAt) / 1000)}`,
  );

  push("# HELP lb_total_requests Total requests received");
  push("# TYPE lb_total_requests counter");
  push(`lb_total_requests ${state.lbStats.totalRequests}`);

  res.writeHead(200, { "Content-Type": "text/plain; version=0.0.4" });
  res.end(lines.join("\n") + "\n");
}

/* =====================================================================
 * 9. MAIN REQUEST HANDLER
 * ===================================================================== */

const server = http.createServer((req, res) => {
  const pathname = req.url.split("?")[0];

  // Attach a request ID for correlation, and echo it back.
  req.id = req.headers["x-request-id"] || randomUUID().slice(0, 8);
  res.setHeader("X-Request-Id", req.id);

  // CORS preflight — handled at the LB so we don't even hit a backend.
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS_HEADERS);
    return res.end();
  }

  // LB-internal routes
  if (pathname.startsWith("/admin/")) return handleAdmin(req, res, pathname);
  if (pathname === "/metrics") return handleMetrics(req, res);

  if (pathname === "/health") {
    return json(res, 200, {
      status: "ok",
      strategy: CONFIG.strategy,
      available: servers.filter((s) => s.available).length,
      total: servers.length,
    });
  }

  // Real traffic
  state.lbStats.totalRequests += 1;

  const target = pickServer();
  if (!target) {
    state.lbStats.total503 += 1;
    return json(res, 503, {
      error: "No healthy backends available",
      requestId: req.id,
      strategy: CONFIG.strategy,
    });
  }

  target.totalProxied += 1;
  state.lbStats.totalProxied += 1;

  console.log(
    `[lb] [${req.id}] ${req.method} ${req.url} → ${target.name} ` +
      `(active=${target.activeRequests + 1}, total=${target.totalProxied})`,
  );

  proxyRequest(req, res, target);
});

/* =====================================================================
 * 10. LIFECYCLE — health loop, listen, graceful shutdown
 * ===================================================================== */

setInterval(checkAll, CONFIG.health.intervalMs).unref();
checkAll(); // initial probe on startup

server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;

server.listen(CONFIG.port, () => {
  console.log(`[lb] listening on http://localhost:${CONFIG.port}`);
  console.log(`[lb] strategy=${CONFIG.strategy}`);
  console.log(`[lb] API_PORTS = ${PORTS.join(",")}`);
  servers.forEach((s) => {
    const w = s.weight !== 1 ? ` (weight=${s.weight})` : "";
    console.log(`[lb]   ${s.name} → ${s.url}${w}`);
  });
  console.log(
    `[lb] health: every ${CONFIG.health.intervalMs}ms, ` +
      `down after ${CONFIG.health.failThreshold} fails, ` +
      `up after ${CONFIG.health.passThreshold} passes`,
  );
  console.log(
    `[lb] retry on GET/HEAD: ${CONFIG.request.retryOnIdempotent} ` +
      `(max ${CONFIG.request.maxRetries})`,
  );
});

function printFinalStats() {
  console.log("\n[lb] final stats:");
  console.log(
    `  requests=${state.lbStats.totalRequests} proxied=${state.lbStats.totalProxied} retries=${state.lbStats.totalRetries}`,
  );
  console.log(
    `  502=${state.lbStats.total502} 503=${state.lbStats.total503} 504=${state.lbStats.total504}`,
  );
  servers.forEach((s) => {
    console.log(
      `  ${s.name}: proxied=${s.totalProxied} failed=${s.totalFailed} ` +
        `retriedAway=${s.totalRetried} retriesIn=${s.totalRetriesReceived}`,
    );
  });
}

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(
    `\n[lb] ${signal} received, draining (up to ${CONFIG.drainMs}ms)...`,
  );

  server.close(() => {
    console.log("[lb] all client connections closed");
    printFinalStats();
    process.exit(0);
  });

  // Close idle keep-alive connections so `server.close()` can actually finish.
  if (typeof server.closeIdleConnections === "function") {
    server.closeIdleConnections();
  }

  // Hard cutoff if in-flight requests never finish.
  setTimeout(() => {
    console.error("[lb] drain timeout — force closing");
    if (typeof server.closeAllConnections === "function") {
      server.closeAllConnections();
    }
    printFinalStats();
    process.exit(1);
  }, CONFIG.drainMs).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("uncaughtException", (err) => {
  console.error("[lb] uncaughtException:", err);
  process.exit(1);
});
