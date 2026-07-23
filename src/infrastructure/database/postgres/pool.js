let pool;

function getPostgresPool() {
  if (pool) return pool;
  const connectionString = String(process.env.DATABASE_URL || "").trim();
  if (!connectionString) return null;
  const { Pool } = require("pg");
  pool = new Pool({
    connectionString,
    max: Number(process.env.PG_POOL_MAX || 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    query_timeout: Number(process.env.PG_QUERY_TIMEOUT_MS || 5_000),
    ssl: process.env.PG_SSL === "true" ? { rejectUnauthorized: true } : undefined,
  });
  pool.on("error", (error) => {
    // pg emits idle-client failures on the Pool itself. Without this listener,
    // a short PostgreSQL restart terminates the whole Node.js process.
    console.error(`[PostgresPool] idle client error: ${error.message}`);
  });
  return pool;
}

module.exports = { getPostgresPool };
