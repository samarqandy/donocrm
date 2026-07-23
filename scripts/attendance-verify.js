const { defaultTenantId } = require("../src/config/app");
const { getDb } = require("../src/db/client");
const { getPostgresPool } = require("../src/infrastructure/database/postgres/pool");
const { AttendanceParityVerifier } = require("../src/infrastructure/migration/AttendanceParityVerifier");

function argument(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

async function run() {
  const tenantId = argument("tenant", defaultTenantId);
  const postgres = getPostgresPool();
  if (!postgres) throw new Error("DATABASE_URL is required");
  const verifier = new AttendanceParityVerifier({ sqlite: getDb(), postgres });
  const report = await verifier.run(tenantId);
  console.log(JSON.stringify(report, null, 2));
  await postgres.end();
  if (!report.ok) process.exitCode = 2;
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
