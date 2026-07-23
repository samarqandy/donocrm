function up(db) {
  for (const operation of ["INSERT", "UPDATE"]) {
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS trg_lesson_events_attendance_reference_${operation.toLowerCase()}
      AFTER ${operation} ON lesson_events
      WHEN COALESCE((SELECT enabled FROM migration_runtime_flags
                     WHERE key = 'attendance_reference_mirror'), 0) = 1
      BEGIN
        INSERT INTO migration_outbox
          (id, tenant_id, aggregate_type, aggregate_id, event_type, source_store,
           target_store, source_version, payload_json, status, attempts, created_at)
        VALUES (
          lower(hex(randomblob(16))), NEW.tenant_id, 'attendance_reference',
          'lesson_events:' || NEW.id, 'reference.lesson_events.upsert', 'sqlite', 'postgres', 1,
          json_object('table', 'lesson_events', 'id', NEW.id, 'operation', 'upsert'),
          'pending', 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        );
      END;
    `);
  }
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS trg_lesson_events_attendance_reference_delete
    AFTER DELETE ON lesson_events
    WHEN COALESCE((SELECT enabled FROM migration_runtime_flags
                   WHERE key = 'attendance_reference_mirror'), 0) = 1
    BEGIN
      INSERT INTO migration_outbox
        (id, tenant_id, aggregate_type, aggregate_id, event_type, source_store,
         target_store, source_version, payload_json, status, attempts, created_at)
      VALUES (
        lower(hex(randomblob(16))), OLD.tenant_id, 'attendance_reference',
        'lesson_events:' || OLD.id, 'reference.lesson_events.delete', 'sqlite', 'postgres', 1,
        json_object('table', 'lesson_events', 'id', OLD.id, 'operation', 'delete'),
        'pending', 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      );
    END;
  `);
}

module.exports = {
  id: "20260715_zzzzzz_attendance_lesson_event_reference",
  name: "Mirror legacy lesson events into PostgreSQL attendance history",
  up,
};
