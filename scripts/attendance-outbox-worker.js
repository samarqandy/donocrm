const { getDb } = require("../src/db/client");
const { getPostgresPool } = require("../src/infrastructure/database/postgres/pool");
const { AttendanceOutboxRelay } = require("../src/infrastructure/migration/AttendanceOutboxRelay");
const { PostgresAttendanceOutboxRelay } = require("../src/infrastructure/migration/PostgresAttendanceOutboxRelay");

const postgres = getPostgresPool();
if (!postgres) throw new Error("DATABASE_URL is required for attendance outbox relay");

const relay = new AttendanceOutboxRelay({ sqlite: getDb(), postgres });
const reverseRelay = process.env.DONO_ATTENDANCE_REVERSE_RELAY_ENABLED === "true"
  ? new PostgresAttendanceOutboxRelay({ sqlite: getDb(), postgres })
  : null;

async function tick() {
  try {
    const result = await relay.runOnce();
    if (result.processed || result.failed) console.log(`[AttendanceRelay] processed=${result.processed} failed=${result.failed || 0}`);
    if (reverseRelay) {
      const reverse = await reverseRelay.runOnce();
      if (reverse.processed || reverse.failed) {
        console.log(`[AttendanceReverseRelay] processed=${reverse.processed} applied=${reverse.applied} failed=${reverse.failed || 0}`);
      }
    }
  } catch (error) {
    console.error("[AttendanceRelay]", error.stack || error.message);
  }
}

tick();
const timer = setInterval(tick, Number(process.env.ATTENDANCE_RELAY_INTERVAL_MS || 1000));

async function shutdown() {
  clearInterval(timer);
  await postgres.end();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
