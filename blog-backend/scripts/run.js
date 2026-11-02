#!/usr/bin/env node
// Spawn N blog instances. Same pattern as your existing lb-demo launcher.
const { spawn } = require("child_process");
const path = require("path");

const ports = process.argv.slice(2).map((p) => parseInt(p, 10));
if (
  !ports.length ||
  ports.some((p) => !Number.isInteger(p) || p < 1 || p > 65535)
) {
  console.error("Usage: npm run api -- <port> [port2] [port3] ...");
  process.exit(1);
}

const entry = path.resolve(__dirname, "..", "src", "server.js");
const children = [];

for (const port of ports) {
  const name = `blog-${port}`;
  console.log(`[launcher] Starting ${name}`);
  const child = spawn(process.execPath, [entry], {
    env: { ...process.env, PORT: String(port), NAME: name },
    stdio: "inherit",
  });
  child.on("exit", (code, signal) =>
    console.log(`[launcher] ${name} exited (code=${code}, signal=${signal})`),
  );
  children.push(child);
}

function shutdown(signal) {
  console.log(
    `\n[launcher] ${signal}: stopping ${children.length} instance(s)`,
  );
  children.forEach((c) => !c.killed && c.kill(signal));
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("exit", () =>
  children.forEach((c) => !c.killed && c.kill("SIGTERM")),
);
