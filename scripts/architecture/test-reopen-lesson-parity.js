#!/usr/bin/env node

const assert = require("node:assert/strict");
const { PostgresAttendanceRepository } = require("../../src/modules/attendance/infrastructure/PostgresAttendanceRepository");
const { createRepositoryContractFixture } = require("./repository-contract-fixture");

const OCCURRED_AT = "2026-02-10T06:30:00.000Z";
const SETTLEMENT_ERROR = "Reverse the active financial settlement before reopening the lesson";

function scalar(value) {
  return value instanceof Date ? value.toISOString() : value;
}

function parsed(value) {
  return typeof value === "string" ? JSON.parse(value) : value;
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

async function commandFor(fixture, adapter, overrides = {}) {
  const lesson = await adapter.findLesson(fixture.context.tenantId, fixture.context.lessonId);
  return {
    tenantId: overrides.tenantId || fixture.context.tenantId,
    lessonId: fixture.context.lessonId,
    lesson: overrides.lesson || lesson,
    reason: overrides.reason || "Contract reopen",
    actorUserId: overrides.actorUserId,
    actorRole: overrides.actorRole,
    occurredAt: overrides.occurredAt || OCCURRED_AT,
  };
}

async function configureFinanceOpen(fixture, store, financialStatus = "pending") {
  fixture.sqlite.prepare(
    "UPDATE lesson_financial_settlements SET status = 'reversed', reversed_at = ? WHERE tenant_id = ? AND lesson_id = ?",
  ).run(OCCURRED_AT, fixture.context.tenantId, fixture.context.lessonId);
  fixture.sqlite.prepare("UPDATE finance_periods SET status = 'open' WHERE tenant_id = ?")
    .run(fixture.context.tenantId);
  fixture.sqlite.prepare("UPDATE lessons SET financial_status = ? WHERE tenant_id = ? AND id = ?")
    .run(financialStatus, fixture.context.tenantId, fixture.context.lessonId);
  if (store === "postgres") {
    await fixture.postgres.query(
      "UPDATE lesson_financial_settlements SET status = 'reversed', reversed_at = $1 WHERE tenant_id = $2 AND lesson_id = $3",
      [OCCURRED_AT, fixture.context.tenantId, fixture.context.lessonId],
    );
    await fixture.postgres.query("UPDATE finance_periods SET status = 'open' WHERE tenant_id = $1", [fixture.context.tenantId]);
    await fixture.postgres.query("UPDATE lessons SET financial_status = $1 WHERE tenant_id = $2 AND id = $3", [
      financialStatus, fixture.context.tenantId, fixture.context.lessonId,
    ]);
  }
}

async function readState(fixture, store, returnedLesson) {
  const sqlite = store === "sqlite";
  const params = [fixture.context.tenantId, fixture.context.lessonId];
  const lesson = sqlite
    ? fixture.sqlite.prepare(`
      SELECT status, attendance_version, financial_status, completed_by, completed_at, version
      FROM lessons WHERE tenant_id = ? AND id = ?
    `).get(...params)
    : (await fixture.postgres.query(`
      SELECT status, attendance_version, financial_status, completed_by, completed_at, version
      FROM lessons WHERE tenant_id = $1 AND id = $2
    `, params)).rows[0];
  const attendanceCount = sqlite
    ? fixture.sqlite.prepare("SELECT COUNT(*) AS count FROM attendance WHERE tenant_id = ? AND lesson_id = ?").get(...params).count
    : Number((await fixture.postgres.query("SELECT COUNT(*) AS count FROM attendance WHERE tenant_id = $1 AND lesson_id = $2", params)).rows[0].count);
  const outbox = sqlite
    ? fixture.sqlite.prepare(`
      SELECT id, event_type, source_version, payload_json, created_at
      FROM migration_outbox
      WHERE tenant_id = ? AND aggregate_id = ? AND event_type = 'attendance.reopened'
      ORDER BY sequence DESC LIMIT 1
    `).get(...params)
    : (await fixture.postgres.query(`
      SELECT id, event_type, source_version, payload_json, created_at
      FROM migration_outbox
      WHERE tenant_id = $1 AND aggregate_id = $2 AND event_type = 'attendance.reopened'
      ORDER BY sequence DESC LIMIT 1
    `, params)).rows[0];
  assert.ok(outbox, `${store}: reopen outbox missing`);
  const event = sqlite
    ? fixture.sqlite.prepare(`
      SELECT id, actor_user_id, actor_role, action, reason, before_json, after_json, created_at
      FROM lesson_events WHERE tenant_id = ? AND id = ?
    `).get(fixture.context.tenantId, outbox.id)
    : (await fixture.postgres.query(`
      SELECT id, actor_user_id, actor_role, action, reason, before_json, after_json, created_at
      FROM lesson_events WHERE tenant_id = $1 AND id = $2
    `, [fixture.context.tenantId, outbox.id])).rows[0];
  assert.ok(event, `${store}: reopen event missing`);
  assert.equal(event.id, outbox.id, `${store}: event/outbox ordering identity differs`);
  const payload = structuredClone(parsed(outbox.payload_json));
  payload.eventId = "<event-id>";
  return {
    returnedLesson,
    lesson: {
      status: lesson.status,
      attendanceVersion: Number(lesson.attendance_version),
      financialStatus: lesson.financial_status,
      completedBy: lesson.completed_by,
      completedAt: lesson.completed_at,
      version: Number(lesson.version),
    },
    attendanceCount,
    event: {
      actorUserId: event.actor_user_id,
      actorRole: event.actor_role,
      action: event.action,
      reason: event.reason,
      before: parsed(event.before_json),
      after: parsed(event.after_json),
      createdAt: scalar(event.created_at),
    },
    outbox: {
      eventType: outbox.event_type,
      sourceVersion: Number(outbox.source_version),
      direction: "primary-to-replica",
      payload,
      createdAt: scalar(outbox.created_at),
    },
  };
}

async function successfulParity(financialStatus, actorDefaults) {
  return pair(async (sqliteFixture, postgresFixture) => {
    await configureFinanceOpen(sqliteFixture, "sqlite", financialStatus);
    await configureFinanceOpen(postgresFixture, "postgres", financialStatus);
    const overrides = actorDefaults
      ? { actorUserId: "", actorRole: "" }
      : { actorUserId: "contract-admin-001", actorRole: "admin" };
    const sqliteCommand = await commandFor(sqliteFixture, sqliteFixture.adapters.sqlite.command, overrides);
    const postgresCommand = await commandFor(postgresFixture, postgresFixture.adapters.postgres.command, overrides);
    const sqliteResult = await sqliteFixture.adapters.sqlite.command.reopenLesson(sqliteCommand);
    const postgresResult = await postgresFixture.adapters.postgres.command.reopenLesson(postgresCommand);
    const sqliteState = await readState(sqliteFixture, "sqlite", sqliteResult);
    const postgresState = await readState(postgresFixture, "postgres", postgresResult);
    assert.deepEqual(postgresState, sqliteState);
    assert.equal(sqliteState.lesson.financialStatus, financialStatus === "reversed" ? "reversed" : "unposted");
    assert.equal(sqliteState.attendanceCount, 0);
    return { financialStatus, actorDefaults, status: "PASS", sourceVersion: sqliteResult.attendanceVersion };
  });
}

async function rejectionParity(name, configure, expected) {
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
      const before = store === "sqlite"
        ? fixture.sqlite.prepare("SELECT status, attendance_version, version FROM lessons WHERE tenant_id = ? AND id = ?").get(fixture.context.tenantId, fixture.context.lessonId)
        : (await fixture.postgres.query("SELECT status, attendance_version, version FROM lessons WHERE tenant_id = $1 AND id = $2", [fixture.context.tenantId, fixture.context.lessonId])).rows[0];
      const command = await commandFor(fixture, adapter, { lesson: adapter.__contractLesson });
      try {
        await adapter.reopenLesson(command);
        results[store] = { outcome: "COMMIT" };
      } catch (error) {
        results[store] = { outcome: "REJECT", status: Number(error.status || 0), message: error.message };
      }
      const after = store === "sqlite"
        ? fixture.sqlite.prepare("SELECT status, attendance_version, version FROM lessons WHERE tenant_id = ? AND id = ?").get(fixture.context.tenantId, fixture.context.lessonId)
        : (await fixture.postgres.query("SELECT status, attendance_version, version FROM lessons WHERE tenant_id = $1 AND id = $2", [fixture.context.tenantId, fixture.context.lessonId])).rows[0];
      assert.deepEqual({ status: after.status, attendanceVersion: Number(after.attendance_version), version: Number(after.version) }, {
        status: before.status, attendanceVersion: Number(before.attendance_version), version: Number(before.version),
      });
    }
    assert.deepEqual(results.postgres, results.sqlite);
    assert.deepEqual(results.sqlite, expected);
    return { name, status: "PASS", ...expected, rollback: true };
  });
}

