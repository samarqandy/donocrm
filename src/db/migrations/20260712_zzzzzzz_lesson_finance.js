const { now } = require("../../utils/time");

function columns(db, table) {
  return db.prepare(`PRAGMA table_info(${table})`).all().map((column) => column.name);
}

function addColumn(db, table, existing, definition) {
  const name = definition.trim().split(/\s+/)[0];
  if (existing.includes(name)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
  existing.push(name);
}

function systemReasonId(tenantId, code) {
  return `attendance-reason:${tenantId}:${code}`;
}

function seedAttendanceReasons(db) {
  const timestamp = now();
  const reasons = [
    ["present", "Present", "present", 100, 100],
    ["late", "Late", "late", 100, 100],
    ["absent_unexcused", "Absent (unexcused)", "absent", 100, 100],
    ["excused", "Excused absence", "excused", 0, 0],
  ];
  const tenants = db.prepare("SELECT id FROM tenants ORDER BY id").all();
  const insert = db.prepare(
    `INSERT OR IGNORE INTO attendance_reasons
     (id, tenant_id, code, name, attendance_status, charge_percent, consume_percent,
      is_active, is_system, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?)`,
  );
  tenants.forEach((tenant) => {
    reasons.forEach(([code, name, attendanceStatus, chargePercent, consumePercent]) => {
      insert.run(
        systemReasonId(tenant.id, code),
        tenant.id,
        code,
        name,
        attendanceStatus,
        chargePercent,
        consumePercent,
        timestamp,
        timestamp,
      );
    });
  });
}

function seedAdminPermissions(db) {
  const timestamp = now();
  const permissions = [
    "lesson_finance.read",
    "lesson_finance.confirm",
    "lesson_finance.reverse",
    "payroll.manage",
    "finance_periods.manage",
  ];
  const adminRoles = db.prepare("SELECT id FROM roles WHERE code = 'admin' ORDER BY id").all();
  const insert = db.prepare(
    `INSERT OR IGNORE INTO role_permissions (role_id, permission, created_at)
     VALUES (?, ?, ?)`,
  );
  adminRoles.forEach((role) => {
    permissions.forEach((permission) => insert.run(role.id, permission, timestamp));
  });
}

function up(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS attendance_reasons (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      attendance_status TEXT NOT NULL
        CHECK(attendance_status IN ('present', 'absent', 'late', 'excused')),
      charge_percent REAL NOT NULL
        CHECK(charge_percent >= 0 AND charge_percent <= 100),
      consume_percent REAL NOT NULL
        CHECK(consume_percent >= 0 AND consume_percent <= 100),
      is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
      is_system INTEGER NOT NULL DEFAULT 0 CHECK(is_system IN (0, 1)),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(tenant_id, code)
    );

    CREATE TRIGGER IF NOT EXISTS trg_tenants_seed_attendance_reasons
    AFTER INSERT ON tenants
    BEGIN
      INSERT OR IGNORE INTO attendance_reasons
        (id, tenant_id, code, name, attendance_status, charge_percent, consume_percent,
         is_active, is_system, created_at, updated_at)
      VALUES
        ('attendance-reason:' || NEW.id || ':present', NEW.id, 'present', 'Present',
         'present', 100, 100, 1, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        ('attendance-reason:' || NEW.id || ':late', NEW.id, 'late', 'Late',
         'late', 100, 100, 1, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        ('attendance-reason:' || NEW.id || ':absent_unexcused', NEW.id, 'absent_unexcused', 'Absent (unexcused)',
         'absent', 100, 100, 1, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        ('attendance-reason:' || NEW.id || ':excused', NEW.id, 'excused', 'Excused absence',
         'excused', 0, 0, 1, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
    END;
  `);

  const attendanceColumns = columns(db, "attendance");
  addColumn(
    db,
    "attendance",
    attendanceColumns,
    "reason_id TEXT REFERENCES attendance_reasons(id) ON DELETE RESTRICT",
  );
  addColumn(db, "attendance", attendanceColumns, "reason_code TEXT");
  addColumn(db, "attendance", attendanceColumns, "reason_name TEXT");
  addColumn(
    db,
    "attendance",
    attendanceColumns,
    "charge_percent REAL CHECK(charge_percent IS NULL OR (charge_percent >= 0 AND charge_percent <= 100))",
  );
  addColumn(
    db,
    "attendance",
    attendanceColumns,
    "consume_percent REAL CHECK(consume_percent IS NULL OR (consume_percent >= 0 AND consume_percent <= 100))",
  );

  const lessonColumns = columns(db, "lessons");
  // Keep this extensible: confirm/reverse may use the pending state while the
  // SQLite transaction is in progress.
  addColumn(db, "lessons", lessonColumns, "financial_status TEXT NOT NULL DEFAULT 'unposted'");
  addColumn(
    db,
    "lessons",
    lessonColumns,
    "financial_version INTEGER NOT NULL DEFAULT 0 CHECK(financial_version >= 0)",
  );
  addColumn(db, "lessons", lessonColumns, "financial_posted_at TEXT");
  addColumn(db, "lessons", lessonColumns, "financial_posted_by TEXT");
  addColumn(db, "lessons", lessonColumns, "financial_reversed_at TEXT");
  addColumn(db, "lessons", lessonColumns, "financial_reversed_by TEXT");
  addColumn(db, "lessons", lessonColumns, "financial_reversal_reason TEXT");

  // Completed lessons predate the settlement model. Mark them explicitly but
  // never synthesize settlements, posting lines, accruals, or ledger rows.
  db.prepare(
    `UPDATE lessons
     SET financial_status = 'legacy'
     WHERE status = 'completed'
       AND financial_version = 0
       AND financial_status = 'unposted'`,
  ).run();

  const transactionColumns = columns(db, "invoices_transactions");
  addColumn(
    db,
    "invoices_transactions",
    transactionColumns,
    "effect TEXT CHECK(effect IS NULL OR effect IN ('debit', 'credit'))",
  );
  addColumn(db, "invoices_transactions", transactionColumns, "currency TEXT NOT NULL DEFAULT 'UZS'");
  addColumn(db, "invoices_transactions", transactionColumns, "source_type TEXT");
  addColumn(db, "invoices_transactions", transactionColumns, "source_id TEXT");
  addColumn(
    db,
    "invoices_transactions",
    transactionColumns,
    "reversal_of_id INTEGER REFERENCES invoices_transactions(id) ON DELETE RESTRICT",
  );
  addColumn(db, "invoices_transactions", transactionColumns, "request_fingerprint TEXT");

  // Preserve the sign semantics of the existing wallet ledger. This updates
  // metadata only and creates no financial rows.
  db.prepare(
    `UPDATE invoices_transactions
     SET effect = CASE
       WHEN type IN ('payment', 'discount') THEN 'credit'
       WHEN type IN ('charge', 'refund', 'correction') THEN 'debit'
       ELSE effect
     END
     WHERE effect IS NULL`,
  ).run();

  db.exec(`
    CREATE TABLE IF NOT EXISTS finance_periods (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      branch_id TEXT REFERENCES branches(id) ON DELETE RESTRICT,
      label TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'closed')),
      closed_at TEXT,
      closed_by TEXT,
      close_reason TEXT,
      reopened_at TEXT,
      reopened_by TEXT,
      reopened_reason TEXT,
      version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1),
      created_by TEXT,
      created_at TEXT NOT NULL,
      updated_by TEXT,
      updated_at TEXT NOT NULL,
      CHECK(end_date >= start_date)
    );

    CREATE TABLE IF NOT EXISTS lesson_billing_policies (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      branch_id TEXT REFERENCES branches(id) ON DELETE RESTRICT,
      group_id TEXT REFERENCES groups(id) ON DELETE RESTRICT,
      name TEXT NOT NULL,
      billing_mode TEXT NOT NULL DEFAULT 'per_lesson',
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'archived')),
      base_amount INTEGER NOT NULL CHECK(base_amount >= 0),
      currency TEXT NOT NULL DEFAULT 'UZS',
      valid_from TEXT NOT NULL,
      valid_until TEXT,
      version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1),
      created_by TEXT,
      created_at TEXT NOT NULL,
      updated_by TEXT,
      updated_at TEXT NOT NULL,
      archived_by TEXT,
      archived_at TEXT,
      CHECK(valid_until IS NULL OR valid_until >= valid_from)
    );

    CREATE TABLE IF NOT EXISTS teacher_rate_rules (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      teacher_id TEXT NOT NULL REFERENCES teachers(id) ON DELETE RESTRICT,
      branch_id TEXT REFERENCES branches(id) ON DELETE RESTRICT,
      group_id TEXT REFERENCES groups(id) ON DELETE RESTRICT,
      lesson_type TEXT,
      rate_type TEXT NOT NULL CHECK(rate_type IN ('flat', 'per_student', 'hourly')),
      rate_amount REAL NOT NULL CHECK(rate_amount >= 0),
      currency TEXT NOT NULL DEFAULT 'UZS',
      effective_from TEXT NOT NULL,
      effective_until TEXT,
      version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1),
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'archived')),
      created_by TEXT,
      created_at TEXT NOT NULL,
      updated_by TEXT,
      updated_at TEXT NOT NULL,
      archived_at TEXT,
      archived_by TEXT,
      archive_reason TEXT,
      CHECK(effective_until IS NULL OR effective_until >= effective_from)
    );

    CREATE TABLE IF NOT EXISTS lesson_financial_settlements (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      branch_id TEXT REFERENCES branches(id) ON DELETE RESTRICT,
      lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE RESTRICT,
      attendance_revision_no INTEGER NOT NULL CHECK(attendance_revision_no >= 1),
      status TEXT NOT NULL CHECK(status IN ('confirmed', 'reversed')),
      service_date TEXT NOT NULL,
      posting_date TEXT NOT NULL,
      currency TEXT NOT NULL DEFAULT 'UZS',
      billing_policy_id TEXT NOT NULL REFERENCES lesson_billing_policies(id) ON DELETE RESTRICT,
      billing_policy_version INTEGER NOT NULL CHECK(billing_policy_version >= 1),
      teacher_rate_rule_id TEXT REFERENCES teacher_rate_rules(id) ON DELETE RESTRICT,
      teacher_rate_rule_version INTEGER,
      confirmed_by TEXT NOT NULL,
      confirmed_at TEXT NOT NULL,
      reversed_by TEXT,
      reversed_at TEXT,
      reversal_reason TEXT,
      version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1),
      idempotency_key TEXT NOT NULL,
      request_fingerprint TEXT NOT NULL,
      CHECK(
        (teacher_rate_rule_id IS NULL AND teacher_rate_rule_version IS NULL)
        OR (teacher_rate_rule_id IS NOT NULL AND teacher_rate_rule_version >= 1)
      ),
      FOREIGN KEY (tenant_id, lesson_id, attendance_revision_no)
        REFERENCES lesson_attendance_revisions(tenant_id, lesson_id, revision_no)
        ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS lesson_financial_runs (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE RESTRICT,
      idempotency_key TEXT NOT NULL,
      request_fingerprint TEXT NOT NULL,
      financial_version INTEGER NOT NULL CHECK(financial_version >= 0),
      operation TEXT NOT NULL CHECK(operation IN ('preview', 'confirm', 'reverse')),
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK(status IN ('pending', 'succeeded', 'failed')),
      result_json TEXT NOT NULL DEFAULT '{}',
      error_json TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL,
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS lesson_student_postings (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      settlement_id TEXT NOT NULL REFERENCES lesson_financial_settlements(id) ON DELETE RESTRICT,
      lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE RESTRICT,
      student_id TEXT NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
      financial_run_id TEXT REFERENCES lesson_financial_runs(id) ON DELETE RESTRICT,
      revision INTEGER NOT NULL CHECK(revision >= 1),
      attendance_status TEXT NOT NULL
        CHECK(attendance_status IN ('present', 'absent', 'late', 'excused')),
      reason_id TEXT REFERENCES attendance_reasons(id) ON DELETE RESTRICT,
      reason_code TEXT,
      reason_name TEXT,
      charge_percent REAL NOT NULL
        CHECK(charge_percent >= 0 AND charge_percent <= 100),
      consume_percent REAL NOT NULL
        CHECK(consume_percent >= 0 AND consume_percent <= 100),
      billing_policy_id TEXT NOT NULL REFERENCES lesson_billing_policies(id) ON DELETE RESTRICT,
      billing_policy_version INTEGER NOT NULL CHECK(billing_policy_version >= 1),
      base_amount_snapshot INTEGER NOT NULL CHECK(base_amount_snapshot >= 0),
      policy_snapshot_json TEXT NOT NULL DEFAULT '{}',
      subscription_id TEXT REFERENCES subscriptions(id) ON DELETE RESTRICT,
      consume_units REAL NOT NULL CHECK(consume_units >= 0),
      unit_price REAL NOT NULL CHECK(unit_price >= 0),
      charge_amount REAL NOT NULL CHECK(charge_amount >= 0),
      currency TEXT NOT NULL DEFAULT 'UZS',
      ledger_transaction_id INTEGER REFERENCES invoices_transactions(id) ON DELETE RESTRICT,
      reversal_transaction_id INTEGER REFERENCES invoices_transactions(id) ON DELETE RESTRICT,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'reversed')),
      idempotency_key TEXT NOT NULL,
      reversal_of_posting_id TEXT REFERENCES lesson_student_postings(id) ON DELETE RESTRICT,
      reversal_settlement_id TEXT REFERENCES lesson_financial_settlements(id) ON DELETE RESTRICT,
      reversed_at TEXT,
      reversed_by TEXT,
      reversal_reason TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL,
      CHECK(reversal_of_posting_id IS NULL OR reversal_of_posting_id != id),
      CHECK(ledger_transaction_id IS NULL OR ledger_transaction_id != reversal_transaction_id)
    );

    CREATE TABLE IF NOT EXISTS teacher_accruals (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      settlement_id TEXT NOT NULL REFERENCES lesson_financial_settlements(id) ON DELETE RESTRICT,
      lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE RESTRICT,
      teacher_id TEXT NOT NULL REFERENCES teachers(id) ON DELETE RESTRICT,
      financial_run_id TEXT REFERENCES lesson_financial_runs(id) ON DELETE RESTRICT,
      rate_rule_id TEXT REFERENCES teacher_rate_rules(id) ON DELETE RESTRICT,
      revision INTEGER NOT NULL CHECK(revision >= 1),
      entry_type TEXT NOT NULL CHECK(entry_type IN ('accrual', 'reversal')),
      original_entry_id TEXT REFERENCES teacher_accruals(id) ON DELETE RESTRICT,
      rate_type_snapshot TEXT NOT NULL
        CHECK(rate_type_snapshot IN ('flat', 'per_student', 'hourly')),
      rate_amount_snapshot REAL NOT NULL CHECK(rate_amount_snapshot >= 0),
      duration_minutes_snapshot INTEGER NOT NULL CHECK(duration_minutes_snapshot >= 0),
      basis_quantity_snapshot REAL NOT NULL CHECK(basis_quantity_snapshot >= 0),
      basis_snapshot_json TEXT NOT NULL DEFAULT '{}',
      accrual_amount REAL NOT NULL CHECK(accrual_amount >= 0),
      currency TEXT NOT NULL DEFAULT 'UZS',
      idempotency_key TEXT NOT NULL,
      reversal_reason TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL,
      CHECK(
        (entry_type = 'accrual' AND original_entry_id IS NULL)
        OR (entry_type = 'reversal' AND original_entry_id IS NOT NULL)
      ),
      CHECK(original_entry_id IS NULL OR original_entry_id != id)
    );

    CREATE INDEX IF NOT EXISTS idx_attendance_reasons_lookup
      ON attendance_reasons(tenant_id, is_active, attendance_status, code);
    CREATE INDEX IF NOT EXISTS idx_attendance_reason
      ON attendance(tenant_id, reason_id);
    CREATE INDEX IF NOT EXISTS idx_lessons_financial_status
      ON lessons(tenant_id, financial_status, date);

    CREATE INDEX IF NOT EXISTS idx_invoices_transactions_effect
      ON invoices_transactions(tenant_id, effect, invoice_date);
    CREATE INDEX IF NOT EXISTS idx_invoices_transactions_source
      ON invoices_transactions(tenant_id, source_type, source_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_transactions_one_reversal
      ON invoices_transactions(tenant_id, reversal_of_id)
      WHERE reversal_of_id IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_finance_periods_lookup
      ON finance_periods(tenant_id, status, branch_id, start_date, end_date);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_finance_periods_scope_range
      ON finance_periods(tenant_id, COALESCE(branch_id, ''), start_date, end_date);

    -- Scope overlap is intentionally validated by application policy resolution.
    CREATE INDEX IF NOT EXISTS idx_lesson_billing_policies_lookup
      ON lesson_billing_policies
        (tenant_id, status, group_id, branch_id, valid_from, valid_until, version);

    CREATE INDEX IF NOT EXISTS idx_teacher_rate_rules_lookup
      ON teacher_rate_rules
        (tenant_id, teacher_id, status, branch_id, group_id, lesson_type, effective_from, effective_until, version);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_lesson_financial_settlements_idempotency
      ON lesson_financial_settlements(tenant_id, idempotency_key);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_lesson_financial_settlements_one_confirmed
      ON lesson_financial_settlements(tenant_id, lesson_id)
      WHERE status = 'confirmed';
    CREATE INDEX IF NOT EXISTS idx_lesson_financial_settlements_lesson
      ON lesson_financial_settlements(tenant_id, lesson_id, version, status, confirmed_at);
    CREATE INDEX IF NOT EXISTS idx_lesson_financial_settlements_period
      ON lesson_financial_settlements(tenant_id, posting_date, status);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_lesson_financial_runs_idempotency
      ON lesson_financial_runs(tenant_id, idempotency_key);
    CREATE INDEX IF NOT EXISTS idx_lesson_financial_runs_lesson
      ON lesson_financial_runs(tenant_id, lesson_id, financial_version, created_at);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_lesson_student_postings_idempotency
      ON lesson_student_postings(tenant_id, idempotency_key);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_lesson_student_postings_one_active
      ON lesson_student_postings(tenant_id, lesson_id, student_id)
      WHERE status = 'active';
    CREATE UNIQUE INDEX IF NOT EXISTS idx_lesson_student_postings_one_reversal
      ON lesson_student_postings(tenant_id, reversal_of_posting_id)
      WHERE reversal_of_posting_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_lesson_student_postings_settlement
      ON lesson_student_postings(tenant_id, settlement_id, revision, status);
    CREATE INDEX IF NOT EXISTS idx_lesson_student_postings_student
      ON lesson_student_postings(tenant_id, student_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_lesson_student_postings_subscription
      ON lesson_student_postings(tenant_id, subscription_id, status);
    CREATE INDEX IF NOT EXISTS idx_lesson_student_postings_ledger
      ON lesson_student_postings(ledger_transaction_id, reversal_transaction_id);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_teacher_accruals_idempotency
      ON teacher_accruals(tenant_id, idempotency_key);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_teacher_accruals_one_original
      ON teacher_accruals(tenant_id, settlement_id, teacher_id)
      WHERE entry_type = 'accrual';
    CREATE UNIQUE INDEX IF NOT EXISTS idx_teacher_accruals_one_reversal
      ON teacher_accruals(tenant_id, original_entry_id)
      WHERE entry_type = 'reversal';
    CREATE INDEX IF NOT EXISTS idx_teacher_accruals_lesson
      ON teacher_accruals(tenant_id, lesson_id, revision, entry_type);
    CREATE INDEX IF NOT EXISTS idx_teacher_accruals_teacher
      ON teacher_accruals(tenant_id, teacher_id, created_at);

    CREATE TRIGGER IF NOT EXISTS trg_attendance_reason_scope_insert
    BEFORE INSERT ON attendance
    WHEN NEW.reason_id IS NOT NULL AND NOT EXISTS (
      SELECT 1
      FROM attendance_reasons reason
      WHERE reason.id = NEW.reason_id
        AND reason.tenant_id = NEW.tenant_id
        AND reason.attendance_status = NEW.status
    )
    BEGIN
      SELECT RAISE(ABORT, 'attendance reason must match tenant and attendance status');
    END;

    CREATE TRIGGER IF NOT EXISTS trg_attendance_reason_scope_update
    BEFORE UPDATE OF tenant_id, status, reason_id ON attendance
    WHEN NEW.reason_id IS NOT NULL AND NOT EXISTS (
      SELECT 1
      FROM attendance_reasons reason
      WHERE reason.id = NEW.reason_id
        AND reason.tenant_id = NEW.tenant_id
        AND reason.attendance_status = NEW.status
    )
    BEGIN
      SELECT RAISE(ABORT, 'attendance reason must match tenant and attendance status');
    END;

    CREATE TRIGGER IF NOT EXISTS trg_lesson_student_postings_immutable_core
    BEFORE UPDATE ON lesson_student_postings
    WHEN NEW.id IS NOT OLD.id
      OR NEW.tenant_id IS NOT OLD.tenant_id
      OR NEW.settlement_id IS NOT OLD.settlement_id
      OR NEW.lesson_id IS NOT OLD.lesson_id
      OR NEW.student_id IS NOT OLD.student_id
      OR NEW.financial_run_id IS NOT OLD.financial_run_id
      OR NEW.revision IS NOT OLD.revision
      OR NEW.attendance_status IS NOT OLD.attendance_status
      OR NEW.reason_id IS NOT OLD.reason_id
      OR NEW.reason_code IS NOT OLD.reason_code
      OR NEW.reason_name IS NOT OLD.reason_name
      OR NEW.charge_percent IS NOT OLD.charge_percent
      OR NEW.consume_percent IS NOT OLD.consume_percent
      OR NEW.billing_policy_id IS NOT OLD.billing_policy_id
      OR NEW.billing_policy_version IS NOT OLD.billing_policy_version
      OR NEW.base_amount_snapshot IS NOT OLD.base_amount_snapshot
      OR NEW.policy_snapshot_json IS NOT OLD.policy_snapshot_json
      OR NEW.subscription_id IS NOT OLD.subscription_id
      OR NEW.consume_units IS NOT OLD.consume_units
      OR NEW.unit_price IS NOT OLD.unit_price
      OR NEW.charge_amount IS NOT OLD.charge_amount
      OR NEW.currency IS NOT OLD.currency
      OR NEW.ledger_transaction_id IS NOT OLD.ledger_transaction_id
      OR NEW.idempotency_key IS NOT OLD.idempotency_key
      OR NEW.reversal_of_posting_id IS NOT OLD.reversal_of_posting_id
      OR NEW.created_by IS NOT OLD.created_by
      OR NEW.created_at IS NOT OLD.created_at
    BEGIN
      SELECT RAISE(ABORT, 'lesson student posting core fields are immutable');
    END;

    CREATE TRIGGER IF NOT EXISTS trg_lesson_student_postings_no_reactivate
    BEFORE UPDATE OF status ON lesson_student_postings
    WHEN OLD.status = 'reversed' AND NEW.status != 'reversed'
    BEGIN
      SELECT RAISE(ABORT, 'reversed lesson student posting cannot be reactivated');
    END;

    CREATE TRIGGER IF NOT EXISTS trg_teacher_accruals_append_only
    BEFORE UPDATE ON teacher_accruals
    BEGIN
      SELECT RAISE(ABORT, 'teacher accruals are append-only; add a reversal entry');
    END;
  `);

  seedAttendanceReasons(db);
  seedAdminPermissions(db);
}

module.exports = {
  id: "20260712_zzzzzzz_lesson_finance",
  name: "Lesson settlement, attendance policy snapshots and reversible finance foundation",
  up,
};
