function columns(db, table) {
  return db.prepare(`PRAGMA table_info(${table})`).all().map((column) => column.name);
}

function addColumn(db, table, existing, definition) {
  const name = definition.trim().split(/\s+/)[0];
  if (!existing.includes(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
}

function up(db) {
  const tenantColumns = columns(db, "tenants");
  addColumn(db, "tenants", tenantColumns, "telegram_bot_token_encrypted TEXT");
  addColumn(db, "tenants", tenantColumns, "telegram_update_offset INTEGER NOT NULL DEFAULT 0");

  const messageColumns = columns(db, "messages");
  addColumn(db, "messages", messageColumns, "next_attempt_at TEXT");
  addColumn(db, "messages", messageColumns, "last_error_code TEXT");
  addColumn(db, "messages", messageColumns, "last_error_message TEXT");
  addColumn(db, "messages", messageColumns, "telegram_message_id TEXT");

  db.exec(`
    CREATE TABLE IF NOT EXISTS telegram_link_tokens (
      token TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      telegram_chat_id TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_telegram_links_tenant_student ON telegram_link_tokens(tenant_id, student_id, expires_at);
    CREATE INDEX IF NOT EXISTS idx_messages_delivery_queue ON messages(tenant_id, status, next_attempt_at, created_at);
  `);
}

module.exports = { id: "20260712_telegram_production", name: "Production Telegram delivery and account linking", up };