async function eventFailureRollback() {
  return pair(async (sqliteFixture, postgresFixture) => {
    await configureFinanceOpen(sqliteFixture, "sqlite");
    await configureFinanceOpen(postgresFixture, "postgres");
    sqliteFixture.sqlite.exec(`
      CREATE TRIGGER contract_fail_reopen_event
      BEFORE INSERT ON lesson_events
      WHEN NEW.action = 'completion_reversed'
      BEGIN SELECT RAISE(ABORT, 'contract reopen event failure'); END
    `);
    await postgresFixture.postgres.query(`
      CREATE FUNCTION contract_fail_reopen_event() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'contract reopen event failure'; END;
      $$ LANGUAGE plpgsql
    `);
    await postgresFixture.postgres.query(`
      CREATE TRIGGER contract_fail_reopen_event
      BEFORE INSERT ON lesson_events
      FOR EACH ROW WHEN (NEW.action = 'completion_reversed')
      EXECUTE FUNCTION contract_fail_reopen_event()
    `);
    for (const [store, fixture, adapter] of [
      ["sqlite", sqliteFixture, sqliteFixture.adapters.sqlite.command],
      ["postgres", postgresFixture, postgresFixture.adapters.postgres.command],
    ]) {
      const beforeCount = store === "sqlite"
        ? fixture.sqlite.prepare("SELECT COUNT(*) AS count FROM attendance WHERE tenant_id = ? AND lesson_id = ?").get(fixture.context.tenantId, fixture.context.lessonId).count
        : Number((await fixture.postgres.query("SELECT COUNT(*) AS count FROM attendance WHERE tenant_id = $1 AND lesson_id = $2", [fixture.context.tenantId, fixture.context.lessonId])).rows[0].count);
      const command = await commandFor(fixture, adapter);
      await assert.rejects(async () => adapter.reopenLesson(command), /contract reopen event failure/);
      const lesson = await adapter.findLesson(fixture.context.tenantId, fixture.context.lessonId);
      assert.equal(lesson.status, "completed");
      assert.equal(lesson.attendanceVersion, 3);
      const afterCount = store === "sqlite"
        ? fixture.sqlite.prepare("SELECT COUNT(*) AS count FROM attendance WHERE tenant_id = ? AND lesson_id = ?").get(fixture.context.tenantId, fixture.context.lessonId).count
        : Number((await fixture.postgres.query("SELECT COUNT(*) AS count FROM attendance WHERE tenant_id = $1 AND lesson_id = $2", [fixture.context.tenantId, fixture.context.lessonId])).rows[0].count);
      assert.equal(afterCount, beforeCount);
    }
    return { name: "event failure rollback", status: "PASS" };
  });
}

