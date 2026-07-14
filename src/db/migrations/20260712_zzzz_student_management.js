const { id } = require("../../utils/id");
const { normalizePhone } = require("../../utils/phone");
const { now, today } = require("../../utils/time");

function columns(db, table) {
  return db.prepare(`PRAGMA table_info(${table})`).all().map((column) => column.name);
}

function addColumn(db, table, existing, definition) {
  const name = definition.trim().split(/\s+/)[0];
  if (!existing.includes(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
}

function up(db) {
  const studentColumns = columns(db, "students");
  addColumn(db, "students", studentColumns, "student_phone TEXT");
  addColumn(db, "students", studentColumns, "email TEXT");
  addColumn(db, "students", studentColumns, "birth_date TEXT");
  addColumn(db, "students", studentColumns, "gender TEXT");
  addColumn(db, "students", studentColumns, "address TEXT");
  addColumn(db, "students", studentColumns, "source TEXT");
  addColumn(db, "students", studentColumns, "enrollment_date TEXT");
  addColumn(db, "students", studentColumns, "note TEXT");
  addColumn(db, "students", studentColumns, "archived_at TEXT");
  addColumn(db, "students", studentColumns, "archive_reason TEXT");
  addColumn(db, "students", studentColumns, "created_at TEXT");
  addColumn(db, "students", studentColumns, "updated_at TEXT");

  db.exec(`
    CREATE TABLE IF NOT EXISTS guardians (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      phone TEXT,
      phone_normalized TEXT,
      email TEXT,
      telegram_chat_id TEXT,
      preferred_language TEXT NOT NULL DEFAULT 'uz',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS student_guardians (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      guardian_id TEXT NOT NULL REFERENCES guardians(id) ON DELETE CASCADE,
      relationship TEXT NOT NULL DEFAULT 'guardian',
      is_primary INTEGER NOT NULL DEFAULT 0,
      is_emergency INTEGER NOT NULL DEFAULT 0,
      receives_notifications INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      UNIQUE(tenant_id, student_id, guardian_id)
    );

    CREATE TABLE IF NOT EXISTS student_group_enrollments (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE RESTRICT,
      status TEXT NOT NULL CHECK(status IN ('active', 'completed', 'transferred', 'withdrawn')),
      start_date TEXT NOT NULL,
      end_date TEXT,
      reason TEXT,
      created_by TEXT,
      ended_by TEXT,
      ended_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_guardians_tenant_phone ON guardians(tenant_id, phone_normalized, status);
    CREATE INDEX IF NOT EXISTS idx_student_guardians_student ON student_guardians(tenant_id, student_id, is_primary);
    CREATE INDEX IF NOT EXISTS idx_student_guardians_guardian ON student_guardians(tenant_id, guardian_id);
    CREATE INDEX IF NOT EXISTS idx_student_enrollments_history ON student_group_enrollments(tenant_id, student_id, start_date, end_date);
    CREATE INDEX IF NOT EXISTS idx_student_enrollments_group_history ON student_group_enrollments(tenant_id, group_id, start_date, end_date);
    CREATE INDEX IF NOT EXISTS idx_attendance_student_status ON attendance(tenant_id, student_id, status);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_student_enrollments_one_active
      ON student_group_enrollments(tenant_id, student_id) WHERE status = 'active';
  `);

  const timestamp = now();
  const date = today();
  db.prepare(
    `UPDATE students SET
      enrollment_date = COALESCE(NULLIF(enrollment_date, ''), ?),
      created_at = COALESCE(created_at, ?),
      updated_at = COALESCE(updated_at, ?),
      archived_at = CASE WHEN status = 'left' THEN COALESCE(archived_at, ?) ELSE archived_at END`,
  ).run(date, timestamp, timestamp, timestamp);

  const students = db.prepare("SELECT * FROM students ORDER BY tenant_id, name").all();
  const findGuardian = db.prepare(
    "SELECT id FROM guardians WHERE tenant_id = ? AND phone_normalized = ? AND lower(name) = lower(?) LIMIT 1",
  );
  const insertGuardian = db.prepare(
    `INSERT INTO guardians (id, tenant_id, name, phone, phone_normalized, email, telegram_chat_id, preferred_language, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, '', ?, 'uz', 'active', ?, ?)`,
  );
  const insertLink = db.prepare(
    `INSERT OR IGNORE INTO student_guardians
     (id, tenant_id, student_id, guardian_id, relationship, is_primary, is_emergency, receives_notifications, created_at)
     VALUES (?, ?, ?, ?, 'guardian', 1, 1, 1, ?)`,
  );
  const insertEnrollment = db.prepare(
    `INSERT OR IGNORE INTO student_group_enrollments
     (id, tenant_id, student_id, group_id, status, start_date, end_date, reason, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'Legacy data migration', 'system', ?)`,
  );
  const earliestKnownLesson = db.prepare(
    `SELECT MIN(lesson_date) AS lesson_date
     FROM (
       SELECT l.date AS lesson_date
       FROM lessons l
       WHERE l.tenant_id = ? AND l.group_id = ?
       UNION ALL
       SELECT l.date AS lesson_date
       FROM attendance a
       JOIN lessons l ON l.id = a.lesson_id AND l.tenant_id = a.tenant_id
       WHERE a.tenant_id = ? AND a.student_id = ?
     )`,
  );
  const updateEnrollmentDate = db.prepare("UPDATE students SET enrollment_date = ? WHERE tenant_id = ? AND id = ?");

  for (const student of students) {
    const normalized = normalizePhone(student.phone);
    let guardian = normalized ? findGuardian.get(student.tenant_id, normalized, student.parent_name || "Guardian") : null;
    if (!guardian) {
      guardian = { id: id() };
      insertGuardian.run(guardian.id, student.tenant_id, student.parent_name || "Guardian", student.phone || "", normalized, student.telegram_chat_id || "", timestamp, timestamp);
    }
    insertLink.run(id(), student.tenant_id, student.id, guardian.id, timestamp);
    const knownLessonDate = earliestKnownLesson.get(student.tenant_id, student.group_id, student.tenant_id, student.id)?.lesson_date || "";
    const enrollmentDate = knownLessonDate && knownLessonDate < (student.enrollment_date || date) ? knownLessonDate : student.enrollment_date || date;
    updateEnrollmentDate.run(enrollmentDate, student.tenant_id, student.id);
    insertEnrollment.run(
      id(),
      student.tenant_id,
      student.id,
      student.group_id,
      student.status === "left" ? "withdrawn" : "active",
      enrollmentDate,
      student.status === "left" ? date : null,
      timestamp,
    );
  }
}

module.exports = {
  id: "20260712_zzzz_student_management",
  name: "Student guardians, enrollment history and lifecycle profile",
  up,
};
