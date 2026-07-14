const { now } = require("../../utils/time");
const { parseLessonTime } = require("../../utils/schedule");

const OVERRIDE_DATE = 1;
const OVERRIDE_TIME = 2;
const OVERRIDE_TEACHER = 4;
const OVERRIDE_ROOM = 8;

function columns(db, table) {
  return db.prepare(`PRAGMA table_info(${table})`).all().map((column) => column.name);
}

function addColumn(db, table, existing, definition) {
  const name = definition.trim().split(/\s+/)[0];
  if (existing.includes(name)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
  existing.push(name);
}

function stableSeriesId(tenantId, scheduleId) {
  return `schedule-series:${tenantId}:${scheduleId}`;
}

function isoWeekKey(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (
    Number.isNaN(date.getTime())
    || date.getUTCFullYear() !== Number(match[1])
    || date.getUTCMonth() !== Number(match[2]) - 1
    || date.getUTCDate() !== Number(match[3])
  ) {
    return "";
  }
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - weekday);
  const isoYear = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

function inferredOverrideMask(lesson) {
  let mask = Number(lesson.override_mask || 0);
  const originalDate = lesson.occurrence_date || lesson.date;
  if (originalDate && lesson.date !== originalDate) mask |= OVERRIDE_DATE;

  const parsed = parseLessonTime(lesson.time);
  const lessonStart = lesson.start_time || parsed?.startTime || "";
  const lessonEnd = lesson.end_time || parsed?.endTime || "";
  if (lessonStart !== lesson.schedule_start_time || lessonEnd !== lesson.schedule_end_time) {
    mask |= OVERRIDE_TIME;
  }
  if (String(lesson.teacher_id || "") !== String(lesson.schedule_teacher_id || "")) {
    mask |= OVERRIDE_TEACHER;
  }
  if (String(lesson.room_id || "") !== String(lesson.schedule_room_id || "")) {
    mask |= OVERRIDE_ROOM;
  }
  return mask;
}

function assertNoLineageAnomalies(db) {
  const activeSeries = db
    .prepare(
      `SELECT tenant_id, series_id, COUNT(*) AS count
       FROM schedules
       WHERE status = 'active' AND series_id IS NOT NULL AND series_id != ''
       GROUP BY tenant_id, series_id
       HAVING COUNT(*) > 1
       LIMIT 1`,
    )
    .get();
  if (activeSeries) {
    throw new Error(
      `Schedule lineage anomaly: tenant ${activeSeries.tenant_id} series ${activeSeries.series_id} has ${activeSeries.count} active rules`,
    );
  }

  const seriesVersion = db
    .prepare(
      `SELECT tenant_id, series_id, version, COUNT(*) AS count
       FROM schedules
       WHERE series_id IS NOT NULL AND series_id != ''
       GROUP BY tenant_id, series_id, version
       HAVING COUNT(*) > 1
       LIMIT 1`,
    )
    .get();
  if (seriesVersion) {
    throw new Error(
      `Schedule lineage anomaly: tenant ${seriesVersion.tenant_id} series ${seriesVersion.series_id} version ${seriesVersion.version} is duplicated`,
    );
  }

  const occurrence = db
    .prepare(
      `SELECT tenant_id, schedule_series_id, occurrence_key, COUNT(*) AS count
       FROM lessons
       WHERE schedule_series_id IS NOT NULL AND schedule_series_id != ''
         AND occurrence_key IS NOT NULL AND occurrence_key != ''
       GROUP BY tenant_id, schedule_series_id, occurrence_key
       HAVING COUNT(*) > 1
       LIMIT 1`,
    )
    .get();
  if (occurrence) {
    throw new Error(
      `Lesson lineage anomaly: tenant ${occurrence.tenant_id} series ${occurrence.schedule_series_id} occurrence ${occurrence.occurrence_key} has ${occurrence.count} concrete lessons`,
    );
  }
}

function up(db) {
  const scheduleColumns = columns(db, "schedules");
  addColumn(db, "schedules", scheduleColumns, "series_id TEXT");
  addColumn(
    db,
    "schedules",
    scheduleColumns,
    "supersedes_schedule_id INTEGER REFERENCES schedules(id) ON DELETE RESTRICT",
  );
  addColumn(db, "schedules", scheduleColumns, "version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1)");
  addColumn(db, "schedules", scheduleColumns, "change_reason TEXT");
  addColumn(db, "schedules", scheduleColumns, "created_by TEXT");
  addColumn(db, "schedules", scheduleColumns, "updated_by TEXT");

  const lessonColumns = columns(db, "lessons");
  addColumn(db, "lessons", lessonColumns, "schedule_series_id TEXT");
  addColumn(db, "lessons", lessonColumns, "occurrence_key TEXT");
  addColumn(db, "lessons", lessonColumns, "override_mask INTEGER NOT NULL DEFAULT 0 CHECK(override_mask >= 0)");
  addColumn(
    db,
    "lessons",
    lessonColumns,
    "base_schedule_id INTEGER REFERENCES schedules(id) ON DELETE RESTRICT",
  );
  addColumn(
    db,
    "lessons",
    lessonColumns,
    "base_schedule_version INTEGER CHECK(base_schedule_version IS NULL OR base_schedule_version >= 1)",
  );

  db.exec(`
    CREATE TABLE IF NOT EXISTS schedule_change_runs (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      series_id TEXT NOT NULL,
      schedule_id INTEGER REFERENCES schedules(id) ON DELETE RESTRICT,
      operation TEXT NOT NULL,
      idempotency_key TEXT NOT NULL,
      request_fingerprint TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'succeeded', 'failed')),
      result_json TEXT NOT NULL DEFAULT '{}',
      error_json TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL,
      completed_at TEXT,
      UNIQUE(tenant_id, idempotency_key)
    );

    CREATE TABLE IF NOT EXISTS schedule_events (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      series_id TEXT NOT NULL,
      schedule_id INTEGER REFERENCES schedules(id) ON DELETE RESTRICT,
      lesson_id TEXT REFERENCES lessons(id) ON DELETE RESTRICT,
      occurrence_key TEXT,
      run_id TEXT REFERENCES schedule_change_runs(id) ON DELETE RESTRICT,
      actor_user_id TEXT,
      actor_role TEXT,
      action TEXT NOT NULL,
      reason TEXT,
      before_json TEXT,
      after_json TEXT,
      created_at TEXT NOT NULL
    );
  `);

  const timestamp = now();
  const schedules = db
    .prepare(
      `SELECT id, tenant_id, series_id, version, created_at, updated_at, created_by, updated_by
       FROM schedules
       ORDER BY tenant_id, id`,
    )
    .all();
  const updateSchedule = db.prepare(
    `UPDATE schedules
     SET series_id = ?,
         version = ?,
         created_by = COALESCE(NULLIF(created_by, ''), ?),
         updated_by = COALESCE(NULLIF(updated_by, ''), NULLIF(created_by, ''), ?),
         updated_at = COALESCE(NULLIF(updated_at, ''), NULLIF(created_at, ''), ?)
     WHERE tenant_id = ? AND id = ?`,
  );
  schedules.forEach((schedule) => {
    const seriesId = schedule.series_id || stableSeriesId(schedule.tenant_id, schedule.id);
    const version = Number.isSafeInteger(Number(schedule.version)) && Number(schedule.version) >= 1
      ? Number(schedule.version)
      : 1;
    updateSchedule.run(
      seriesId,
      version,
      "system:migration",
      "system:migration",
      timestamp,
      schedule.tenant_id,
      schedule.id,
    );
  });

  const linkedLessons = db
    .prepare(
      `SELECT lesson.id, lesson.tenant_id, lesson.date, lesson.time,
              lesson.schedule_id, lesson.occurrence_date, lesson.start_time, lesson.end_time,
              lesson.teacher_id, lesson.room_id, lesson.override_mask,
              lesson.schedule_series_id, lesson.occurrence_key,
              lesson.base_schedule_id, lesson.base_schedule_version,
              schedule.series_id, schedule.version AS schedule_version,
              schedule.start_time AS schedule_start_time,
              schedule.end_time AS schedule_end_time,
              schedule.teacher_id AS schedule_teacher_id,
              schedule.room_id AS schedule_room_id
       FROM lessons lesson
       JOIN schedules schedule
         ON schedule.id = lesson.schedule_id AND schedule.tenant_id = lesson.tenant_id
       WHERE lesson.schedule_id IS NOT NULL
       ORDER BY lesson.tenant_id, lesson.date, lesson.id`,
    )
    .all();
  const updateLesson = db.prepare(
    `UPDATE lessons
     SET schedule_series_id = ?, occurrence_key = ?, override_mask = ?,
         base_schedule_id = ?, base_schedule_version = ?
     WHERE tenant_id = ? AND id = ?`,
  );
  linkedLessons.forEach((lesson) => {
    const occurrenceDate = lesson.occurrence_date || lesson.date;
    const occurrenceKey = lesson.occurrence_key || isoWeekKey(occurrenceDate);
    if (!occurrenceKey) {
      throw new Error(`Lesson lineage anomaly: lesson ${lesson.id} has invalid occurrence date ${occurrenceDate}`);
    }
    updateLesson.run(
      lesson.schedule_series_id || lesson.series_id,
      occurrenceKey,
      inferredOverrideMask(lesson),
      lesson.base_schedule_id || lesson.schedule_id,
      lesson.base_schedule_version || lesson.schedule_version || 1,
      lesson.tenant_id,
      lesson.id,
    );
  });

  assertNoLineageAnomalies(db);

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_schedules_one_active_series
      ON schedules(tenant_id, series_id)
      WHERE status = 'active' AND series_id IS NOT NULL AND series_id != '';
    CREATE UNIQUE INDEX IF NOT EXISTS idx_schedules_series_version
      ON schedules(tenant_id, series_id, version)
      WHERE series_id IS NOT NULL AND series_id != '';
    CREATE INDEX IF NOT EXISTS idx_schedules_series_lineage
      ON schedules(tenant_id, series_id, valid_from, valid_until, status, version);
    CREATE INDEX IF NOT EXISTS idx_schedules_supersedes
      ON schedules(tenant_id, supersedes_schedule_id)
      WHERE supersedes_schedule_id IS NOT NULL;

    CREATE UNIQUE INDEX IF NOT EXISTS idx_lessons_series_occurrence
      ON lessons(tenant_id, schedule_series_id, occurrence_key)
      WHERE schedule_series_id IS NOT NULL AND schedule_series_id != ''
        AND occurrence_key IS NOT NULL AND occurrence_key != '';
    CREATE INDEX IF NOT EXISTS idx_lessons_series_lookup
      ON lessons(tenant_id, schedule_series_id, occurrence_key, status, date);
    CREATE INDEX IF NOT EXISTS idx_lessons_base_schedule
      ON lessons(tenant_id, base_schedule_id, base_schedule_version)
      WHERE base_schedule_id IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_schedule_change_runs_series
      ON schedule_change_runs(tenant_id, series_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_schedule_events_history
      ON schedule_events(tenant_id, series_id, created_at, id);
    CREATE INDEX IF NOT EXISTS idx_schedule_events_lesson
      ON schedule_events(tenant_id, lesson_id, created_at)
      WHERE lesson_id IS NOT NULL;

    CREATE TRIGGER IF NOT EXISTS trg_schedules_assign_series_after_insert
    AFTER INSERT ON schedules
    WHEN NEW.series_id IS NULL OR NEW.series_id = ''
    BEGIN
      UPDATE schedules
      SET series_id = 'schedule-series:' || NEW.tenant_id || ':' || NEW.id,
          version = CASE WHEN version IS NULL OR version < 1 THEN 1 ELSE version END
      WHERE tenant_id = NEW.tenant_id AND id = NEW.id;
    END;

    CREATE TRIGGER IF NOT EXISTS trg_lessons_assign_lineage_after_insert
    AFTER INSERT ON lessons
    WHEN NEW.schedule_id IS NOT NULL
      AND (NEW.schedule_series_id IS NULL OR NEW.schedule_series_id = ''
           OR NEW.occurrence_key IS NULL OR NEW.occurrence_key = '')
    BEGIN
      UPDATE lessons
      SET schedule_series_id = COALESCE(
            NULLIF(schedule_series_id, ''),
            (SELECT series_id FROM schedules WHERE id = NEW.schedule_id AND tenant_id = NEW.tenant_id)
          ),
          occurrence_key = COALESCE(
            NULLIF(occurrence_key, ''),
            printf(
              '%s-W%02d',
              strftime('%Y', date(COALESCE(NULLIF(NEW.occurrence_date, ''), NEW.date), '-3 days', 'weekday 4')),
              ((CAST(strftime('%j', date(COALESCE(NULLIF(NEW.occurrence_date, ''), NEW.date), '-3 days', 'weekday 4')) AS INTEGER) - 1) / 7) + 1
            )
          ),
          base_schedule_id = COALESCE(base_schedule_id, NEW.schedule_id),
          base_schedule_version = COALESCE(
            base_schedule_version,
            (SELECT version FROM schedules WHERE id = NEW.schedule_id AND tenant_id = NEW.tenant_id)
          )
      WHERE tenant_id = NEW.tenant_id AND id = NEW.id;
    END;

    CREATE TRIGGER IF NOT EXISTS trg_lessons_assign_lineage_after_schedule_update
    AFTER UPDATE OF schedule_id, occurrence_date ON lessons
    WHEN NEW.schedule_id IS NOT NULL
      AND (NEW.schedule_series_id IS NULL OR NEW.schedule_series_id = ''
           OR NEW.occurrence_key IS NULL OR NEW.occurrence_key = '')
    BEGIN
      UPDATE lessons
      SET schedule_series_id = COALESCE(
            NULLIF(schedule_series_id, ''),
            (SELECT series_id FROM schedules WHERE id = NEW.schedule_id AND tenant_id = NEW.tenant_id)
          ),
          occurrence_key = COALESCE(
            NULLIF(occurrence_key, ''),
            printf(
              '%s-W%02d',
              strftime('%Y', date(COALESCE(NULLIF(NEW.occurrence_date, ''), NEW.date), '-3 days', 'weekday 4')),
              ((CAST(strftime('%j', date(COALESCE(NULLIF(NEW.occurrence_date, ''), NEW.date), '-3 days', 'weekday 4')) AS INTEGER) - 1) / 7) + 1
            )
          ),
          base_schedule_id = COALESCE(base_schedule_id, NEW.schedule_id),
          base_schedule_version = COALESCE(
            base_schedule_version,
            (SELECT version FROM schedules WHERE id = NEW.schedule_id AND tenant_id = NEW.tenant_id)
          )
      WHERE tenant_id = NEW.tenant_id AND id = NEW.id;
    END;

    CREATE TRIGGER IF NOT EXISTS trg_schedule_events_append_only_update
    BEFORE UPDATE ON schedule_events
    BEGIN
      SELECT RAISE(ABORT, 'schedule events are append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS trg_schedule_events_append_only_delete
    BEFORE DELETE ON schedule_events
    BEGIN
      SELECT RAISE(ABORT, 'schedule events are append-only');
    END;
  `);
}

module.exports = {
  id: "20260713_schedule_series_lineage",
  name: "Stable recurring schedule series, occurrence identity and append-only change audit",
  up,
};
