function up(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS migration_outbox (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      id TEXT NOT NULL UNIQUE,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      aggregate_type TEXT NOT NULL,
      aggregate_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      source_store TEXT NOT NULL CHECK(source_store IN ('sqlite', 'postgres')),
      target_store TEXT NOT NULL CHECK(target_store IN ('sqlite', 'postgres')),
      source_version INTEGER NOT NULL,
      payload_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'done', 'failed')),
      attempts INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      processed_at TEXT,
      last_error TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_migration_outbox_delivery
      ON migration_outbox(source_store, target_store, status, sequence);
    CREATE INDEX IF NOT EXISTS idx_migration_outbox_aggregate
      ON migration_outbox(tenant_id, aggregate_type, aggregate_id, source_version);
  `);
}

module.exports = {
  id: "20260715_zz_attendance_migration_outbox",
  name: "Attendance Strangler migration outbox",
  up,
};
