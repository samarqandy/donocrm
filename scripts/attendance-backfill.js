const { defaultTenantId } = require("../src/config/app");
const { getDb } = require("../src/db/client");
const { getPostgresPool } = require("../src/infrastructure/database/postgres/pool");
const { AttendanceBackfill } = require("../src/infrastructure/migration/AttendanceBackfill");

function argument(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

async function run() {
  const tenantId = argument("tenant", defaultTenantId);
  const postgres = getPostgresPool();
  if (!postgres) throw new Error("DATABASE_URL is required");
  const backfill = new AttendanceBackfill({ sqlite: getDb(), postgres });
  const counts = await backfill.run(tenantId);
  console.log(JSON.stringify({ ok: true, tenantId, counts }, null, 2));
  await postgres.end();
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
