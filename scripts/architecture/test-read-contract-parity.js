#!/usr/bin/env node

const assert = require("node:assert/strict");
const { createRepositoryContractFixture } = require("./repository-contract-fixture");

function readCases(context) {
  return [
    ["command.findLesson", "command", (adapter) => adapter.findLesson(context.tenantId, context.lessonId)],
    ["command.findLessonRoster", "command", (adapter) => adapter.findLessonRoster(context.tenantId, context.lessonId)],
    ["command.findByLesson", "command", (adapter) => adapter.findByLesson(context.tenantId, context.lessonId)],
    ["command.listReasons", "command", (adapter) => adapter.listReasons(context.tenantId, false)],
    ["command.findReason", "command", (adapter) => adapter.findReason(context.tenantId, context.reasonId)],
    ["command.findClosedFinancePeriod", "command", (adapter) => (
      adapter.findClosedFinancePeriod(context.tenantId, context.branchId, context.lessonDate)
    )],
    ["command.hasActiveSettlement", "command", (adapter) => (
      adapter.hasActiveSettlement(context.tenantId, context.lessonId)
    )],
    ["command.findAlertSource", "command", (adapter) => adapter.findAlertSource(context.tenantId, context.lessonId)],
    ["query.counts", "query", (adapter) => adapter.counts(context.tenantId)],
    ["query.list", "query", (adapter) => adapter.list(context.tenantId)],
    ["query.listForTeacher", "query", (adapter) => adapter.listForTeacher(context.tenantId, context.teacherId)],
    ["query.studentStats", "query", (adapter) => adapter.studentStats(context.tenantId, context.studentIds)],
    ["query.groupStats", "query", (adapter) => adapter.groupStats(context.tenantId, context.groupIds)],
    ["query.studentProfile", "query", (adapter) => adapter.studentProfile(context.tenantId, context.studentId)],
    ["query.groupProfile", "query", (adapter) => adapter.groupProfile(context.tenantId, context.groupId)],
  ];
}

async function run() {
  const fixture = await createRepositoryContractFixture();
  let cleanup;
  try {
    const cases = [];
    for (const [name, type, execute] of readCases(fixture.context)) {
      const sqlite = await execute(fixture.adapters.sqlite[type]);
      const postgres = await execute(fixture.adapters.postgres[type]);
      assert.deepEqual(postgres, sqlite, `${name}: PostgreSQL result differs from SQLite`);
      cases.push({ name, status: "PASS" });
    }

    cleanup = await fixture.cleanup();
    assert.equal(cleanup.schemaDropped, true);
    console.log(JSON.stringify({
      ok: true,
      suite: "attendance-read-contracts",
      summary: { pass: cases.length, fail: 0, diff: 0 },
      cases,
      rollback: { readOnly: true, isolatedSchemaDropped: cleanup.schemaDropped },
    }, null, 2));
  } finally {
    if (!cleanup) await fixture.cleanup();
  }
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
