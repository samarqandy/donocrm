const fs = require("node:fs");
const path = require("node:path");
const { getPostgresPool } = require("../src/infrastructure/database/postgres/pool");

async function run() {
  const postgres = getPostgresPool();
  if (!postgres) throw new Error("DATABASE_URL is required");
  const migrationsDir = path.join(__dirname, "../src/infrastructure/database/postgres/migrations");
  const files = fs.readdirSync(migrationsDir).filter((file) => file.endsWith(".sql")).sort();
  for (const file of files) await postgres.query(fs.readFileSync(path.join(migrationsDir, file), "utf8"));
  const { rows } = await postgres.query(`
    SELECT COUNT(*)::int AS tables
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  `);
  console.log(JSON.stringify({ ok: true, migrations: files, tables: rows[0].tables }, null, 2));
  await postgres.end();
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
