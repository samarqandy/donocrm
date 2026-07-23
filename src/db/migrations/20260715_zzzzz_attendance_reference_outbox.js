const REFERENCE_TABLES = ["teachers", "groups", "students", "student_group_enrollments", "lessons", "lesson_events"];

function up(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS migration_runtime_flags (
      key TEXT PRIMARY KEY,
      enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0, 1)),
      updated_at TEXT NOT NULL
    );
    INSERT OR IGNORE INTO migration_runtime_flags(key, enabled, updated_at)
    VALUES ('attendance_reference_mirror', 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
  `);

  for (const table of REFERENCE_TABLES) {
    for (const operation of ["INSERT", "UPDATE"]) {
      db.exec(`
        CREATE TRIGGER IF NOT EXISTS trg_${table}_attendance_reference_${operation.toLowerCase()}
        AFTER ${operation} ON ${table}
        WHEN COALESCE((SELECT enabled FROM migration_runtime_flags
                       WHERE key = 'attendance_reference_mirror'), 0) = 1
        BEGIN
          INSERT INTO migration_outbox
            (id, tenant_id, aggregate_type, aggregate_id, event_type, source_store,
             target_store, source_version, payload_json, status, attempts, created_at)
          VALUES (
            lower(hex(randomblob(16))), NEW.tenant_id, 'attendance_reference',
            '${table}:' || NEW.id, 'reference.${table}.upsert', 'sqlite', 'postgres', 1,
            json_object('table', '${table}', 'id', NEW.id, 'operation', 'upsert'),
            'pending', 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
          );
        END;
      `);
    }
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS trg_${table}_attendance_reference_delete
      AFTER DELETE ON ${table}
      WHEN COALESCE((SELECT enabled FROM migration_runtime_flags
                     WHERE key = 'attendance_reference_mirror'), 0) = 1
      BEGIN
        INSERT INTO migration_outbox
          (id, tenant_id, aggregate_type, aggregate_id, event_type, source_store,
           target_store, source_version, payload_json, status, attempts, created_at)
        VALUES (
          lower(hex(randomblob(16))), OLD.tenant_id, 'attendance_reference',
          '${table}:' || OLD.id, 'reference.${table}.delete', 'sqlite', 'postgres', 1,
          json_object('table', '${table}', 'id', OLD.id, 'operation', 'delete'),
          'pending', 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        );
      END;
    `);
  }
}

module.exports = {
  id: "20260715_zzzzz_attendance_reference_outbox",
  name: "Gated attendance reference outbox triggers",
  up,
};
