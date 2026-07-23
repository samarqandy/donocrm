#!/usr/bin/env node

const assert = require("node:assert/strict");
const { PostgresAttendanceRepository } = require("../../src/modules/attendance/infrastructure/PostgresAttendanceRepository");
const {
  createRepositoryContractFixture,
  fixtureParityReport,
} = require("./repository-contract-fixture");

const CAPTURED_BEFORE = Object.freeze({
  confirmedSettlement: { sqlite: true, postgres: false, status: "DIFF" },
  noSettlement: { sqlite: false, postgres: false, status: "PASS" },
});

async function compare(adapterPair, tenantId, lessonId, expected, name) {
  const sqlite = await adapterPair.sqlite.command.hasActiveSettlement(tenantId, lessonId);
  const postgres = await adapterPair.postgres.command.hasActiveSettlement(tenantId, lessonId);
  const status = sqlite === postgres && sqlite === expected ? "PASS" : "DIFF";
  assert.equal(sqlite, expected, `${name}: SQLite result violated the canonical contract`);
  assert.equal(postgres, expected, `${name}: PostgreSQL result violated the canonical contract`);
  return { name, expected, sqlite, postgres, status };
}

async function run() {
  const fixture = await createRepositoryContractFixture();
  let cleanup;
  try {
    const parityBefore = await fixtureParityReport(fixture);
    assert.equal(parityBefore.ok, true, "deterministic fixture must start in parity");

    const cases = [
      await compare(
        fixture.adapters,
        fixture.context.tenantId,
        fixture.context.lessonId,
        true,
        "confirmed settlement",
      ),
      await compare(
        fixture.adapters,
        fixture.context.tenantId,
        fixture.context.plannedLessonId,
        false,
        "no settlement",
      ),
      await compare(
        fixture.adapters,
        fixture.context.tenantId,
        "contract-lesson-missing",
        false,
        "missing lesson",
      ),
      await compare(
        fixture.adapters,
        "contract-tenant-other",
        fixture.context.lessonId,
        false,
        "tenant isolation",
      ),
    ];

    const unconfigured = new PostgresAttendanceRepository(fixture.postgres);
    await assert.rejects(
      unconfigured.hasActiveSettlement(fixture.context.tenantId, fixture.context.lessonId),
      /Attendance finance guard is not configured/,
      "PostgreSQL must fail closed when the authoritative finance guard is absent",
    );

    const parityAfter = await fixtureParityReport(fixture);
    assert.equal(parityAfter.ok, true, "read-only settlement checks changed fixture state");
    assert.deepEqual(parityAfter.tables, parityBefore.tables, "settlement checks mutated deterministic data");

    cleanup = await fixture.cleanup();
    assert.equal(cleanup.schemaDropped, true, "isolated PostgreSQL fixture schema was not removed");

    console.log(JSON.stringify({
      ok: true,
      method: "hasActiveSettlement",
      before: CAPTURED_BEFORE,
      after: {
        summary: {
          pass: cases.filter((item) => item.status === "PASS").length,
          fail: 0,
          diff: cases.filter((item) => item.status === "DIFF").length,
        },
        cases,
      },
      regression: {
        missingFinanceGuardFailsClosed: true,
        tenantIsolation: true,
        readOnly: true,
      },
      rollback: {
        fixtureStateUnchanged: true,
        isolatedSchemaDropped: cleanup.schemaDropped,
      },
    }, null, 2));
  } finally {
    if (!cleanup) await fixture.cleanup();
  }
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
