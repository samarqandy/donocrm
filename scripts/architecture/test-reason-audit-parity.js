#!/usr/bin/env node

const assert = require("node:assert/strict");
const { SQLiteAttendanceRepository } = require("../../src/modules/attendance/infrastructure/SQLiteAttendanceRepository");
const { PostgresAttendanceRepository } = require("../../src/modules/attendance/infrastructure/PostgresAttendanceRepository");
const { createRepositoryContractFixture } = require("./repository-contract-fixture");

const CREATED_AT = "2026-02-10T08:15:30.000Z";
const UPDATED_AT = "2026-02-10T09:15:30.000Z";

function deterministicIds() {
  let sequence = 0;
  return () => `contract-generated-${++sequence}`;
}

function errorContract(error) {
  return {
    name: error.name || "Error",
    status: Number(error.status || 0),
    code: error.code || "",
    message: error.message || "",
  };
}

async function captureError(callback) {
  try {
    await callback();
    assert.fail("Expected repository operation to reject");
  } catch (error) {
    if (error.code === "ERR_ASSERTION") throw error;
    return errorContract(error);
  }
}

function sqliteOutbox(db, tenantId, aggregateId) {
  return db.prepare(`
    SELECT event_type, source_store, target_store, source_version, payload_json
    FROM migration_outbox
    WHERE tenant_id = ? AND aggregate_id = ?
    ORDER BY source_version
  `).all(tenantId, aggregateId);
}

async function postgresOutbox(pool, tenantId, aggregateId) {
  const { rows } = await pool.query(`
    SELECT event_type, source_store, target_store, source_version, payload_json
    FROM migration_outbox
    WHERE tenant_id = $1 AND aggregate_id = $2
    ORDER BY source_version
  `, [tenantId, aggregateId]);
  return rows;
}

function logicalOutbox(rows) {
  return rows.map((row) => ({
    eventType: row.event_type,
    sourceVersion: Number(row.source_version),
    payload: typeof row.payload_json === "string" ? JSON.parse(row.payload_json) : row.payload_json,
  }));
}

async function run() {
  const previousMirror = process.env.DONO_ATTENDANCE_MIRROR_ENABLED;
  process.env.DONO_ATTENDANCE_MIRROR_ENABLED = "true";
  const fixture = await createRepositoryContractFixture();
  let cleanup;
  try {
    const sqlite = new SQLiteAttendanceRepository(fixture.sqlite, {
      idGenerator: deterministicIds(),
      clock: () => UPDATED_AT,
    });
    const postgres = new PostgresAttendanceRepository(fixture.postgres, {
      financeGuard: sqlite,
      lessonReferenceReader: sqlite,
      idGenerator: deterministicIds(),
      clock: () => UPDATED_AT,
    });
    const command = {
      tenantId: fixture.context.tenantId,
      code: "contract_custom",
      name: "Contract Custom",
      attendanceStatus: "absent",
      chargePercent: 40,
      consumePercent: 60,
      actorUserId: fixture.context.actorUserId,
      actorRole: fixture.context.actorRole,
      occurredAt: CREATED_AT,
    };

    const sqliteCreated = await sqlite.createReason(command);
    const postgresCreated = await postgres.createReason(command);
    assert.deepEqual(postgresCreated, sqliteCreated, "createReason result differs");

    const update = {
      ...command,
      reasonId: sqliteCreated.id,
      expectedVersion: 1,
      name: "Contract Custom Updated",
      chargePercent: 25,
      consumePercent: 75,
      isActive: false,
      occurredAt: UPDATED_AT,
    };
    const sqliteUpdated = await sqlite.updateReason(update);
    const postgresUpdated = await postgres.updateReason(update);
    assert.deepEqual(postgresUpdated, sqliteUpdated, "updateReason result differs");

    const sqliteEvents = logicalOutbox(sqliteOutbox(
      fixture.sqlite,
      fixture.context.tenantId,
      sqliteCreated.id,
    ));
    const postgresEvents = logicalOutbox(await postgresOutbox(
      fixture.postgres,
      fixture.context.tenantId,
      postgresCreated.id,
    ));
    assert.deepEqual(postgresEvents, sqliteEvents, "reason logical outbox differs");

    const staleSQLite = await captureError(() => sqlite.updateReason({ ...update, name: "Stale" }));
    const stalePostgres = await captureError(() => postgres.updateReason({ ...update, name: "Stale" }));
    assert.deepEqual(stalePostgres, staleSQLite, "stale updateReason error differs");

    const duplicateSQLite = await captureError(() => sqlite.createReason({ ...command, name: "Duplicate" }));
    const duplicatePostgres = await captureError(() => postgres.createReason({ ...command, name: "Duplicate" }));
    assert.equal(duplicateSQLite.status, 409, JSON.stringify(duplicateSQLite));
    assert.equal(duplicatePostgres.status, 409, JSON.stringify(duplicatePostgres));

    const context = {
      tenantId: fixture.context.tenantId,
      userId: fixture.context.actorUserId,
      role: fixture.context.actorRole,
    };
    await sqlite.audit(context, "verified", sqliteCreated.id, "attendance_reason");
    await postgres.audit(context, "verified", postgresCreated.id, "attendance_reason");
    const sqliteAudit = fixture.sqlite.prepare(`
      SELECT tenant_id, user_id, role, action, entity, entity_id, created_at
      FROM audit_logs WHERE tenant_id = ? AND entity_id = ? AND action = 'verified'
    `).get(context.tenantId, sqliteCreated.id);
    const postgresAuditResult = await fixture.postgres.query(`
      SELECT tenant_id, user_id, role, action, entity, entity_id,
             TO_CHAR(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at
      FROM audit_logs WHERE tenant_id = $1 AND entity_id = $2 AND action = 'verified'
    `, [context.tenantId, postgresCreated.id]);
    assert.deepEqual(postgresAuditResult.rows[0], { ...sqliteAudit }, "audit semantic row differs");

    cleanup = await fixture.cleanup();
    assert.equal(cleanup.schemaDropped, true);
    console.log(JSON.stringify({
      ok: true,
      suite: "attendance-reason-audit-contracts",
      summary: { pass: 6, fail: 0, diff: 0 },
      cases: [
        "createReason",
        "updateReason",
        "reason logical outbox",
        "stale updateReason",
        "duplicate status",
        "audit",
      ].map((name) => ({ name, status: "PASS" })),
      remainingDecision: {
        duplicateErrorMessage: {
          sqlite: duplicateSQLite.message,
          postgres: duplicatePostgres.message,
          equivalent: duplicateSQLite.message === duplicatePostgres.message,
        },
      },
      rollback: { isolatedSchemaDropped: cleanup.schemaDropped },
    }, null, 2));
  } finally {
    if (!cleanup) await fixture.cleanup();
    if (previousMirror === undefined) delete process.env.DONO_ATTENDANCE_MIRROR_ENABLED;
    else process.env.DONO_ATTENDANCE_MIRROR_ENABLED = previousMirror;
  }
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
