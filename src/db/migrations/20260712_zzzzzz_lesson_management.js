const { id } = require("../../utils/id");
const { isoWeekday, parseLessonTime } = require("../../utils/schedule");
const { now, today } = require("../../utils/time");

function columns(db, table) {
  return db.prepare(`PRAGMA table_info(${table})`).all().map((column) => column.name);
}

function addColumn(db, table, existing, definition) {
  const name = definition.trim().split(/\s+/)[0];
  if (existing.includes(name)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
  existing.push(name);
}

function legacyScheduleForLesson(db, lesson, parsedTime) {
  if (lesson.schedule_id) return lesson.schedule_id;
  const weekday = isoWeekday(lesson.date);
  if (!weekday || !parsedTime) return null;
  const existing = db
    .prepare(
      `SELECT id
       FROM schedules
       WHERE tenant_id = ? AND group_id = ? AND weekday = ?
         AND start_time = ? AND end_time = ? AND is_recurring = 1
         AND COALESCE(status, 'active') = 'active'
       ORDER BY id
       LIMIT 1`,
    )
    .get(lesson.tenant_id, lesson.group_id, String(weekday), parsedTime.startTime, parsedTime.endTime);
  if (existing) return existing.id;

  const result = db
    .prepare(
      `INSERT INTO schedules
       (tenant_id, branch_id, group_id, teacher_id, room_id, weekday, start_time, end_time,
        is_recurring, lesson_type, lesson_link, created_at, valid_from, valid_until, status, updated_at)
       VALUES (?, ?, ?, ?, NULL, ?, ?, ?, 1, ?, '', ?, ?, ?, 'active', ?)`,
    )
    .run(
      lesson.tenant_id,
      lesson.branch_id || lesson.group_branch_id || null,
      lesson.group_id,
      lesson.teacher_id || lesson.group_teacher_id || null,
      String(weekday),
      parsedTime.startTime,
      parsedTime.endTime,
      lesson.lesson_type || "group",
      now(),
      lesson.group_start_date || lesson.date,
      lesson.group_end_date || null,
      now(),
    );
  return result.lastInsertRowid;
}

function up(db) {
  const lessonColumns = columns(db, "lessons");
  addColumn(db, "lessons", lessonColumns, "room_id TEXT REFERENCES rooms(id) ON DELETE SET NULL");
  addColumn(db, "lessons", lessonColumns, "room_name TEXT");
  addColumn(db, "lessons", lessonColumns, "start_time TEXT");
  addColumn(db, "lessons", lessonColumns, "end_time TEXT");
  addColumn(db, "lessons", lessonColumns, "occurrence_date TEXT");
  addColumn(db, "lessons", lessonColumns, "topic TEXT");
  addColumn(db, "lessons", lessonColumns, "homework TEXT");
  addColumn(db, "lessons", lessonColumns, "note TEXT");
  addColumn(db, "lessons", lessonColumns, "created_by TEXT");
  addColumn(db, "lessons", lessonColumns, "created_at TEXT");
  addColumn(db, "lessons", lessonColumns, "updated_by TEXT");
  addColumn(db, "lessons", lessonColumns, "updated_at TEXT");
  addColumn(db, "lessons", lessonColumns, "completed_by TEXT");
  addColumn(db, "lessons", lessonColumns, "completed_at TEXT");
  addColumn(db, "lessons", lessonColumns, "cancelled_by TEXT");
  addColumn(db, "lessons", lessonColumns, "cancelled_at TEXT");
  addColumn(db, "lessons", lessonColumns, "cancelled_from_status TEXT");
  addColumn(db, "lessons", lessonColumns, "reschedule_reason TEXT");
  addColumn(db, "lessons", lessonColumns, "attendance_version INTEGER NOT NULL DEFAULT 0");
  addColumn(db, "lessons", lessonColumns, "version INTEGER NOT NULL DEFAULT 1");

  const messageColumns = columns(db, "messages");
  addColumn(db, "messages", messageColumns, "dedupe_key TEXT");

  db.exec(`
    CREATE TABLE IF NOT EXISTS lesson_events (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
      actor_user_id TEXT,
      actor_role TEXT,
      action TEXT NOT NULL,
      reason TEXT,
      before_json TEXT,
      after_json TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS lesson_attendance_revisions (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
      revision_no INTEGER NOT NULL,
      actor_user_id TEXT,
      actor_role TEXT,
      reason TEXT,
      snapshot_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(tenant_id, lesson_id, revision_no)
    );
  `);

  const timestamp = now();
  const lessons = db
    .prepare(
      `SELECT lesson.*, group_row.teacher_id AS group_teacher_id,
              group_row.branch_id AS group_branch_id, group_row.room AS group_room,
              group_row.start_date AS group_start_date, group_row.end_date AS group_end_date
       FROM lessons lesson
       JOIN groups group_row
         ON group_row.id = lesson.group_id AND group_row.tenant_id = lesson.tenant_id
       ORDER BY lesson.tenant_id, lesson.date, lesson.time, lesson.id`,
    )
    .all();
  const updateLesson = db.prepare(
    `UPDATE lessons
     SET schedule_id = ?, teacher_id = ?, room_id = ?, room_name = ?,
         start_time = ?, end_time = ?, occurrence_date = ?,
         created_by = COALESCE(NULLIF(created_by, ''), 'system'),
         created_at = COALESCE(NULLIF(created_at, ''), ?),
         updated_at = COALESCE(NULLIF(updated_at, ''), ?),
         completed_at = CASE WHEN status = 'completed' THEN COALESCE(NULLIF(completed_at, ''), ?) ELSE completed_at END,
         cancelled_at = CASE WHEN status = 'cancelled' THEN COALESCE(NULLIF(cancelled_at, ''), ?) ELSE cancelled_at END,
         cancelled_from_status = CASE WHEN status = 'cancelled' THEN COALESCE(NULLIF(cancelled_from_status, ''), 'planned') ELSE cancelled_from_status END,
         version = CASE WHEN version IS NULL OR version < 1 THEN 1 ELSE version END,
         attendance_version = COALESCE(attendance_version, 0)
     WHERE tenant_id = ? AND id = ?`,
  );

  lessons.forEach((lesson) => {
    const parsedTime = parseLessonTime(lesson.time);
    const scheduleId = legacyScheduleForLesson(db, lesson, parsedTime);
    const schedule = scheduleId
      ? db
          .prepare(
            `SELECT schedule.teacher_id, schedule.room_id, room.name AS room_name
             FROM schedules schedule
             LEFT JOIN rooms room ON room.id = schedule.room_id AND room.tenant_id = schedule.tenant_id
             WHERE schedule.tenant_id = ? AND schedule.id = ?`,
          )
          .get(lesson.tenant_id, scheduleId)
      : null;
    updateLesson.run(
      scheduleId,
      lesson.teacher_id || schedule?.teacher_id || lesson.group_teacher_id || null,
      lesson.room_id || schedule?.room_id || null,
      lesson.room_name || schedule?.room_name || lesson.group_room || "",
      lesson.start_time || parsedTime?.startTime || "",
      lesson.end_time || parsedTime?.endTime || "",
      scheduleId ? lesson.occurrence_date || lesson.date : lesson.occurrence_date || null,
      timestamp,
      timestamp,
      timestamp,
      timestamp,
      lesson.tenant_id,
      lesson.id,
    );
  });

  // The legacy application had no attendance draft state. Rows attached to an
  // old planned lesson therefore represent a completed lesson, even when a
  // demo/import path forgot to update the status.
  db.prepare(
    `UPDATE lessons
     SET status = 'completed', completed_by = COALESCE(NULLIF(completed_by, ''), 'system'),
         completed_at = COALESCE(NULLIF(completed_at, ''), ?), updated_at = ?
     WHERE status IN ('waiting', 'planned') AND date <= ?
       AND EXISTS (
         SELECT 1 FROM attendance record
         WHERE record.tenant_id = lessons.tenant_id AND record.lesson_id = lessons.id
       )`,
  ).run(timestamp, timestamp, today());

  const revisionExists = db.prepare(
    "SELECT 1 FROM lesson_attendance_revisions WHERE tenant_id = ? AND lesson_id = ? LIMIT 1",
  );
  const attendanceRows = db.prepare(
    `SELECT student_id AS studentId, status, COALESCE(note, '') AS note
     FROM attendance
     WHERE tenant_id = ? AND lesson_id = ?
     ORDER BY student_id`,
  );
  const insertRevision = db.prepare(
    `INSERT INTO lesson_attendance_revisions
     (id, tenant_id, lesson_id, revision_no, actor_user_id, actor_role, reason, snapshot_json, created_at)
     VALUES (?, ?, ?, 1, 'system', 'system', 'Legacy attendance snapshot', ?, ?)`,
  );
  lessons.forEach((lesson) => {
    if (revisionExists.get(lesson.tenant_id, lesson.id)) return;
    const snapshot = attendanceRows.all(lesson.tenant_id, lesson.id);
    if (!snapshot.length) return;
    insertRevision.run(id(), lesson.tenant_id, lesson.id, JSON.stringify(snapshot), timestamp);
    db.prepare(
      `UPDATE lessons
       SET attendance_version = CASE WHEN attendance_version < 1 THEN 1 ELSE attendance_version END
       WHERE tenant_id = ? AND id = ?`,
    ).run(lesson.tenant_id, lesson.id);
  });

  const duplicateOccurrence = db
    .prepare(
      `SELECT tenant_id, schedule_id, occurrence_date, COUNT(*) AS count
       FROM lessons
       WHERE schedule_id IS NOT NULL AND occurrence_date IS NOT NULL
       GROUP BY tenant_id, schedule_id, occurrence_date
       HAVING COUNT(*) > 1
       LIMIT 1`,
    )
    .get();
  if (duplicateOccurrence) {
    // Preserve every legacy lesson instead of failing the full upgrade. The
    // application conflict validator prevents new duplicates; operators can
    // review the reported legacy anomaly before a later cleanup adds UNIQUE.
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_lessons_schedule_occurrence_lookup
        ON lessons(tenant_id, schedule_id, occurrence_date)
        WHERE schedule_id IS NOT NULL AND occurrence_date IS NOT NULL;
    `);
  } else {
    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_lessons_schedule_occurrence
        ON lessons(tenant_id, schedule_id, occurrence_date)
        WHERE schedule_id IS NOT NULL AND occurrence_date IS NOT NULL;
    `);
  }

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_lessons_conflict_window
      ON lessons(tenant_id, date, status, start_time, end_time);
    CREATE INDEX IF NOT EXISTS idx_lessons_teacher_window
      ON lessons(tenant_id, teacher_id, date, status, start_time, end_time);
    CREATE INDEX IF NOT EXISTS idx_lessons_room_window
      ON lessons(tenant_id, room_id, date, status, start_time, end_time);
    CREATE INDEX IF NOT EXISTS idx_lesson_events_history
      ON lesson_events(tenant_id, lesson_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_lesson_attendance_revisions_history
      ON lesson_attendance_revisions(tenant_id, lesson_id, revision_no);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_tenant_dedupe
      ON messages(tenant_id, dedupe_key)
      WHERE dedupe_key IS NOT NULL AND dedupe_key != '';
  `);
}

module.exports = {
  id: "20260712_zzzzzz_lesson_management",
  name: "Lesson occurrence lifecycle, attendance revisions and notification idempotency",
  up,
};
