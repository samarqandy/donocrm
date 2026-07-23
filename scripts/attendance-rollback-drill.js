const { defaultTenantId } = require("../src/config/app");
const { getDb } = require("../src/db/client");
const { getPostgresPool } = require("../src/infrastructure/database/postgres/pool");
const { AttendanceOutboxRelay } = require("../src/infrastructure/migration/AttendanceOutboxRelay");
const { PostgresAttendanceOutboxRelay } = require("../src/infrastructure/migration/PostgresAttendanceOutboxRelay");
const { AttendanceParityVerifier } = require("../src/infrastructure/migration/AttendanceParityVerifier");

function argument(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

async function run() {
  const tenantId = argument("tenant", defaultTenantId);
  const postgres = getPostgresPool();
  if (!postgres) throw new Error("DATABASE_URL is required");
  const sqlite = getDb();
  const before = await postgres.query(`
    SELECT COUNT(*)::int AS count FROM migration_outbox
    WHERE tenant_id = $1 AND source_store = 'postgres' AND target_store = 'sqlite'
      AND status IN ('pending', 'failed')
  `, [tenantId]);
  if (!before.rows[0].count) {
    throw new Error("No PostgreSQL-to-SQLite attendance event is pending; perform one canary attendance write first");
  }

  const reverseRelay = new PostgresAttendanceOutboxRelay({ sqlite, postgres, batchSize: 500 });
  let processed = 0;
  let applied = 0;
  for (let cycle = 0; cycle < 20; cycle += 1) {
    const result = await reverseRelay.runOnce();
    processed += result.processed;
    applied += result.applied;
    if (!result.processed) break;
  }
  const failed = await postgres.query(`
    SELECT COUNT(*)::int AS count FROM migration_outbox
    WHERE tenant_id = $1 AND source_store = 'postgres' AND target_store = 'sqlite' AND status = 'failed'
  `, [tenantId]);

  // Applying a reverse event updates SQLite lessons/history and can
  // intentionally emit reference events back toward PostgreSQL. Drain those
  // idempotent events before making the final parity decision.
  const forwardRelay = new AttendanceOutboxRelay({ sqlite, postgres, batchSize: 500 });
  let forwardProcessed = 0;
  let forwardFailed = 0;
  for (let cycle = 0; cycle < 20; cycle += 1) {
    const result = await forwardRelay.runOnce();
    forwardProcessed += result.processed;
    forwardFailed += result.failed || 0;
    if (!result.processed) break;
  }

  const parity = await new AttendanceParityVerifier({ sqlite, postgres }).run(tenantId);
  const report = {
    tenantId,
    processed,
    applied,
    failed: failed.rows[0].count,
    forwardDrain: {
      processed: forwardProcessed,
      failed: forwardFailed,
    },
    parity,
    safeToEnableCanary: processed > 0
      && applied > 0
      && failed.rows[0].count === 0
      && forwardFailed === 0
      && parity.ok,
  };
  console.log(JSON.stringify(report, null, 2));
  await postgres.end();
  if (!report.safeToEnableCanary) process.exitCode = 2;
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
