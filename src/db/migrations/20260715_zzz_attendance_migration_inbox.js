function up(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS migration_inbox (
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      event_id TEXT NOT NULL,
      source_store TEXT NOT NULL CHECK(source_store IN ('sqlite', 'postgres')),
      event_type TEXT NOT NULL,
      received_at TEXT NOT NULL,
      PRIMARY KEY (tenant_id, event_id)
    );
    CREATE INDEX IF NOT EXISTS idx_migration_inbox_received
      ON migration_inbox(tenant_id, received_at);
  `);
}

module.exports = {
  id: "20260715_zzz_attendance_migration_inbox",
  name: "Attendance reverse relay inbox",
  up,
};
