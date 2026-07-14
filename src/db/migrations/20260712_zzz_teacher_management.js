const { now } = require("../../utils/time");

function columns(db, table) {
  return db.prepare(`PRAGMA table_info(${table})`).all().map((column) => column.name);
}

function addColumn(db, table, existing, definition) {
  const name = definition.trim().split(/\s+/)[0];
  if (!existing.includes(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
}

function up(db) {
  const teacherColumns = columns(db, "teachers");
  addColumn(db, "teachers", teacherColumns, "email TEXT");
  addColumn(db, "teachers", teacherColumns, "specialization TEXT");
  addColumn(db, "teachers", teacherColumns, "employment_type TEXT NOT NULL DEFAULT 'full_time'");
  addColumn(db, "teachers", teacherColumns, "status TEXT NOT NULL DEFAULT 'active'");
  addColumn(db, "teachers", teacherColumns, "hired_at TEXT");
  addColumn(db, "teachers", teacherColumns, "max_weekly_minutes INTEGER NOT NULL DEFAULT 2400");
  addColumn(db, "teachers", teacherColumns, "note TEXT");
  addColumn(db, "teachers", teacherColumns, "created_at TEXT");
  db.prepare("UPDATE teachers SET created_at = COALESCE(created_at, ?), status = COALESCE(NULLIF(status, ''), 'active')").run(now());

  const userColumns = columns(db, "users");
  addColumn(db, "users", userColumns, "status TEXT NOT NULL DEFAULT 'active'");

  const lessonColumns = columns(db, "lessons");
  addColumn(db, "lessons", lessonColumns, "teacher_id TEXT");
  db.exec(`
    UPDATE lessons
    SET teacher_id = COALESCE(
      (SELECT sc.teacher_id FROM schedules sc WHERE sc.id = lessons.schedule_id AND sc.tenant_id = lessons.tenant_id),
      (SELECT g.teacher_id FROM groups g WHERE g.id = lessons.group_id AND g.tenant_id = lessons.tenant_id)
    )
    WHERE teacher_id IS NULL OR teacher_id = '';
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_teachers_tenant_status ON teachers(tenant_id, status, name);
    CREATE INDEX IF NOT EXISTS idx_users_tenant_role_status ON users(tenant_id, role, status);
    CREATE INDEX IF NOT EXISTS idx_lessons_tenant_teacher_date ON lessons(tenant_id, teacher_id, date);
  `);
}

module.exports = {
  id: "20260712_zzz_teacher_management",
  name: "Teacher lifecycle, workload and portal access",
  up,
};
