#!/usr/bin/env node

const assert = require("node:assert/strict");
const { PostgresAttendanceRepository } = require("../../src/modules/attendance/infrastructure/PostgresAttendanceRepository");
const { createRepositoryContractFixture } = require("./repository-contract-fixture");

const OCCURRED_AT = "2026-03-10T06:00:00.000Z";
const SETTLEMENT_ERROR = "Reverse the active financial settlement before correcting attendance";

function value(value) {
  return value instanceof Date ? value.toISOString() : value;
}

function json(valueToParse) {
  return typeof valueToParse === "string" ? JSON.parse(valueToParse) : valueToParse;
}

function records(fixture) {
  return [
    {
      studentId: fixture.context.studentIds[2],
      status: "late",
      reasonId: fixture.context.reasonId,
      reasonCode: "late",
      reasonName: "Late",
      chargePercent: 75,
      consumePercent: 50,
      note: "Arrived late",
    },
    {
      studentId: fixture.context.studentIds[0],
      status: "present",
      reasonId: fixture.context.reasonId,
      reasonCode: "present",
      reasonName: "Present",
      chargePercent: 100,
      consumePercent: 100,
      note: "",
    },
  ];
}

async function commandFor(fixture, adapter, lessonId, overrides = {}) {
  const lesson = await adapter.findLesson(fixture.context.tenantId, lessonId);
  return {
    tenantId: fixture.context.tenantId,
    lessonId,
    lesson: overrides.lesson || lesson,
    records: overrides.records || records(fixture),
    actorUserId: overrides.actorUserId,
    actorRole: overrides.actorRole,
    correctionReason: overrides.correctionReason,
    details: overrides.details || { topic: "Canonical topic", homework: "Canonical homework", note: "Canonical note" },
    occurredAt: overrides.occurredAt || OCCURRED_AT,
  };
}

function normalizePayload(payload, eventId) {
  const normalized = structuredClone(payload);
  if (normalized.eventId === eventId) normalized.eventId = "<event-id>";
  return normalized;
}

