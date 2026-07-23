#!/usr/bin/env node

const assert = require("node:assert/strict");
const { AttendanceOutboxRelay } = require("../../src/infrastructure/migration/AttendanceOutboxRelay");
const { createRepositoryContractFixture } = require("./repository-contract-fixture");

const OCCURRED_AT = "2026-03-10T06:30:00.000Z";

function sqliteAttendance(fixture, lessonId) {
  return fixture.sqlite.prepare(`
    SELECT student_id, status, reason_id, reason_code, reason_name,
           charge_percent, consume_percent, COALESCE(note, '') AS note
    FROM attendance
    WHERE tenant_id = ? AND lesson_id = ?
    ORDER BY student_id
  `).all(fixture.context.tenantId, lessonId).map((row) => ({
    studentId: row.student_id,
    status: row.status,
    reasonId: row.reason_id,
    reasonCode: row.reason_code,
    reasonName: row.reason_name,
    chargePercent: Number(row.charge_percent),
    consumePercent: Number(row.consume_percent),
    note: row.note,
  }));
}

async function postgresAttendance(fixture, lessonId) {
  const { rows } = await fixture.postgres.query(`
    SELECT student_id, status, reason_id, reason_code, reason_name,
           charge_percent, consume_percent, COALESCE(note, '') AS note
    FROM attendance
    WHERE tenant_id = $1 AND lesson_id = $2
    ORDER BY student_id
  `, [fixture.context.tenantId, lessonId]);
  return rows.map((row) => ({
    studentId: row.student_id,
    status: row.status,
    reasonId: row.reason_id,
    reasonCode: row.reason_code,
    reasonName: row.reason_name,
    chargePercent: Number(row.charge_percent),
    consumePercent: Number(row.consume_percent),
    note: row.note,
  }));
}

async function run() {
  const fixture = await createRepositoryContractFixture();
  const previousMirror = process.env.DONO_ATTENDANCE_MIRROR_ENABLED;
  try {
    process.env.DONO_ATTENDANCE_MIRROR_ENABLED = "true";
    fixture.sqlite.prepare(`
      UPDATE migration_runtime_flags
      SET enabled = 1, updated_at = ?
      WHERE key = 'attendance_reference_mirror'
    `).run(OCCURRED_AT);

    const lessonId = fixture.context.plannedLessonId;
    const lesson = await fixture.adapters.sqlite.command.findLesson(fixture.context.tenantId, lessonId);
    await fixture.adapters.sqlite.command.replaceForLesson({
      tenantId: fixture.context.tenantId,
      lessonId,
      lesson,
      records: [
        {
          studentId: fixture.context.studentIds[0],
          status: "present",
          reasonId: fixture.seed.ids.reasonPresent,
          reasonCode: "present",
          reasonName: "Present",
          chargePercent: 100,
          consumePercent: 100,
          note: "Relay ordering present",
        },
        {
          studentId: fixture.context.studentIds[2],
          status: "absent",
          reasonId: fixture.seed.ids.reasonAbsent,
          reasonCode: "absent_unexcused",
          reasonName: "Absent",
          chargePercent: 100,
          consumePercent: 100,
          note: "Relay ordering absent",
        },
      ],
      actorUserId: fixture.context.actorUserId,
      actorRole: fixture.context.actorRole,
      correctionReason: "Reference-before-attendance ordering regression",
      details: {
        topic: "Relay ordering",
        homework: "Verify snapshot",
        note: "Deterministic regression",
      },
      occurredAt: OCCURRED_AT,
    });

    const queued = fixture.sqlite.prepare(`
      SELECT sequence, event_type
      FROM migration_outbox
      WHERE tenant_id = ? AND status = 'pending'
      ORDER BY sequence
    `).all(fixture.context.tenantId);
    const lessonReferenceIndex = queued.findIndex((event) => event.event_type === "reference.lessons.upsert");
    const attendanceIndex = queued.findIndex((event) => event.event_type === "attendance.replaced");
    assert.ok(lessonReferenceIndex >= 0, "lesson reference event is missing");
    assert.ok(attendanceIndex > lessonReferenceIndex, "fixture must reproduce reference-before-attendance ordering");

    const relay = new AttendanceOutboxRelay({
      sqlite: fixture.sqlite,
      postgres: fixture.postgres,
      batchSize: 500,
    });
    const result = await relay.runOnce();
    assert.equal(result.failed || 0, 0);
    assert.equal(result.processed, queued.length);

    const sqliteRows = sqliteAttendance(fixture, lessonId);
    const postgresRows = await postgresAttendance(fixture, lessonId);
    assert.deepEqual(postgresRows, sqliteRows, "equal-version attendance event must refresh the snapshot");

    const postgresLesson = (await fixture.postgres.query(`
      SELECT attendance_version
      FROM lessons WHERE tenant_id = $1 AND id = $2
    `, [fixture.context.tenantId, lessonId])).rows[0];
    assert.equal(Number(postgresLesson.attendance_version), 1);
    assert.equal(fixture.sqlite.prepare(`
      SELECT COUNT(*) AS count FROM migration_outbox
      WHERE tenant_id = ? AND status IN ('pending', 'failed')
    `).get(fixture.context.tenantId).count, 0);

    console.log(JSON.stringify({
      status: "PASS",
      contract: "reference-before-attendance relay ordering",
      queuedEvents: queued.length,
      attendanceRows: sqliteRows.length,
      attendanceVersion: 1,
    }, null, 2));
  } finally {
    if (previousMirror === undefined) delete process.env.DONO_ATTENDANCE_MIRROR_ENABLED;
    else process.env.DONO_ATTENDANCE_MIRROR_ENABLED = previousMirror;
    await fixture.cleanup();
  }
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
