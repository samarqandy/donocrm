const fs = require("node:fs");
const { DatabaseSync } = require("node:sqlite");
const { dataDir, sqliteFile } = require("../config/app");
const { schema } = require("./schema");
const { seed } = require("./seed");
const { runVersionedMigrations } = require("./migrationRunner");
const { hashPassword, isPasswordHash } = require("../utils/password");
const { now, today } = require("../utils/time");

let db;

function getDb() {
  if (db) return db;
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  const candidate = new DatabaseSync(sqliteFile);
  try {
    candidate.exec(schema);
    migrate(candidate);
    seed(candidate);
    migrate(candidate);
    runVersionedMigrations(candidate);
    backfillWalletLedger(candidate);
    db = candidate;
    return db;
  } catch (error) {
    // Never cache a partially initialized connection. A later readiness/API
    // request must retry the complete migration path instead of returning a
    // false-positive SELECT 1 from a database whose schema setup failed.
    try {
      candidate.close();
    } catch (_closeError) {}
    throw error;
  }
}

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

function seedPipelineStages(db) {
  if (!tableExists(db, "pipeline_stages")) return;
  const timestamp = now();
  const stages = [
    ["new", "Yangi", 1, 1],
    ["contacted", "Bog'landi", 2, 1],
    ["trial_set", "Sinov belgilandi", 3, 0],
    ["trial_passed", "Sinov o'tdi", 4, 0],
    ["paid", "To'lov qildi", 5, 1],
    ["lost", "Yo'qotildi", 6, 1],
  ];
  const tenants = db.prepare("SELECT id FROM tenants").all();
  const insert = db.prepare(
    "INSERT OR IGNORE INTO pipeline_stages (id, tenant_id, name, sort_order, created_at, is_system) VALUES (?, ?, ?, ?, ?, ?)",
  );
  tenants.forEach((tenant) => stages.forEach((stage) => insert.run(stage[0], tenant.id, stage[1], stage[2], timestamp, stage[3])));
}

