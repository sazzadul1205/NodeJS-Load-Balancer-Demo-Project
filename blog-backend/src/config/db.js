const mysql = require("mysql2/promise");
const config = require("./env");

// A single pool per process. With N API instances, MySQL sees N * connectionLimit
// concurrent connections — size `max_connections` on the DB accordingly.
const pool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  waitForConnections: true,
  connectionLimit: 20,
  maxIdle: 20,
  idleTimeout: 60000,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  decimalNumbers: true,
});

module.exports = pool;
