#!/usr/bin/env node

const assert = require("node:assert/strict");
const { PostgresAttendanceRepository } = require("../../src/modules/attendance/infrastructure/PostgresAttendanceRepository");
const { createRepositoryContractFixture } = require("./repository-contract-fixture");

const CAPTURED_BEFORE = Object.freeze({
  timezone: "Asia/Tashkent",
  sqlite: { date: "2026-02-10", version: 7 },
  postgres: { date: "2026-02-09", version: "missing" },
  status: "DIFF",
});

const EXTRA_LESSONS = Object.freeze([
  Object.freeze({
    id: "contract-lesson-schedule-teacher",
    teacherId: null,
    scheduleId: 41001,
    date: "2026-01-01",
    status: "waiting",
    topic: "Schedule fallback",
    homework: null,
    note: null,
    attendanceVersion: 2,
    version: 4,
    expectedTeacherId: "contract-teacher-schedule",
    expectedStatus: "planned",
  }),
  Object.freeze({
    id: "contract-lesson-group-teacher",
    teacherId: null,
    scheduleId: null,
    date: "2026-03-10",
    status: "planned",
    topic: null,
    homework: null,
    note: null,
    attendanceVersion: 0,
    version: 2,
    expectedTeacherId: "contract-teacher-primary",
    expectedStatus: "planned",
  }),
  Object.freeze({
    id: "contract-lesson-cancelled",
    teacherId: "contract-teacher-primary",
    scheduleId: 41001,
    date: "2026-12-31",
    status: "cancelled",
    topic: null,
    homework: null,
    note: null,
    attendanceVersion: 1,
    version: 3,
    expectedTeacherId: "contract-teacher-primary",
    expectedStatus: "cancelled",
  }),
  Object.freeze({
    id: "contract-lesson-legacy",
    teacherId: "contract-teacher-primary",
    scheduleId: null,
    date: "2026-02-10",
    status: "completed",
    financialStatus: "legacy",
    topic: "Migrated completed lesson",
    homework: null,
    note: null,
    attendanceVersion: 0,
    version: 1,
    expectedTeacherId: "contract-teacher-primary",
    expectedStatus: "completed",
  }),
]);

function insertSQLiteLesson(fixture, lesson) {
  fixture.sqlite.prepare(`
    INSERT INTO lessons (
      id, tenant_id, branch_id, group_id, teacher_id, schedule_id,
      date, time, start_time, end_time, status, lesson_type, is_trial,
      topic, homework, note, created_at, updated_at,
      attendance_version, version, financial_status, financial_version
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'group', 0, ?, ?, ?, ?, ?, ?, ?, ?, 0)
  `).run(
    lesson.id,
    fixture.context.tenantId,
    fixture.context.branchId,
    fixture.context.groupId,
    lesson.teacherId,
    lesson.scheduleId,
    lesson.date,
    "09:00 - 10:00",
    "09:00",
    "10:00",
    lesson.status,
    lesson.topic,
    lesson.homework,
    lesson.note,
    "2026-01-05T04:00:00.000Z",
    "2026-02-10T05:30:00.000Z",
    lesson.attendanceVersion,
    lesson.version,
    lesson.financialStatus || "unposted",
  );
}

async function insertPostgresLesson(fixture, lesson) {
  await fixture.postgres.query(`
    INSERT INTO lessons (
      id, tenant_id, branch_id, group_id, teacher_id, schedule_id,
      date, time, start_time, end_time, status, lesson_type, is_trial,
      topic, homework, note, created_at, updated_at,
      attendance_version, version, financial_status, financial_version
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'group', false,
      $12, $13, $14, $15, $16, $17, $18, $19, 0)
  `, [
    lesson.id,
    fixture.context.tenantId,
    fixture.context.branchId,
    fixture.context.groupId,
    lesson.teacherId,
    lesson.scheduleId,
    lesson.date,
    "09:00 - 10:00",
    "09:00",
    "10:00",
    lesson.status,
    lesson.topic,
    lesson.homework,
    lesson.note,
    "2026-01-05T04:00:00.000Z",
    "2026-02-10T05:30:00.000Z",
    lesson.attendanceVersion,
    lesson.version,
    lesson.financialStatus || "unposted",
  ]);
}

