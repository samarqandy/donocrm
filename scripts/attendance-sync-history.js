const { defaultTenantId } = require("../src/config/app");
const { getDb } = require("../src/db/client");
const { getPostgresPool } = require("../src/infrastructure/database/postgres/pool");

function argument(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function jsonText(value) {
  if (value === undefined || value === null || value === "") return null;
  return typeof value === "string" ? value : JSON.stringify(value);
}

async function sqliteToPostgres(sqlite, client, tenantId) {
  const events = sqlite.prepare("SELECT * FROM lesson_events WHERE tenant_id = ? ORDER BY created_at, id").all(tenantId);
  for (const row of events) {
    await client.query(`
      INSERT INTO lesson_events
        (id, tenant_id, lesson_id, actor_user_id, actor_role, action, reason,
         before_json, after_json, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$10)
      ON CONFLICT (tenant_id, id) DO UPDATE SET
        actor_user_id=EXCLUDED.actor_user_id, actor_role=EXCLUDED.actor_role,
        action=EXCLUDED.action, reason=EXCLUDED.reason,
        before_json=EXCLUDED.before_json, after_json=EXCLUDED.after_json
    `, [row.id, tenantId, row.lesson_id, row.actor_user_id, row.actor_role, row.action,
      row.reason, jsonText(row.before_json), jsonText(row.after_json), row.created_at]);
  }
  const revisions = sqlite.prepare("SELECT * FROM lesson_attendance_revisions WHERE tenant_id = ? ORDER BY lesson_id, revision_no").all(tenantId);
  for (const row of revisions) {
    await client.query(`
      INSERT INTO lesson_attendance_revisions
        (id, tenant_id, lesson_id, revision_no, actor_user_id, actor_role,
         reason, snapshot_json, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$9)
      ON CONFLICT (tenant_id, lesson_id, revision_no) DO UPDATE SET
        actor_user_id=EXCLUDED.actor_user_id, actor_role=EXCLUDED.actor_role,
        reason=EXCLUDED.reason, snapshot_json=EXCLUDED.snapshot_json
    `, [row.id, tenantId, row.lesson_id, row.revision_no, row.actor_user_id,
      row.actor_role, row.reason, jsonText(row.snapshot_json), row.created_at]);
  }
  return { events: events.length, revisions: revisions.length };
}

async function postgresToSqlite(sqlite, client, tenantId) {
  const events = (await client.query("SELECT * FROM lesson_events WHERE tenant_id = $1 ORDER BY created_at, id", [tenantId])).rows;
  const revisions = (await client.query("SELECT * FROM lesson_attendance_revisions WHERE tenant_id = $1 ORDER BY lesson_id, revision_no", [tenantId])).rows;
  const insertEvent = sqlite.prepare(`
    INSERT INTO lesson_events
      (id, tenant_id, lesson_id, actor_user_id, actor_role, action, reason,
       before_json, after_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      actor_user_id=excluded.actor_user_id, actor_role=excluded.actor_role,
      action=excluded.action, reason=excluded.reason,
      before_json=excluded.before_json, after_json=excluded.after_json
  `);
  const insertRevision = sqlite.prepare(`
    INSERT INTO lesson_attendance_revisions
      (id, tenant_id, lesson_id, revision_no, actor_user_id, actor_role,
       reason, snapshot_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(tenant_id, lesson_id, revision_no) DO UPDATE SET
      actor_user_id=excluded.actor_user_id, actor_role=excluded.actor_role,
      reason=excluded.reason, snapshot_json=excluded.snapshot_json
  `);
  sqlite.exec("BEGIN IMMEDIATE");
  try {
    for (const row of events) {
      insertEvent.run(row.id, tenantId, row.lesson_id, row.actor_user_id, row.actor_role,
        row.action, row.reason, jsonText(row.before_json), jsonText(row.after_json),
        row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at);
    }
    for (const row of revisions) {
      insertRevision.run(row.id, tenantId, row.lesson_id, Number(row.revision_no),
        row.actor_user_id, row.actor_role, row.reason, jsonText(row.snapshot_json),
        row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at);
    }
    sqlite.exec("COMMIT");
  } catch (error) {
    sqlite.exec("ROLLBACK");
    throw error;
  }
  return { events: events.length, revisions: revisions.length };
}

async function run() {
  const tenantId = argument("tenant", defaultTenantId);
  const sqlite = getDb();
  const postgres = getPostgresPool();
  if (!postgres) throw new Error("DATABASE_URL is required");
  const client = await postgres.connect();
  try {
    await client.query("BEGIN");
    const outbound = await sqliteToPostgres(sqlite, client, tenantId);
    await client.query("COMMIT");
    const inbound = await postgresToSqlite(sqlite, client, tenantId);
    console.log(JSON.stringify({ ok: true, tenantId, sqliteToPostgres: outbound, postgresToSqlite: inbound }, null, 2));
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
    await postgres.end();
  }
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
