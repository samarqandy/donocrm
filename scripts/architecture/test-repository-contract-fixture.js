#!/usr/bin/env node

const assert = require("node:assert/strict");
const {
  CONTRACT_FIXTURE,
  TABLE_SPECS,
  createRepositoryContractFixture,
  fixtureParityReport,
} = require("./repository-contract-fixture");

async function verifyRollbackIsolation(fixture) {
  const { tenantId, lessonId } = fixture.context;
  const sqliteBefore = fixture.sqlite.prepare(
    "SELECT status FROM attendance WHERE tenant_id = ? AND lesson_id = ? ORDER BY id",
  ).all(tenantId, lessonId);
  const { rows: postgresBefore } = await fixture.postgres.query(
    "SELECT status FROM attendance WHERE tenant_id = $1 AND lesson_id = $2 ORDER BY id",
    [tenantId, lessonId],
  );

  fixture.sqlite.exec("BEGIN IMMEDIATE");
  fixture.sqlite.prepare(
    "UPDATE attendance SET status = 'late' WHERE tenant_id = ? AND lesson_id = ?",
  ).run(tenantId, lessonId);
  fixture.sqlite.exec("ROLLBACK");

  const client = await fixture.postgres.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "UPDATE attendance SET status = 'late' WHERE tenant_id = $1 AND lesson_id = $2",
      [tenantId, lessonId],
    );
    await client.query("ROLLBACK");
  } finally {
    client.release();
  }

  const sqliteAfter = fixture.sqlite.prepare(
    "SELECT status FROM attendance WHERE tenant_id = ? AND lesson_id = ? ORDER BY id",
  ).all(tenantId, lessonId);
  const { rows: postgresAfter } = await fixture.postgres.query(
    "SELECT status FROM attendance WHERE tenant_id = $1 AND lesson_id = $2 ORDER BY id",
    [tenantId, lessonId],
  );
  assert.deepEqual(sqliteAfter, sqliteBefore, "SQLite fixture rollback did not restore attendance state");
  assert.deepEqual(postgresAfter, postgresBefore, "PostgreSQL fixture rollback did not restore attendance state");
  return { sqlite: true, postgres: true };
}

async function run() {
  assert.equal(Object.isFrozen(CONTRACT_FIXTURE), true, "canonical fixture root must be immutable");
  assert.equal(Object.isFrozen(CONTRACT_FIXTURE.attendance), true, "canonical attendance seed must be immutable");
  assert.equal(new Set(CONTRACT_FIXTURE.context.studentIds).size, CONTRACT_FIXTURE.context.studentIds.length);
  assert.match(CONTRACT_FIXTURE.context.lessonDate, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(CONTRACT_FIXTURE.times.created, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

  const fixture = await createRepositoryContractFixture();
  let cleanup;
  try {
    const parity = await fixtureParityReport(fixture);
    assert.equal(parity.ok, true, `fixture seed parity failed: ${JSON.stringify(parity.tables)}`);
    assert.equal(Object.keys(parity.tables).length, TABLE_SPECS.length);
    assert.equal(TABLE_SPECS.length, 17, "fixture must cover every deterministic seed table");

    const sqliteCounts = fixture.adapters.sqlite.query.counts(fixture.context.tenantId);
    const postgresCounts = await fixture.adapters.postgres.query.counts(fixture.context.tenantId);
    assert.deepEqual(postgresCounts, sqliteCounts, "fixture adapters must be reusable by repository contract cases");
    assert.deepEqual(sqliteCounts, { present: 1, absent: 1, late: 0, excused: 0 });

    const rollback = await verifyRollbackIsolation(fixture);
    const parityAfterRollback = await fixtureParityReport(fixture);
    assert.equal(parityAfterRollback.ok, true, "rollback verification changed deterministic fixture state");

    cleanup = await fixture.cleanup();
    assert.equal(cleanup.schemaDropped, true, "isolated PostgreSQL schema was not removed");

    console.log(JSON.stringify({
      ok: true,
      fixture: {
        tenantId: fixture.context.tenantId,
        branchId: fixture.context.branchId,
        lessonDate: fixture.context.lessonDate,
        seedTables: TABLE_SPECS.length,
        seedRows: Object.values(parity.tables).reduce((total, item) => total + item.rows, 0),
      },
      parity: {
        sqlite: true,
        postgres: true,
        identicalIds: true,
        identicalTimestamps: true,
        deterministicFinance: true,
      },
      rollback,
      teardown: cleanup,
    }, null, 2));
  } finally {
    if (!cleanup) await fixture.cleanup();
  }
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
