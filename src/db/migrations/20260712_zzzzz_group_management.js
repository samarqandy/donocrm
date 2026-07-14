const { id } = require("../../utils/id");
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

function up(db) {
  const groupColumns = columns(db, "groups");
  addColumn(db, "groups", groupColumns, "description TEXT");
  addColumn(db, "groups", groupColumns, "level TEXT");
  addColumn(db, "groups", groupColumns, "capacity INTEGER NOT NULL DEFAULT 0 CHECK(capacity >= 0)");
  addColumn(db, "groups", groupColumns, "start_date TEXT");
  addColumn(db, "groups", groupColumns, "end_date TEXT");
  addColumn(db, "groups", groupColumns, "status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('draft', 'active', 'completed', 'cancelled', 'archived'))");
  addColumn(db, "groups", groupColumns, "color TEXT");
  addColumn(db, "groups", groupColumns, "note TEXT");
  addColumn(db, "groups", groupColumns, "archived_at TEXT");
  addColumn(db, "groups", groupColumns, "archive_reason TEXT");
  addColumn(db, "groups", groupColumns, "created_at TEXT");
  addColumn(db, "groups", groupColumns, "updated_at TEXT");

  const scheduleColumns = columns(db, "schedules");
  addColumn(db, "schedules", scheduleColumns, "valid_from TEXT");
  addColumn(db, "schedules", scheduleColumns, "valid_until TEXT");
  addColumn(db, "schedules", scheduleColumns, "status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'inactive'))");
  addColumn(db, "schedules", scheduleColumns, "updated_at TEXT");

  db.exec(`
    CREATE TABLE IF NOT EXISTS group_teacher_assignments (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      teacher_id TEXT NOT NULL REFERENCES teachers(id) ON DELETE RESTRICT,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'ended')),
      valid_from TEXT NOT NULL,
      valid_until TEXT,
      created_by TEXT,
      ended_by TEXT,
      created_at TEXT NOT NULL,
      ended_at TEXT
    );
  `);

  const timestamp = now();
  const currentDate = today();

  db.prepare(
    `UPDATE groups
     SET status = CASE
           WHEN active = 0 AND COALESCE(status, 'active') = 'active' THEN 'archived'
           WHEN status IS NULL OR status = '' THEN CASE WHEN active = 1 THEN 'active' ELSE 'archived' END
           ELSE status
         END,
         start_date = COALESCE(
           NULLIF(start_date, ''),
           (SELECT MIN(known_date)
            FROM (
              SELECT MIN(l.date) AS known_date
              FROM lessons l
              WHERE l.tenant_id = groups.tenant_id AND l.group_id = groups.id
              UNION ALL
              SELECT MIN(enrollment.start_date) AS known_date
              FROM student_group_enrollments enrollment
              WHERE enrollment.tenant_id = groups.tenant_id AND enrollment.group_id = groups.id
            )
            WHERE known_date IS NOT NULL AND known_date != ''),
           ?
         ),
         created_at = COALESCE(NULLIF(created_at, ''), ?),
         updated_at = COALESCE(NULLIF(updated_at, ''), ?)
     WHERE 1 = 1`,
  ).run(currentDate, timestamp, timestamp);

  db.prepare(
    `UPDATE groups
     SET active = CASE WHEN status = 'active' THEN 1 ELSE 0 END,
         archived_at = CASE
           WHEN status = 'archived' THEN COALESCE(NULLIF(archived_at, ''), ?)
           ELSE archived_at
         END`,
  ).run(timestamp);

  db.prepare(
    `UPDATE schedules
     SET valid_from = COALESCE(
           NULLIF(valid_from, ''),
           (SELECT NULLIF(g.start_date, '') FROM groups g
            WHERE g.tenant_id = schedules.tenant_id AND g.id = schedules.group_id),
           (SELECT MIN(l.date) FROM lessons l
            WHERE l.tenant_id = schedules.tenant_id AND l.schedule_id = schedules.id),
           ?
         ),
         valid_until = COALESCE(
           NULLIF(valid_until, ''),
           (SELECT NULLIF(g.end_date, '') FROM groups g
            WHERE g.tenant_id = schedules.tenant_id AND g.id = schedules.group_id)
         ),
         status = CASE WHEN status IS NULL OR status = '' THEN 'active' ELSE status END,
         updated_at = COALESCE(NULLIF(updated_at, ''), NULLIF(created_at, ''), ?)
     WHERE 1 = 1`,
  ).run(currentDate, timestamp);

  // Old create-lesson behavior could create the same recurring template more
  // than once. Keep the oldest deterministic rule, retain every lesson, and
  // repoint occurrences before removing only the duplicate templates.
  db.exec(`
    CREATE TEMP TABLE group_schedule_dedup AS
    SELECT id,
           MIN(id) OVER (
             PARTITION BY tenant_id, group_id, weekday, start_time, end_time,
                          valid_from, COALESCE(valid_until, '')
           ) AS keeper_id
    FROM schedules
    WHERE is_recurring = 1 AND status = 'active';

    UPDATE lessons
    SET schedule_id = (
      SELECT keeper_id FROM group_schedule_dedup duplicate
      WHERE duplicate.id = lessons.schedule_id
    )
    WHERE schedule_id IN (
      SELECT id FROM group_schedule_dedup WHERE id != keeper_id
    );

    DELETE FROM schedules
    WHERE id IN (SELECT id FROM group_schedule_dedup WHERE id != keeper_id);

    DROP TABLE group_schedule_dedup;
  `);

  const insertAssignment = db.prepare(
    `INSERT OR IGNORE INTO group_teacher_assignments
     (id, tenant_id, group_id, teacher_id, status, valid_from, valid_until, created_by, created_at)
     VALUES (?, ?, ?, ?, 'active', ?, NULL, 'system', ?)`,
  );
  const groups = db.prepare(
    `SELECT g.id, g.tenant_id, g.teacher_id, COALESCE(NULLIF(g.start_date, ''), ?) AS valid_from
     FROM groups g
     JOIN teachers teacher ON teacher.id = g.teacher_id AND teacher.tenant_id = g.tenant_id
     WHERE NOT EXISTS (
       SELECT 1 FROM group_teacher_assignments assignment
       WHERE assignment.tenant_id = g.tenant_id AND assignment.group_id = g.id AND assignment.status = 'active'
     )
     ORDER BY g.tenant_id, g.id`,
  ).all(currentDate);
  groups.forEach((group) => insertAssignment.run(id(), group.tenant_id, group.id, group.teacher_id, group.valid_from, timestamp));

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_groups_tenant_status
      ON groups(tenant_id, status, name);
    CREATE INDEX IF NOT EXISTS idx_groups_tenant_teacher_status
      ON groups(tenant_id, teacher_id, status);
    CREATE INDEX IF NOT EXISTS idx_schedules_tenant_group_status
      ON schedules(tenant_id, group_id, status, weekday, start_time);
    CREATE INDEX IF NOT EXISTS idx_schedules_tenant_teacher_time
      ON schedules(tenant_id, teacher_id, status, weekday, start_time, end_time);
    CREATE INDEX IF NOT EXISTS idx_schedules_tenant_room_time
      ON schedules(tenant_id, room_id, status, weekday, start_time, end_time);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_schedules_active_rule_exact
      ON schedules(
        tenant_id, group_id, weekday, start_time, end_time,
        valid_from, COALESCE(valid_until, '')
      )
      WHERE status = 'active' AND is_recurring = 1;
    CREATE INDEX IF NOT EXISTS idx_group_teacher_assignments_group_history
      ON group_teacher_assignments(tenant_id, group_id, valid_from, valid_until);
    CREATE INDEX IF NOT EXISTS idx_group_teacher_assignments_teacher_history
      ON group_teacher_assignments(tenant_id, teacher_id, status, valid_from, valid_until);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_group_teacher_assignments_one_active
      ON group_teacher_assignments(tenant_id, group_id) WHERE status = 'active';
    CREATE INDEX IF NOT EXISTS idx_student_enrollments_group_current
      ON student_group_enrollments(tenant_id, group_id, status, start_date, end_date);
    CREATE INDEX IF NOT EXISTS idx_lessons_group_date_status
      ON lessons(tenant_id, group_id, date, status);

    CREATE TRIGGER IF NOT EXISTS trg_groups_status_sync
    AFTER UPDATE OF status ON groups
    WHEN NEW.active != CASE WHEN NEW.status = 'active' THEN 1 ELSE 0 END
    BEGIN
      UPDATE groups
      SET active = CASE WHEN NEW.status = 'active' THEN 1 ELSE 0 END
      WHERE tenant_id = NEW.tenant_id AND id = NEW.id;
    END;

    CREATE TRIGGER IF NOT EXISTS trg_groups_active_sync
    AFTER UPDATE OF active ON groups
    WHEN (NEW.active = 1 AND NEW.status != 'active')
      OR (NEW.active = 0 AND NEW.status = 'active')
    BEGIN
      UPDATE groups
      SET status = CASE WHEN NEW.active = 1 THEN 'active' ELSE 'archived' END,
          archived_at = CASE
            WHEN NEW.active = 0 THEN COALESCE(archived_at, CURRENT_TIMESTAMP)
            ELSE NULL
          END
      WHERE tenant_id = NEW.tenant_id AND id = NEW.id;
    END;
  `);
}

module.exports = {
  id: "20260712_zzzzz_group_management",
  name: "Professional group lifecycle, schedules and teacher assignment history",
  up,
};