async function compare(fixture, lessonId, assertions = {}) {
  const sqlite = await fixture.adapters.sqlite.command.findLesson(fixture.context.tenantId, lessonId);
  const postgres = await fixture.adapters.postgres.command.findLesson(fixture.context.tenantId, lessonId);
  assert.deepEqual(postgres, sqlite, `${lessonId}: PostgreSQL lesson DTO differs from SQLite`);
  assert.deepEqual(Object.keys(postgres), [
    "id", "tenantId", "branchId", "groupId", "teacherId", "date", "status",
    "attendanceVersion", "financialStatus", "topic", "homework", "note", "version",
  ]);
  assert.match(postgres.date, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(typeof postgres.version, "number");
  if (assertions.teacherId) assert.equal(postgres.teacherId, assertions.teacherId);
  if (assertions.status) assert.equal(postgres.status, assertions.status);
  if (assertions.emptyText) {
    assert.equal(postgres.topic, "");
    assert.equal(postgres.homework, "");
    assert.equal(postgres.note, "");
  }
  return { lessonId, status: "PASS", date: postgres.date, teacherId: postgres.teacherId, version: postgres.version };
}

async function run() {
  const fixture = await createRepositoryContractFixture();
  let cleanup;
  try {
    for (const lesson of EXTRA_LESSONS) {
      insertSQLiteLesson(fixture, lesson);
      await insertPostgresLesson(fixture, lesson);
    }

    const sqliteCountBefore = fixture.sqlite.prepare(
      "SELECT COUNT(*) AS count FROM lessons WHERE tenant_id = ?",
    ).get(fixture.context.tenantId).count;
    const postgresCountBefore = Number((await fixture.postgres.query(
      "SELECT COUNT(*) AS count FROM lessons WHERE tenant_id = $1",
      [fixture.context.tenantId],
    )).rows[0].count);
    assert.equal(postgresCountBefore, sqliteCountBefore);

    const cases = [
      await compare(fixture, fixture.context.lessonId, {
        teacherId: "contract-teacher-primary",
        status: "completed",
      }),
      ...await Promise.all(EXTRA_LESSONS.map((lesson) => compare(fixture, lesson.id, {
        teacherId: lesson.expectedTeacherId,
        status: lesson.expectedStatus,
        emptyText: lesson.topic === null,
      }))),
    ];

    const missingSQLite = await fixture.adapters.sqlite.command.findLesson(
      fixture.context.tenantId,
      "contract-lesson-missing",
    );
    const missingPostgres = await fixture.adapters.postgres.command.findLesson(
      fixture.context.tenantId,
      "contract-lesson-missing",
    );
    assert.equal(missingSQLite, null);
    assert.equal(missingPostgres, null);
    cases.push({ lessonId: "contract-lesson-missing", status: "PASS", result: null });

    const crossTenantSQLite = await fixture.adapters.sqlite.command.findLesson(
      "contract-tenant-other",
      fixture.context.lessonId,
    );
    const crossTenantPostgres = await fixture.adapters.postgres.command.findLesson(
      "contract-tenant-other",
      fixture.context.lessonId,
    );
    assert.equal(crossTenantSQLite, null);
    assert.equal(crossTenantPostgres, null);
    cases.push({ lessonId: "wrong-tenant", status: "PASS", result: null });

    const unconfigured = new PostgresAttendanceRepository(fixture.postgres);
    await assert.rejects(
      unconfigured.findLesson(fixture.context.tenantId, "contract-lesson-group-teacher"),
      /Attendance lesson reference reader is not configured/,
    );

    const sqliteCountAfter = fixture.sqlite.prepare(
      "SELECT COUNT(*) AS count FROM lessons WHERE tenant_id = ?",
    ).get(fixture.context.tenantId).count;
    const postgresCountAfter = Number((await fixture.postgres.query(
      "SELECT COUNT(*) AS count FROM lessons WHERE tenant_id = $1",
      [fixture.context.tenantId],
    )).rows[0].count);
    assert.equal(sqliteCountAfter, sqliteCountBefore, "SQLite findLesson mutated fixture state");
    assert.equal(postgresCountAfter, postgresCountBefore, "PostgreSQL findLesson mutated fixture state");

    cleanup = await fixture.cleanup();
    assert.equal(cleanup.schemaDropped, true);

    console.log(JSON.stringify({
      ok: true,
      method: "findLesson",
      timezone: process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone,
      before: CAPTURED_BEFORE,
      after: {
        summary: { pass: cases.length, fail: 0, diff: 0 },
        cases,
      },
      regression: {
        allStatuses: true,
        directScheduleGroupTeacherPrecedence: true,
        missingAndTenantIsolation: true,
        nullTextDefaults: true,
        numericVersion: true,
        missingReferenceReaderFailsClosed: true,
      },
      rollback: {
        readOnly: true,
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