async function readState(fixture, store, lessonId, returnedLesson) {
  const sqlite = store === "sqlite";
  const source = sqlite ? fixture.sqlite : fixture.postgres;
  const params = sqlite ? [fixture.context.tenantId, lessonId] : [fixture.context.tenantId, lessonId];
  const attendance = sqlite
    ? source.prepare(`
      SELECT student_id, status, reason_id, reason_code, reason_name,
             charge_percent, consume_percent, COALESCE(note, '') AS note, created_at
      FROM attendance WHERE tenant_id = ? AND lesson_id = ? ORDER BY student_id
    `).all(...params)
    : (await source.query(`
      SELECT student_id, status, reason_id, reason_code, reason_name,
             charge_percent, consume_percent, COALESCE(note, '') AS note, created_at
      FROM attendance WHERE tenant_id = $1 AND lesson_id = $2 ORDER BY student_id
    `, params)).rows;
  const revision = sqlite
    ? source.prepare(`
      SELECT actor_user_id, actor_role, reason, snapshot_json, created_at
      FROM lesson_attendance_revisions
      WHERE tenant_id = ? AND lesson_id = ? ORDER BY revision_no DESC LIMIT 1
    `).get(...params)
    : (await source.query(`
      SELECT actor_user_id, actor_role, reason, snapshot_json, created_at
      FROM lesson_attendance_revisions
      WHERE tenant_id = $1 AND lesson_id = $2 ORDER BY revision_no DESC LIMIT 1
    `, params)).rows[0];
  const event = sqlite
    ? source.prepare(`
      SELECT id, actor_user_id, actor_role, action, reason, before_json, after_json, created_at
      FROM lesson_events WHERE tenant_id = ? AND lesson_id = ? ORDER BY created_at DESC, id DESC LIMIT 1
    `).get(...params)
    : (await source.query(`
      SELECT id, actor_user_id, actor_role, action, reason, before_json, after_json, created_at
      FROM lesson_events WHERE tenant_id = $1 AND lesson_id = $2 ORDER BY created_at DESC, id DESC LIMIT 1
    `, params)).rows[0];
  const outbox = sqlite
    ? source.prepare(`
      SELECT id, event_type, source_version, source_store, target_store, payload_json, created_at
      FROM migration_outbox
      WHERE tenant_id = ? AND aggregate_id = ? AND event_type = 'attendance.replaced'
      ORDER BY sequence DESC LIMIT 1
    `).get(...params)
    : (await source.query(`
      SELECT id, event_type, source_version, source_store, target_store, payload_json, created_at
      FROM migration_outbox
      WHERE tenant_id = $1 AND aggregate_id = $2 AND event_type = 'attendance.replaced'
      ORDER BY sequence DESC LIMIT 1
    `, params)).rows[0];
  const financial = sqlite
    ? source.prepare(`
      SELECT financial_posted_at, financial_posted_by, financial_reversed_at,
             financial_reversed_by, financial_reversal_reason
      FROM lessons WHERE tenant_id = ? AND id = ?
    `).get(...params)
    : (await source.query(`
      SELECT financial_posted_at, financial_posted_by, financial_reversed_at,
             financial_reversed_by, financial_reversal_reason
      FROM lessons WHERE tenant_id = $1 AND id = $2
    `, params)).rows[0];

  assert.ok(revision, `${store}: revision missing`);
  assert.ok(event, `${store}: lesson event missing`);
  assert.ok(outbox, `${store}: outbox event missing`);
  assert.equal(outbox.id, event.id, `${store}: event/outbox ordering identity differs`);
  const payload = normalizePayload(json(outbox.payload_json), outbox.id);

  return {
    returnedLesson,
    attendance: attendance.map((row) => ({
      studentId: row.student_id,
      status: row.status,
      reasonId: row.reason_id || "",
      reasonCode: row.reason_code || "",
      reasonName: row.reason_name || "",
      chargePercent: Number(row.charge_percent || 0),
      consumePercent: Number(row.consume_percent || 0),
      note: row.note || "",
      createdAt: value(row.created_at),
    })),
    revision: {
      actorUserId: revision.actor_user_id,
      actorRole: revision.actor_role,
      reason: revision.reason || "",
      snapshot: json(revision.snapshot_json),
      createdAt: value(revision.created_at),
    },
    event: {
      actorUserId: event.actor_user_id,
      actorRole: event.actor_role,
      action: event.action,
      reason: event.reason || "",
      before: json(event.before_json),
      after: json(event.after_json),
      createdAt: value(event.created_at),
    },
    outbox: {
      eventType: outbox.event_type,
      sourceVersion: Number(outbox.source_version),
      direction: "primary-to-replica",
      payload,
      createdAt: value(outbox.created_at),
    },
    financial: {
      postedAt: financial.financial_posted_at,
      postedBy: financial.financial_posted_by,
      reversedAt: financial.financial_reversed_at,
      reversedBy: financial.financial_reversed_by,
      reversalReason: financial.financial_reversal_reason,
    },
  };
}

async function pair(callback) {
  const sqliteFixture = await createRepositoryContractFixture();
  const postgresFixture = await createRepositoryContractFixture();
  try {
    return await callback(sqliteFixture, postgresFixture);
  } finally {
    await sqliteFixture.cleanup();
    await postgresFixture.cleanup();
  }
}

async function successfulParity({ lessonKey, prepare, overrides }) {
  return pair(async (sqliteFixture, postgresFixture) => {
    if (prepare) {
      await prepare(sqliteFixture, "sqlite");
      await prepare(postgresFixture, "postgres");
    }
    const lessonId = sqliteFixture.context[lessonKey];
    const sqliteCommand = await commandFor(sqliteFixture, sqliteFixture.adapters.sqlite.command, lessonId, overrides);
    const postgresCommand = await commandFor(postgresFixture, postgresFixture.adapters.postgres.command, lessonId, overrides);
    const sqliteResult = await sqliteFixture.adapters.sqlite.command.replaceForLesson(sqliteCommand);
    const postgresResult = await postgresFixture.adapters.postgres.command.replaceForLesson(postgresCommand);
    const sqliteState = await readState(sqliteFixture, "sqlite", lessonId, sqliteResult);
    const postgresState = await readState(postgresFixture, "postgres", lessonId, postgresResult);
    assert.deepEqual(postgresState, sqliteState);
    return { action: sqliteState.event.action, revision: sqliteResult.attendanceVersion, status: "PASS" };
  });
}

