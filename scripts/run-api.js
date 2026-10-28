#!/usr/bin/env node
const { spawn } = require("child_process");
const path = require("path");

const ports = process.argv.slice(2).map((p) => parseInt(p, 10));

if (
  ports.length === 0 ||
  ports.some((p) => !Number.isInteger(p) || p < 1 || p > 65535)
) {
  console.error("Usage: npm run api -- <port> [port2] [port3] ...");
  console.error("  Example: npm run api -- 8001");
  console.error("  Example: npm run api -- 8001 8002 8003");
  process.exit(1);
}

const serverPath = path.resolve(__dirname, "..", "backend", "server.js");
const children = [];

for (const port of ports) {
  const name = `api-${port}`;
  console.log(`[launcher] Starting ${name} on port ${port}`);
  const child = spawn(process.execPath, [serverPath], {
    env: { ...process.env, PORT: String(port), NAME: name },
    stdio: "inherit",
  });
  child.on("exit", (code, signal) =>
    console.log(`[launcher] ${name} exited (code=${code}, signal=${signal})`),
  );
  children.push(child);
}

function shutdown(signal) {
  console.log(`\n[launcher] ${signal}: stopping ${children.length} API(s)...`);
  children.forEach((c) => {
    if (!c.killed) c.kill(signal);
  });
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("exit", () =>
  children.forEach((c) => {
    if (!c.killed) c.kill("SIGTERM");
  }),
);
