const assert = require("node:assert/strict");
const { getDb } = require("../src/db/client");
const { getPostgresPool } = require("../src/infrastructure/database/postgres/pool");
const { SQLiteAttendanceQueryRepository } = require("../src/modules/attendance/infrastructure/SQLiteAttendanceQueryRepository");
const { PostgresAttendanceQueryRepository } = require("../src/modules/attendance/infrastructure/PostgresAttendanceQueryRepository");

let activePool;

function comparableRecords(records) {
  return records.map(({ id: _id, ...record }) => record)
    .sort((left, right) => `${left.lessonId}\0${left.studentId}`.localeCompare(`${right.lessonId}\0${right.studentId}`));
}

function comparableProfile(profile) {
  return { ...profile, records: comparableRecords(profile.records) };
}

async function run() {
  const tenantFlag = process.argv.indexOf("--tenant");
  const tenantId = String((tenantFlag >= 0 ? process.argv[tenantFlag + 1] : "") || process.env.DONO_TENANT_ID || "").trim();
  if (!tenantId) throw new Error("--tenant is required");
  const postgres = getPostgresPool();
  if (!postgres) throw new Error("DATABASE_URL is required");
  activePool = postgres;
  const sqlite = new SQLiteAttendanceQueryRepository(getDb());
  const pg = new PostgresAttendanceQueryRepository(postgres);
  const db = getDb();
  const studentIds = db.prepare("SELECT id FROM students WHERE tenant_id = ? ORDER BY id").all(tenantId).map((row) => row.id);
  const groupIds = db.prepare("SELECT id FROM groups WHERE tenant_id = ? ORDER BY id").all(tenantId).map((row) => row.id);
  const teacherIds = db.prepare("SELECT id FROM teachers WHERE tenant_id = ? ORDER BY id").all(tenantId).map((row) => row.id);

  assert.deepEqual(await pg.counts(tenantId), sqlite.counts(tenantId));
  assert.deepEqual(await pg.studentStats(tenantId, studentIds), sqlite.studentStats(tenantId, studentIds));
  assert.deepEqual(await pg.groupStats(tenantId, groupIds), sqlite.groupStats(tenantId, groupIds));
  assert.deepEqual(comparableRecords(await pg.list(tenantId)), comparableRecords(sqlite.list(tenantId)));
  for (const teacherId of teacherIds) {
    assert.deepEqual(
      comparableRecords(await pg.listForTeacher(tenantId, teacherId)),
      comparableRecords(sqlite.listForTeacher(tenantId, teacherId)),
      `teacher attendance projection mismatch: ${teacherId}`,
    );
  }

  for (const studentId of studentIds) {
    assert.deepEqual(
      comparableProfile(await pg.studentProfile(tenantId, studentId)),
      comparableProfile(sqlite.studentProfile(tenantId, studentId)),
      `student profile projection mismatch: ${studentId}`,
    );
  }
  for (const groupId of groupIds) {
    const postgresProfile = await pg.groupProfile(tenantId, groupId);
    const sqliteProfile = sqlite.groupProfile(tenantId, groupId);
    assert.deepEqual(
      { ...comparableProfile(postgresProfile), memberStats: postgresProfile.memberStats },
      { ...comparableProfile(sqliteProfile), memberStats: sqliteProfile.memberStats },
      `group profile projection mismatch: ${groupId}`,
    );
  }
  console.log(JSON.stringify({
    ok: true,
    tenantId,
    records: (await pg.list(tenantId)).length,
    students: studentIds.length,
    groups: groupIds.length,
    teachers: teacherIds.length,
  }, null, 2));
}

run()
  .catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (activePool) await activePool.end();
  });