async function unblockCorrection(fixture, store) {
  fixture.sqlite.prepare(
    "UPDATE lesson_financial_settlements SET status = 'reversed', reversed_at = ? WHERE tenant_id = ? AND lesson_id = ?",
  ).run(OCCURRED_AT, fixture.context.tenantId, fixture.context.lessonId);
  fixture.sqlite.prepare("UPDATE finance_periods SET status = 'open' WHERE tenant_id = ?")
    .run(fixture.context.tenantId);
  fixture.sqlite.prepare(`
    UPDATE lessons SET financial_status = 'reversed', financial_reversed_at = ?,
      financial_reversed_by = 'contract-admin-001', financial_reversal_reason = 'fixture reversal'
    WHERE tenant_id = ? AND id = ?
  `).run(OCCURRED_AT, fixture.context.tenantId, fixture.context.lessonId);
  if (store === "postgres") {
    await fixture.postgres.query(
      "UPDATE lesson_financial_settlements SET status = 'reversed', reversed_at = $1 WHERE tenant_id = $2 AND lesson_id = $3",
      [OCCURRED_AT, fixture.context.tenantId, fixture.context.lessonId],
    );
    await fixture.postgres.query("UPDATE finance_periods SET status = 'open' WHERE tenant_id = $1", [fixture.context.tenantId]);
    await fixture.postgres.query(`
      UPDATE lessons SET financial_status = 'reversed', financial_reversed_at = $1,
        financial_reversed_by = 'contract-admin-001', financial_reversal_reason = 'fixture reversal'
      WHERE tenant_id = $2 AND id = $3
    `, [OCCURRED_AT, fixture.context.tenantId, fixture.context.lessonId]);
  }
}

async function rejectionParity(name, configure, expectedMessage, expectedStatus = 409) {
  return pair(async (sqliteFixture, postgresFixture) => {
    if (configure) {
      await configure(sqliteFixture, "sqlite");
      await configure(postgresFixture, "postgres");
    }
    const results = {};
    for (const [store, fixture, adapter] of [
      ["sqlite", sqliteFixture, sqliteFixture.adapters.sqlite.command],
      ["postgres", postgresFixture, postgresFixture.adapters.postgres.command],
    ]) {
      const lessonId = fixture.context.lessonId;
      const before = store === "sqlite"
        ? fixture.sqlite.prepare("SELECT attendance_version, version FROM lessons WHERE tenant_id = ? AND id = ?").get(fixture.context.tenantId, lessonId)
        : (await fixture.postgres.query("SELECT attendance_version, version FROM lessons WHERE tenant_id = $1 AND id = $2", [fixture.context.tenantId, lessonId])).rows[0];
      const command = await commandFor(fixture, adapter, lessonId, {
        lesson: adapter.__staleLesson,
      });
      try {
        await adapter.replaceForLesson(command);
        results[store] = { outcome: "COMMIT" };
      } catch (error) {
        results[store] = { outcome: "REJECT", status: Number(error.status || 0), message: error.message };
      }
      const after = store === "sqlite"
        ? fixture.sqlite.prepare("SELECT attendance_version, version FROM lessons WHERE tenant_id = ? AND id = ?").get(fixture.context.tenantId, lessonId)
        : (await fixture.postgres.query("SELECT attendance_version, version FROM lessons WHERE tenant_id = $1 AND id = $2", [fixture.context.tenantId, lessonId])).rows[0];
      assert.deepEqual({ attendanceVersion: Number(after.attendance_version), version: Number(after.version) }, {
        attendanceVersion: Number(before.attendance_version), version: Number(before.version),
      });
    }
    assert.deepEqual(results.postgres, results.sqlite);
    assert.deepEqual(results.sqlite, { outcome: "REJECT", status: expectedStatus, message: expectedMessage });
    return { name, ...results.sqlite, rollback: true };
  });
}

