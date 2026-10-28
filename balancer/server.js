const http = require("http");
const https = require("https");
const { URL } = require("url");

// ---------- Config ----------
const PORT = parseInt(process.env.PORT || "8000", 10);
const HEALTH_INTERVAL_MS = 5000;
const HEALTH_TIMEOUT_MS = 2000;
const REQUEST_TIMEOUT_MS = 15000;

// ---------- Server registry from API_PORTS ----------
const PORTS = (process.env.API_PORTS || "8001,8002,8003")
  .split(",")
  .map((p) => parseInt(p.trim(), 10))
  .filter((p) => Number.isInteger(p) && p > 0 && p < 65536);

const servers = PORTS.map((port) => ({
  name: `api-${port}`,
  url: `http://localhost:${port}`,
  healthy: true,
  enabled: true,
  totalProxied: 0, // per-backend proxy counter (LB's own bookkeeping)
}));

let rrIndex = 0;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Max-Age": "86400",
};

function availableServers() {
  return servers.filter((s) => s.enabled && s.healthy);
}

function pickServer() {
  for (let i = 0; i < servers.length; i++) {
    const idx = (rrIndex + i) % servers.length;
    const s = servers[idx];
    if (s.enabled && s.healthy) {
      rrIndex = (idx + 1) % servers.length;
      return s;
    }
  }
  return null;
}

function json(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    ...CORS_HEADERS,
  });
  res.end(JSON.stringify(body));
}

// ---------- Health checks ----------
function markUnhealthy(server, reason) {
  if (server.healthy) console.log(`[health] ${server.name} DOWN (${reason})`);
  server.healthy = false;
}

function checkServer(server) {
  if (!server.enabled) return;
  const url = new URL("/health", server.url);
  const client = url.protocol === "https:" ? https : http;

  const req = client.request(
    url,
    { method: "GET", timeout: HEALTH_TIMEOUT_MS },
    (res) => {
      res.resume();
      if (res.statusCode === 200) {
        if (!server.healthy) console.log(`[health] ${server.name} UP`);
        server.healthy = true;
      } else {
        markUnhealthy(server, `status ${res.statusCode}`);
      }
    },
  );
  req.on("error", (err) => markUnhealthy(server, err.message));
  req.on("timeout", () => {
    req.destroy();
    markUnhealthy(server, "timeout");
  });
  req.end();
}

function healthCheckAll() {
  servers.forEach(checkServer);
}

// ---------- Proxy ----------
function proxyRequest(clientReq, clientRes, target) {
  const targetUrl = new URL(clientReq.url, target.url);
  const client = targetUrl.protocol === "https:" ? https : http;

  const headers = { ...clientReq.headers };
  headers["x-forwarded-for"] = clientReq.socket.remoteAddress || "unknown";
  headers["x-forwarded-by"] = "balance.local";
  headers["x-target"] = target.name;

  target.totalProxied += 1;

  const proxyReq = client.request(
    targetUrl,
    { method: clientReq.method, headers, timeout: REQUEST_TIMEOUT_MS },
    (proxyRes) => {
      clientRes.writeHead(proxyRes.statusCode, {
        ...proxyRes.headers,
        ...CORS_HEADERS,
      });
      proxyRes.pipe(clientRes);
    },
  );

  proxyReq.on("error", (err) => {
    console.error(`[proxy] ${target.name} error: ${err.message}`);
    if (!clientRes.headersSent) {
      json(clientRes, 502, {
        error: "Bad Gateway",
        target: target.name,
        reason: err.message,
      });
    }
    if (["ECONNREFUSED", "ETIMEDOUT", "ECONNRESET"].includes(err.code)) {
      markUnhealthy(target, err.code);
    }
  });

  proxyReq.on("timeout", () => {
    proxyReq.destroy();
    if (!clientRes.headersSent) {
      json(clientRes, 504, { error: "Gateway Timeout", target: target.name });
    }
  });

  clientReq.pipe(proxyReq);
}

// ---------- Admin ----------
function handleAdmin(req, res, pathname) {
  if (req.method === "GET" && pathname === "/admin/servers") {
    return json(res, 200, servers);
  }

  if (req.method === "GET" && pathname === "/admin/health") {
    return json(res, 200, {
      total: servers.length,
      available: availableServers().length,
      servers: servers.map((s) => ({
        name: s.name,
        url: s.url,
        enabled: s.enabled,
        healthy: s.healthy,
        totalProxied: s.totalProxied,
      })),
    });
  }

  const match = pathname.match(/^\/admin\/servers\/([^/]+)\/(enable|disable)$/);
  if (req.method === "POST" && match) {
    const [, name, action] = match;
    const server = servers.find((s) => s.name === name);
    if (!server) return json(res, 404, { error: "server not found", name });
    if (action === "enable") {
      server.enabled = true;
      console.log(`[admin] ${name} ENABLED`);
      checkServer(server);
    } else {
      server.enabled = false;
      console.log(`[admin] ${name} DISABLED`);
    }
    return json(res, 200, { ok: true, server });
  }

  return json(res, 404, { error: "admin route not found", path: pathname });
}

// ---------- Main ----------
const server = http.createServer((req, res) => {
  const pathname = req.url.split("?")[0];

  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS_HEADERS);
    return res.end();
  }

  if (pathname.startsWith("/admin/")) return handleAdmin(req, res, pathname);

  if (pathname === "/health") {
    return json(res, 200, {
      status: "ok",
      available: availableServers().length,
      total: servers.length,
    });
  }

  const target = pickServer();
  if (!target)
    return json(res, 503, { error: "No healthy backends available" });

  console.log(
    `[lb] ${req.method} ${req.url} → ${target.name} (total for ${target.name}: ${target.totalProxied + 1})`,
  );
  proxyRequest(req, res, target);
});

setInterval(healthCheckAll, HEALTH_INTERVAL_MS);
healthCheckAll();

server.listen(PORT, () => {
  console.log(`LB listening on http://localhost:${PORT}`);
  console.log(`API_PORTS = ${PORTS.join(",")}`);
  servers.forEach((s) => console.log(`  ${s.name} → ${s.url}`));
  console.log(`Health check every ${HEALTH_INTERVAL_MS}ms`);
});

process.on("SIGINT", () => {
  console.log("\nLB shutting down. Per-backend totals:");
  servers.forEach((s) =>
    console.log(`  ${s.name}: ${s.totalProxied} requests`),
  );
  server.close(() => process.exit(0));
});
