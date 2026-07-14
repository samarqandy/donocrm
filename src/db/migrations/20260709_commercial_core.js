function tableColumns(db, tableName) {
  return db.prepare(`PRAGMA table_info(${tableName})`).all().map((column) => column.name);
}

function tableExists(db, tableName) {
  return Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName));
}

function addColumn(db, tableName, columns, definition) {
  const columnName = definition.trim().split(/\s+/)[0];
  if (!columns.includes(columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${definition}`);
    columns.push(columnName);
  }
}

function up(db) {
  if (tableExists(db, "messages")) {
    const messageColumns = tableColumns(db, "messages");
    addColumn(db, "messages", messageColumns, "processing_started_at TEXT");
  }

  if (tableExists(db, "payments")) {
    const paymentColumns = tableColumns(db, "payments");
    addColumn(db, "payments", paymentColumns, "status TEXT NOT NULL DEFAULT 'active'");
    addColumn(db, "payments", paymentColumns, "voided_at TEXT");
    addColumn(db, "payments", paymentColumns, "voided_by TEXT");
    addColumn(db, "payments", paymentColumns, "void_reason TEXT");
    addColumn(db, "payments", paymentColumns, "idempotency_key TEXT");
    db.prepare("UPDATE payments SET status = 'active' WHERE status IS NULL OR status = ''").run();
  }

  if (tableExists(db, "invoices_transactions")) {
    const ledgerColumns = tableColumns(db, "invoices_transactions");
    addColumn(db, "invoices_transactions", ledgerColumns, "status TEXT NOT NULL DEFAULT 'active'");
    addColumn(db, "invoices_transactions", ledgerColumns, "voided_at TEXT");
    addColumn(db, "invoices_transactions", ledgerColumns, "voided_by TEXT");
    addColumn(db, "invoices_transactions", ledgerColumns, "void_reason TEXT");
    addColumn(db, "invoices_transactions", ledgerColumns, "idempotency_key TEXT");
    db.prepare("UPDATE invoices_transactions SET status = 'active' WHERE status IS NULL OR status = ''").run();
  }

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_payments_tenant_status ON payments(tenant_id, status);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_tenant_idempotency ON payments(tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL AND idempotency_key != '';
    CREATE INDEX IF NOT EXISTS idx_invoices_transactions_status ON invoices_transactions(tenant_id, status);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_transactions_tenant_idempotency ON invoices_transactions(tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL AND idempotency_key != '';
    CREATE INDEX IF NOT EXISTS idx_messages_processing_started ON messages(tenant_id, status, processing_started_at);
  `);
}

module.exports = {
  id: "20260709_commercial_core",
  name: "Commercial core ledger idempotency and queue recovery fields",
  up,
};