async function missingGuardFailsClosed() {
  const fixture = await createRepositoryContractFixture();
  try {
    await configureFinanceOpen(fixture, "postgres");
    const adapter = new PostgresAttendanceRepository(fixture.postgres, {
      lessonReferenceReader: fixture.adapters.sqlite.command,
    });
    const command = await commandFor(fixture, adapter);
    await assert.rejects(async () => adapter.reopenLesson(command), /Attendance finance guard is not configured/);
    const lesson = await fixture.adapters.postgres.command.findLesson(fixture.context.tenantId, fixture.context.lessonId);
    assert.equal(lesson.status, "completed");
    return { name: "finance guard unavailable", status: "PASS", failClosed: true };
  } finally {
    await fixture.cleanup();
  }
}

async function concurrencyCheck() {
  const fixture = await createRepositoryContractFixture();
  try {
    await configureFinanceOpen(fixture, "postgres");
    const adapter = fixture.adapters.postgres.command;
    const command = await commandFor(fixture, adapter);
    const outcomes = await Promise.allSettled([
      adapter.reopenLesson(command),
      adapter.reopenLesson({ ...command, reason: "Concurrent reopen" }),
    ]);
    assert.equal(outcomes.filter((item) => item.status === "fulfilled").length, 1);
    const rejected = outcomes.filter((item) => item.status === "rejected");
    assert.equal(rejected.length, 1);
    assert.equal(rejected[0].reason.status, 409);
    const { rows } = await fixture.postgres.query(`
      SELECT
        (SELECT COUNT(*) FROM lesson_events WHERE tenant_id = $1 AND lesson_id = $2 AND action = 'completion_reversed') AS events,
        (SELECT COUNT(*) FROM migration_outbox WHERE tenant_id = $1 AND aggregate_id = $2 AND event_type = 'attendance.reopened') AS outbox
    `, [fixture.context.tenantId, fixture.context.lessonId]);
    assert.deepEqual({ events: Number(rows[0].events), outbox: Number(rows[0].outbox) }, { events: 1, outbox: 1 });
    return { name: "concurrent reopen", status: "PASS", committed: 1, rejected: 1 };
  } finally {
    await fixture.cleanup();
  }
}