function rebuildLeadsWithoutStageCheck(db) {
  const table = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'leads'").get();
  if (!table?.sql || !/stage\s+TEXT[\s\S]*CHECK\s*\(/i.test(table.sql)) return;

  db.exec("PRAGMA foreign_keys = OFF");
  db.exec("BEGIN");
  try {
    db.exec(`
      CREATE TABLE leads_new (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        phone TEXT,
        source TEXT,
        status TEXT NOT NULL CHECK(status IN ('new', 'contacted', 'converted')),
        stage TEXT NOT NULL DEFAULT 'new',
        responsible_admin TEXT,
        next_action TEXT,
        note TEXT,
        created_at TEXT NOT NULL
      );

      INSERT INTO leads_new (id, tenant_id, name, phone, source, status, stage, responsible_admin, next_action, note, created_at)
      SELECT
        id,
        tenant_id,
        name,
        phone,
        source,
        status,
        COALESCE(NULLIF(stage, ''), CASE status WHEN 'contacted' THEN 'contacted' WHEN 'converted' THEN 'paid' ELSE 'new' END),
        responsible_admin,
        next_action,
        note,
        created_at
      FROM leads;

      DROP TABLE leads;
      ALTER TABLE leads_new RENAME TO leads;
    `);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  } finally {
    db.exec("PRAGMA foreign_keys = ON");
  }
}

function rebuildMessagesWithProcessingStatus(db) {
  const table = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'messages'").get();
  if (!table?.sql || /'processing'/.test(table.sql)) return;

  db.exec("PRAGMA foreign_keys = OFF");
  db.exec("BEGIN");
  try {
    db.exec(`
      CREATE TABLE messages_new (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        student_id TEXT REFERENCES students(id) ON DELETE SET NULL,
        recipient TEXT NOT NULL,
        channel TEXT NOT NULL,
        text TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('queued', 'processing', 'sent', 'failed')),
        attempts INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        sent_at TEXT,
        processing_started_at TEXT
      );

      INSERT INTO messages_new (id, tenant_id, student_id, recipient, channel, text, status, attempts, created_at, sent_at, processing_started_at)
      SELECT id, tenant_id, student_id, recipient, channel, text, status, attempts, created_at, sent_at, processing_started_at
      FROM messages;

      DROP TABLE messages;
      ALTER TABLE messages_new RENAME TO messages;
    `);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  } finally {
    db.exec("PRAGMA foreign_keys = ON");
  }
}

function migrate(db) {
  const columns = tableColumns(db, "tenants");
  if (!columns.includes("telegram_bot_token")) {
    db.exec("ALTER TABLE tenants ADD COLUMN telegram_bot_token TEXT");
  }
  const userColumns = tableColumns(db, "users");
  if (!userColumns.includes("username")) {
    db.exec("ALTER TABLE users ADD COLUMN username TEXT");
    db.prepare("UPDATE users SET username = ? WHERE id = ?").run("admin", "user_admin");
    db.prepare("UPDATE users SET username = ? WHERE id = ?").run("teacher", "user_teacher");
  }
  if (!userColumns.includes("password")) {
    db.exec("ALTER TABLE users ADD COLUMN password TEXT");
    db.prepare("UPDATE users SET password = ? WHERE id = ?").run(hashPassword("admin123"), "user_admin");
    db.prepare("UPDATE users SET password = ? WHERE id = ?").run(hashPassword("teacher123"), "user_teacher");
  }
  db.prepare("SELECT id, password FROM users")
    .all()
    .filter((user) => user.password && !isPasswordHash(user.password))
    .forEach((user) => {
      db.prepare("UPDATE users SET password = ? WHERE id = ?").run(hashPassword(user.password), user.id);
    });

  const studentColumns = tableColumns(db, "students");
  addColumn(db, "students", studentColumns, "balance REAL NOT NULL DEFAULT 0");
  addColumn(db, "students", studentColumns, "status TEXT NOT NULL DEFAULT 'active'");

  const messageColumns = tableColumns(db, "messages");
  addColumn(db, "messages", messageColumns, "student_id TEXT REFERENCES students(id) ON DELETE SET NULL");
  addColumn(db, "messages", messageColumns, "processing_started_at TEXT");
  rebuildMessagesWithProcessingStatus(db);

  db.exec(`
    CREATE TABLE IF NOT EXISTS invoices_transactions (
      id INTEGER PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK(type IN ('payment', 'charge', 'discount', 'refund', 'correction')),
      amount REAL NOT NULL CHECK(amount > 0),
      description TEXT,
      invoice_date TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  const ledgerColumns = tableColumns(db, "invoices_transactions");
  addColumn(db, "invoices_transactions", ledgerColumns, "tenant_id TEXT");
  addColumn(db, "invoices_transactions", ledgerColumns, "description TEXT");
  addColumn(db, "invoices_transactions", ledgerColumns, "invoice_date TEXT");
  addColumn(db, "invoices_transactions", ledgerColumns, "created_at TEXT");
  addColumn(db, "invoices_transactions", ledgerColumns, "status TEXT NOT NULL DEFAULT 'active'");
  addColumn(db, "invoices_transactions", ledgerColumns, "voided_at TEXT");
  addColumn(db, "invoices_transactions", ledgerColumns, "voided_by TEXT");
  addColumn(db, "invoices_transactions", ledgerColumns, "void_reason TEXT");
  addColumn(db, "invoices_transactions", ledgerColumns, "idempotency_key TEXT");
  db.prepare(
    `UPDATE invoices_transactions
     SET tenant_id = (SELECT tenant_id FROM students WHERE students.id = invoices_transactions.student_id)
     WHERE tenant_id IS NULL OR tenant_id = ''`,
  ).run();
  db.prepare("UPDATE invoices_transactions SET invoice_date = ? WHERE invoice_date IS NULL OR invoice_date = ''").run(today());
  db.prepare("UPDATE invoices_transactions SET created_at = ? WHERE created_at IS NULL OR created_at = ''").run(now());
  db.prepare("UPDATE invoices_transactions SET status = 'active' WHERE status IS NULL OR status = ''").run();

  const paymentColumns = tableColumns(db, "payments");
  addColumn(db, "payments", paymentColumns, "status TEXT NOT NULL DEFAULT 'active'");
  addColumn(db, "payments", paymentColumns, "voided_at TEXT");
  addColumn(db, "payments", paymentColumns, "voided_by TEXT");
  addColumn(db, "payments", paymentColumns, "void_reason TEXT");
  addColumn(db, "payments", paymentColumns, "idempotency_key TEXT");
  db.prepare("UPDATE payments SET status = 'active' WHERE status IS NULL OR status = ''").run();

  db.exec(`
    CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS schedules (
      id INTEGER PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      teacher_id TEXT REFERENCES teachers(id) ON DELETE SET NULL,
      room_id TEXT REFERENCES rooms(id) ON DELETE SET NULL,
      weekday TEXT NOT NULL CHECK(weekday IN ('1', '2', '3', '4', '5', '6', '7')),
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      is_recurring BOOLEAN NOT NULL DEFAULT 1,
      lesson_link TEXT,
      created_at TEXT NOT NULL
    );
  `);

  const leadColumns = tableColumns(db, "leads");
  addColumn(db, "leads", leadColumns, "stage TEXT NOT NULL DEFAULT 'new'");
  addColumn(db, "leads", leadColumns, "responsible_admin TEXT");
  addColumn(db, "leads", leadColumns, "next_action TEXT");
  addColumn(db, "leads", leadColumns, "note TEXT");
  db.prepare(
    `UPDATE leads
     SET stage = CASE status
       WHEN 'contacted' THEN 'contacted'
       WHEN 'converted' THEN 'paid'
       ELSE 'new'
     END
     WHERE stage IS NULL OR stage = '' OR stage = 'new'`,
  ).run();
  db.exec(`
    CREATE TABLE IF NOT EXISTS pipeline_stages (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      is_system BOOLEAN DEFAULT 0
    );
  `);
  const pipelineStageColumns = tableColumns(db, "pipeline_stages");
  addColumn(db, "pipeline_stages", pipelineStageColumns, "created_at TEXT");
  addColumn(db, "pipeline_stages", pipelineStageColumns, "is_system BOOLEAN DEFAULT 0");
  db.prepare("UPDATE pipeline_stages SET created_at = ? WHERE created_at IS NULL OR created_at = ''").run(now());
  db.prepare("UPDATE pipeline_stages SET sort_order = rowid WHERE sort_order IS NULL").run();
  rebuildLeadsWithoutStageCheck(db);
  seedPipelineStages(db);

  const lessonColumns = tableColumns(db, "lessons");
  addColumn(db, "lessons", lessonColumns, "schedule_id INTEGER REFERENCES schedules(id) ON DELETE SET NULL");
  addColumn(db, "lessons", lessonColumns, "attendance_data TEXT");

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_students_status ON students(status);
    CREATE INDEX IF NOT EXISTS idx_students_balance ON students(balance);
    CREATE INDEX IF NOT EXISTS idx_lessons_schedule_id ON lessons(schedule_id);
    CREATE INDEX IF NOT EXISTS idx_invoices_transactions_tenant_id ON invoices_transactions(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_invoices_transactions_student_id ON invoices_transactions(student_id);
    CREATE INDEX IF NOT EXISTS idx_invoices_transactions_type ON invoices_transactions(type);
    CREATE INDEX IF NOT EXISTS idx_invoices_transactions_invoice_date ON invoices_transactions(invoice_date);
    CREATE INDEX IF NOT EXISTS idx_invoices_transactions_status ON invoices_transactions(tenant_id, status);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_transactions_tenant_idempotency ON invoices_transactions(tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL AND idempotency_key != '';
    CREATE INDEX IF NOT EXISTS idx_payments_tenant_status ON payments(tenant_id, status);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_tenant_idempotency ON payments(tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL AND idempotency_key != '';
    CREATE INDEX IF NOT EXISTS idx_messages_processing_started ON messages(tenant_id, status, processing_started_at);
    CREATE INDEX IF NOT EXISTS idx_leads_stage ON leads(stage);
    CREATE INDEX IF NOT EXISTS idx_leads_responsible_admin ON leads(responsible_admin);
    CREATE INDEX IF NOT EXISTS idx_pipeline_stages_tenant_order ON pipeline_stages(tenant_id, sort_order);
    CREATE INDEX IF NOT EXISTS idx_schedules_tenant_id ON schedules(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_schedules_group_id ON schedules(group_id);
    CREATE INDEX IF NOT EXISTS idx_schedules_teacher_id ON schedules(teacher_id);
    CREATE INDEX IF NOT EXISTS idx_schedules_room_id ON schedules(room_id);
    CREATE INDEX IF NOT EXISTS idx_schedules_weekday ON schedules(weekday);
  `);
}

function backfillWalletLedger(db) {
  if (!tableExists(db, "invoices_transactions")) return;
  const timestamp = now();
  const date = today();
  const students = db.prepare("SELECT id, tenant_id, debt FROM students WHERE debt > 0").all();
  const ledgerCount = db.prepare("SELECT COUNT(*) AS count FROM invoices_transactions WHERE student_id = ?");
  const insertOpeningCharge = db.prepare(
    `INSERT INTO invoices_transactions (tenant_id, student_id, type, amount, description, invoice_date, created_at)
     VALUES (?, ?, 'charge', ?, ?, ?, ?)`,
  );
  db.exec("BEGIN");
  try {
    students.forEach((student) => {
      const existing = ledgerCount.get(student.id).count;
      if (!existing) {
        insertOpeningCharge.run(student.tenant_id, student.id, Number(student.debt || 0), "Boshlang'ich qarz", date, timestamp);
      }
    });
    db.prepare(
      `UPDATE students
       SET balance = COALESCE((
         SELECT SUM(CASE WHEN effect = 'credit' THEN amount WHEN effect = 'debit' THEN -amount WHEN type IN ('payment', 'discount') THEN amount ELSE -amount END)
         FROM invoices_transactions
         WHERE invoices_transactions.student_id = students.id
           AND invoices_transactions.tenant_id = students.tenant_id
           AND COALESCE(invoices_transactions.status, 'active') = 'active'
       ), 0)`,
    ).run();
    db.prepare("UPDATE students SET debt = CASE WHEN balance < 0 THEN ROUND(ABS(balance)) ELSE 0 END").run();
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

module.exports = { getDb };