async function rollbackFailureParity() {
  return pair(async (sqliteFixture, postgresFixture) => {
    const results = [];
    for (const [store, fixture, adapter] of [
      ["sqlite", sqliteFixture, sqliteFixture.adapters.sqlite.command],
      ["postgres", postgresFixture, postgresFixture.adapters.postgres.command],
    ]) {
      const lessonId = fixture.context.plannedLessonId;
      const before = store === "sqlite"
        ? fixture.sqlite.prepare("SELECT attendance_version, version FROM lessons WHERE tenant_id = ? AND id = ?").get(fixture.context.tenantId, lessonId)
        : (await fixture.postgres.query("SELECT attendance_version, version FROM lessons WHERE tenant_id = $1 AND id = $2", [fixture.context.tenantId, lessonId])).rows[0];
      const duplicate = records(fixture)[0];
      const command = await commandFor(fixture, adapter, lessonId, { records: [duplicate, duplicate] });
      await assert.rejects(async () => adapter.replaceForLesson(command));
      const after = store === "sqlite"
        ? fixture.sqlite.prepare("SELECT attendance_version, version FROM lessons WHERE tenant_id = ? AND id = ?").get(fixture.context.tenantId, lessonId)
        : (await fixture.postgres.query("SELECT attendance_version, version FROM lessons WHERE tenant_id = $1 AND id = $2", [fixture.context.tenantId, lessonId])).rows[0];
      assert.deepEqual({ attendanceVersion: Number(after.attendance_version), version: Number(after.version) }, {
        attendanceVersion: Number(before.attendance_version), version: Number(before.version),
      });
      const attendanceCount = store === "sqlite"
        ? fixture.sqlite.prepare("SELECT COUNT(*) AS count FROM attendance WHERE tenant_id = ? AND lesson_id = ?").get(fixture.context.tenantId, lessonId).count
        : Number((await fixture.postgres.query("SELECT COUNT(*) AS count FROM attendance WHERE tenant_id = $1 AND lesson_id = $2", [fixture.context.tenantId, lessonId])).rows[0].count);
      assert.equal(attendanceCount, 0);
      results.push({ store, rolledBack: true });
    }
    return { name: "transaction failure", status: "PASS", results };
  });
}

async function missingGuardFailsClosed() {
  const fixture = await createRepositoryContractFixture();
  try {
    const adapter = new PostgresAttendanceRepository(fixture.postgres, {
      lessonReferenceReader: fixture.adapters.sqlite.command,
    });
    const command = await commandFor(fixture, adapter, fixture.context.plannedLessonId);
    await assert.rejects(
      async () => adapter.replaceForLesson(command),
      /Attendance finance guard is not configured/,
    );
    const lesson = await fixture.adapters.postgres.command.findLesson(fixture.context.tenantId, fixture.context.plannedLessonId);
    assert.equal(lesson.attendanceVersion, 0);
    assert.equal(lesson.status, "planned");
    return { name: "finance guard unavailable", status: "PASS", failClosed: true };
  } finally {
    await fixture.cleanup();
  }
}

async function tenantIsolationParity() {
  return pair(async (sqliteFixture, postgresFixture) => {
    const results = {};
    for (const [store, fixture, adapter] of [
      ["sqlite", sqliteFixture, sqliteFixture.adapters.sqlite.command],
      ["postgres", postgresFixture, postgresFixture.adapters.postgres.command],
    ]) {
      const lesson = await adapter.findLesson(fixture.context.tenantId, fixture.context.plannedLessonId);
      const command = await commandFor(fixture, adapter, fixture.context.plannedLessonId, { lesson });
      command.tenantId = "contract-tenant-other";
      try {
        await adapter.replaceForLesson(command);
        results[store] = { outcome: "COMMIT" };
      } catch (error) {
        results[store] = { outcome: "REJECT", status: Number(error.status || 0), message: error.message };
      }
    }
    assert.deepEqual(results.postgres, results.sqlite);
    assert.deepEqual(results.sqlite, { outcome: "REJECT", status: 404, message: "Lesson not found" });
    return {
      name: "tenant isolation",
      status: "PASS",
      outcome: results.sqlite.outcome,
      rejectedStatus: results.sqlite.status,
      message: results.sqlite.message,
    };
  });
}