async function boundaryRejections() {
  return pair(async (sqliteFixture, postgresFixture) => {
    const cases = [];
    for (const [name, tenantId, lessonId, expected] of [
      ["non-completed lesson", sqliteFixture.context.tenantId, sqliteFixture.context.plannedLessonId, {
        outcome: "REJECT", status: 409, message: "Only a completed lesson can be reopened",
      }],
      ["tenant isolation", "contract-tenant-other", sqliteFixture.context.lessonId, {
        outcome: "REJECT", status: 404, message: "Lesson not found",
      }],
    ]) {
      const results = {};
      for (const [store, fixture, adapter] of [
        ["sqlite", sqliteFixture, sqliteFixture.adapters.sqlite.command],
        ["postgres", postgresFixture, postgresFixture.adapters.postgres.command],
      ]) {
        const authoritativeLesson = await adapter.findLesson(fixture.context.tenantId, lessonId);
        const command = {
          tenantId,
          lessonId,
          lesson: authoritativeLesson,
          reason: "Boundary rejection",
          actorUserId: "contract-admin-001",
          actorRole: "admin",
          occurredAt: OCCURRED_AT,
        };
        try {
          await adapter.reopenLesson(command);
          results[store] = { outcome: "COMMIT" };
        } catch (error) {
          results[store] = { outcome: "REJECT", status: Number(error.status || 0), message: error.message };
        }
      }
      assert.deepEqual(results.postgres, results.sqlite);
      assert.deepEqual(results.sqlite, expected);
      cases.push({ name, status: "PASS", rejectedStatus: expected.status });
    }
    return cases;
  });
}

async function run() {
  const previousMirror = process.env.DONO_ATTENDANCE_MIRROR_ENABLED;
  process.env.DONO_ATTENDANCE_MIRROR_ENABLED = "true";
  try {
    const pending = await successfulParity("pending", true);
    const reversed = await successfulParity("reversed", false);
    const settlement = await rejectionParity("confirmed settlement", null, {
      outcome: "REJECT", status: 409, message: SETTLEMENT_ERROR,
    });
    const closed = await rejectionParity("closed period", async (fixture, store) => {
      fixture.sqlite.prepare("UPDATE lesson_financial_settlements SET status = 'reversed' WHERE tenant_id = ? AND lesson_id = ?")
        .run(fixture.context.tenantId, fixture.context.lessonId);
      if (store === "postgres") {
        await fixture.postgres.query("UPDATE lesson_financial_settlements SET status = 'reversed' WHERE tenant_id = $1 AND lesson_id = $2", [fixture.context.tenantId, fixture.context.lessonId]);
      }
    }, { outcome: "REJECT", status: 409, message: "Finance period is closed: Contract Branch February" });
    const stale = await rejectionParity("stale version", async (fixture, store) => {
      await configureFinanceOpen(fixture, store);
      const adapter = store === "sqlite" ? fixture.adapters.sqlite.command : fixture.adapters.postgres.command;
      const lesson = await adapter.findLesson(fixture.context.tenantId, fixture.context.lessonId);
      adapter.__contractLesson = { ...lesson, attendanceVersion: lesson.attendanceVersion - 1 };
    }, { outcome: "REJECT", status: 409, message: "Attendance changed concurrently; reload the lesson and try again" });
    const eventRollback = await eventFailureRollback();
    const missingGuard = await missingGuardFailsClosed();
    const concurrency = await concurrencyCheck();
    const boundaries = await boundaryRejections();

    console.log(JSON.stringify({
      ok: true,
      method: "reopenLesson",
      before: { confirmedSettlement: { sqlite: "REJECT 409", postgres: "COMMIT", status: "DIFF" } },
      after: {
        success: [pending, reversed],
        rejections: [settlement, closed, stale],
        safety: [eventRollback, missingGuard, concurrency, ...boundaries],
        summary: { pass: 10, fail: 0, diff: 0 },
      },
      invariants: {
        sqliteFinanceAuthority: true,
        financialTransition: true,
        attendanceDeleteAtomic: true,
        canonicalEventAndOutbox: true,
        actorDefaults: true,
        tenantScopedWrites: true,
        rollbackOnFailure: true,
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
