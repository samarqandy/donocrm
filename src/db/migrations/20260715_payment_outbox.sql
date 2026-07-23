CREATE TABLE IF NOT EXISTS outbox (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  dedupe_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending', 'processing', 'published', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts >= 0),
  available_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  processed_at TEXT,
  last_error TEXT,
  UNIQUE(tenant_id, dedupe_key)
);

CREATE INDEX IF NOT EXISTS idx_outbox_delivery
  ON outbox(tenant_id, status, available_at, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_ledger_source
  ON invoices_transactions(tenant_id, source_type, source_id)
  WHERE source_type = 'payment' AND source_id IS NOT NULL AND source_id != '';