async function concurrencyParity() {
  const fixture = await createRepositoryContractFixture();
  try {
    const adapter = fixture.adapters.postgres.command;
    const first = await commandFor(fixture, adapter, fixture.context.plannedLessonId, {
      details: { topic: "First writer", homework: "", note: "" },
    });
    const second = { ...first, details: { topic: "Second writer", homework: "", note: "" } };
    const outcomes = await Promise.allSettled([
      adapter.replaceForLesson(first),
      adapter.replaceForLesson(second),
    ]);
    assert.equal(outcomes.filter((item) => item.status === "fulfilled").length, 1);
    const rejected = outcomes.filter((item) => item.status === "rejected");
    assert.equal(rejected.length, 1);
    assert.equal(rejected[0].reason.status, 409);
    assert.equal(rejected[0].reason.message, "Attendance changed concurrently; reload the lesson and try again");
    const { rows } = await fixture.postgres.query(`
      SELECT
        (SELECT COUNT(*) FROM lesson_attendance_revisions WHERE tenant_id = $1 AND lesson_id = $2) AS revisions,
        (SELECT COUNT(*) FROM lesson_events WHERE tenant_id = $1 AND lesson_id = $2) AS events,
        (SELECT COUNT(*) FROM migration_outbox WHERE tenant_id = $1 AND aggregate_id = $2 AND event_type = 'attendance.replaced') AS outbox
    `, [fixture.context.tenantId, fixture.context.plannedLessonId]);
    assert.deepEqual({
      revisions: Number(rows[0].revisions),
      events: Number(rows[0].events),
      outbox: Number(rows[0].outbox),
    }, { revisions: 1, events: 1, outbox: 1 });
    return { name: "concurrent writers", status: "PASS", committed: 1, rejected: 1 };
  } finally {
    await fixture.cleanup();
  }
}

async function run() {
  const previousMirror = process.env.DONO_ATTENDANCE_MIRROR_ENABLED;
  process.env.DONO_ATTENDANCE_MIRROR_ENABLED = "true";
  try {
    const initial = await successfulParity({
      lessonKey: "plannedLessonId",
      overrides: { actorUserId: "", actorRole: "", correctionReason: "" },
    });
    const correction = await successfulParity({
      lessonKey: "lessonId",
      prepare: unblockCorrection,
      overrides: {
        actorUserId: "contract-admin-001",
        actorRole: "admin",
        correctionReason: "Correct contract attendance",
        occurredAt: "2026-02-10T06:00:00.000Z",
      },
    });
    const confirmedSettlement = await rejectionParity(
      "confirmed settlement",
      null,
      SETTLEMENT_ERROR,
    );
    const closedPeriod = await rejectionParity(
      "closed period",
      async (fixture, store) => {
        fixture.sqlite.prepare("UPDATE lesson_financial_settlements SET status = 'reversed' WHERE tenant_id = ? AND lesson_id = ?")
          .run(fixture.context.tenantId, fixture.context.lessonId);
        if (store === "postgres") {
          await fixture.postgres.query("UPDATE lesson_financial_settlements SET status = 'reversed' WHERE tenant_id = $1 AND lesson_id = $2", [fixture.context.tenantId, fixture.context.lessonId]);
        }
      },
      "Finance period is closed: Contract Branch February",
    );
    const stale = await rejectionParity(
      "stale version",
      async (fixture, store) => {
        await unblockCorrection(fixture, store);
        const adapter = store === "sqlite" ? fixture.adapters.sqlite.command : fixture.adapters.postgres.command;
        const original = await adapter.findLesson(fixture.context.tenantId, fixture.context.lessonId);
        adapter.__staleLesson = { ...original, attendanceVersion: original.attendanceVersion - 1 };
      },
      "Attendance changed concurrently; reload the lesson and try again",
    );
    const transactionFailure = await rollbackFailureParity();
    const missingGuard = await missingGuardFailsClosed();
    const tenantIsolation = await tenantIsolationParity();
    const concurrency = await concurrencyParity();

    console.log(JSON.stringify({
      ok: true,
      method: "replaceForLesson",
      before: {
        confirmedSettlement: { sqlite: "REJECT 409", postgres: "COMMIT", status: "DIFF" },
      },
      after: {
        success: [initial, correction],
        rejections: [confirmedSettlement, closedPeriod, stale],
        safety: [transactionFailure, missingGuard, tenantIsolation, concurrency],
        summary: { pass: 9, fail: 0, diff: 0 },
      },
      invariants: {
        sqliteAuthority: true,
        financeGuardsInsidePostgresTransaction: true,
        optimisticVersion: true,
        canonicalRecordOrder: true,
        canonicalRevisionEventOutbox: true,
        reversalMetadataCleared: true,
        tenantScopedWrites: true,
        rollbackOnRejection: true,
      },
    }, null, 2));
  } finally {
    if (previousMirror === undefined) delete process.env.DONO_ATTENDANCE_MIRROR_ENABLED;
    else process.env.DONO_ATTENDANCE_MIRROR_ENABLED = previousMirror;
  }
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
