const http = require("http");
const app = require("./app");
const config = require("./config/env");
const pool = require("./config/db");
const viewCounter = require("./services/viewCounter");

const server = http.createServer(app);

// Sensible timeouts for sitting behind a load balancer.
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;

server.listen(config.port, () => {
  console.log(
    `[${config.name}] listening on http://localhost:${config.port} (pid ${process.pid})`,
  );
  console.log(
    `[${config.name}] env=${config.env} db=${config.db.database}@${config.db.host}:${config.db.port}`,
  );
});

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[${config.name}] ${signal} received, shutting down...`);

  server.close(async (err) => {
    if (err) console.error(`[${config.name}] close error:`, err.message);
    try {
      await viewCounter.flush();
      await pool.end();
    } catch (e) {
      console.error(`[${config.name}] cleanup error:`, e.message);
    }
    console.log(`[${config.name}] bye`);
    process.exit(0);
  });

  setTimeout(() => {
    console.error(`[${config.name}] forcing exit`);
    process.exit(1);
  }, 15000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("unhandledRejection", (reason) => {
  console.error(`[${config.name}] unhandledRejection:`, reason);
});
process.on("uncaughtException", (err) => {
  console.error(`[${config.name}] uncaughtException:`, err);
  process.exit(1);
});
