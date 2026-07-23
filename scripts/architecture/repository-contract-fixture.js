const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { Pool } = require("pg");
const { schema: sqliteSchema } = require("../../src/db/schema");
const sqliteOutboxMigration = require("../../src/db/migrations/20260715_zz_attendance_migration_outbox");
const sqliteInboxMigration = require("../../src/db/migrations/20260715_zzz_attendance_migration_inbox");
const sqliteReferenceOutboxMigration = require("../../src/db/migrations/20260715_zzzzz_attendance_reference_outbox");
const sqliteLessonEventReferenceMigration = require("../../src/db/migrations/20260715_zzzzzz_attendance_lesson_event_reference");
const { CONTRACT_FIXTURE } = require("./repository-contract-fixture-data");

const POSTGRES_MIGRATIONS = path.resolve(__dirname, "../../src/infrastructure/database/postgres/migrations");
const SCHEMA_PREFIX = "repository_contract_fixture_";

const BOOLEAN_KEYS = new Set([
  "active", "isActive", "isEmergency", "isMain", "isPrimary", "isRecurring",
  "isSystem", "isTrial", "receivesNotifications",
]);
const NUMBER_KEYS = new Set([
  "amount", "attendanceRevisionNo", "attendanceVersion", "balance", "baseAmount",
  "billingPolicyVersion", "capacity", "chargePercent", "consumePercent", "debt",
  "financialVersion", "id", "maxWeeklyMinutes", "monthlyFee", "revisionNo",
  "scheduleId", "sourceVersion", "teacherRateRuleVersion", "version",
]);
const JSON_KEYS = new Set(["snapshotJson"]);
const DATE_KEYS = new Set([
  "birthDate", "date", "endDate", "enrollmentDate", "financeEnd", "financeStart",
  "hiredAt", "invoiceDate", "lessonDate", "postingDate", "serviceDate", "startDate",
  "validFrom", "validUntil",
]);
const TIME_KEYS = new Set(["endTime", "startTime"]);

const TABLE_SPECS = [
  {
    key: "tenant",
    table: "tenants",
    rows: (seed) => [seed.tenant],
    sqlite: ["id", "name", "domain", "type", "status", "plan", "language", "createdAt"],
    postgres: ["id", "name", "domain", "type", "status", "plan", "language", "createdAt", "updatedAt"],
    compare: ["id", "name", "domain", "type", "status", "plan", "language", "createdAt"],
  },
  {
    key: "branches", table: "branches", rows: (seed) => seed.branches,
    sqlite: ["id", "tenantId", "name", "status", "isMain", "createdAt"],
    postgres: ["id", "tenantId", "name", "status", "isMain", "createdAt"],
  },
  {
    key: "teachers", table: "teachers", rows: (seed) => seed.teachers,
    sqlite: ["id", "tenantId", "name", "branchId", "phone", "email", "specialization", "employmentType", "status", "hiredAt", "maxWeeklyMinutes", "note", "createdAt"],
    postgres: ["id", "tenantId", "name", "branchId", "phone", "email", "specialization", "employmentType", "status", "hiredAt", "maxWeeklyMinutes", "note", "createdAt", "updatedAt"],
    compare: ["id", "tenantId", "name", "branchId", "phone", "email", "specialization", "employmentType", "status", "hiredAt", "maxWeeklyMinutes", "note", "createdAt"],
  },
  {
    key: "groups", table: "groups", rows: (seed) => seed.groups,
    sqlite: ["id", "tenantId", "branchId", "name", "subject", "teacherId", "room", "monthlyFee", "active", "description", "level", "capacity", "startDate", "endDate", "status", "color", "note", "archivedAt", "archiveReason", "createdAt", "updatedAt"],
    postgres: ["id", "tenantId", "branchId", "name", "subject", "teacherId", "room", "monthlyFee", "active", "description", "level", "capacity", "startDate", "endDate", "status", "color", "note", "archivedAt", "archiveReason", "createdAt", "updatedAt"],
  },
  {
    key: "students", table: "students", rows: (seed) => seed.students,
    sqlite: ["id", "tenantId", "branchId", "name", "groupId", "parentName", "phone", "phoneNormalized", "studentPhone", "email", "birthDate", "gender", "address", "source", "enrollmentDate", "note", "archivedAt", "archiveReason", "telegramChatId", "debt", "balance", "status", "createdAt", "updatedAt"],
    postgres: ["id", "tenantId", "branchId", "name", "groupId", "parentName", "phone", "phoneNormalized", "studentPhone", "email", "birthDate", "gender", "address", "source", "enrollmentDate", "note", "archivedAt", "archiveReason", "telegramChatId", "debt", "balance", "status", "createdAt", "updatedAt"],
  },
  {
    key: "guardians", table: "guardians", rows: (seed) => seed.guardians,
    sqlite: ["id", "tenantId", "name", "phone", "phoneNormalized", "email", "telegramChatId", "preferredLanguage", "status", "createdAt", "updatedAt"],
    postgres: ["id", "tenantId", "name", "phone", "phoneNormalized", "email", "telegramChatId", "preferredLanguage", "status", "createdAt", "updatedAt"],
  },
  {
    key: "studentGuardians", table: "student_guardians", rows: (seed) => seed.studentGuardians,
    sqlite: ["id", "tenantId", "studentId", "guardianId", "relationship", "isPrimary", "isEmergency", "receivesNotifications", "createdAt"],
    postgres: ["id", "tenantId", "studentId", "guardianId", "relationship", "isPrimary", "isEmergency", "receivesNotifications", "createdAt"],
  },
  {
    key: "enrollments", table: "student_group_enrollments", rows: (seed) => seed.enrollments,
    sqlite: ["id", "tenantId", "studentId", "groupId", "status", "startDate", "endDate", "reason", "createdBy", "endedBy", "endedAt", "createdAt"],
    postgres: ["id", "tenantId", "studentId", "groupId", "status", "startDate", "endDate", "reason", "createdBy", "endedBy", "endedAt", "createdAt", "updatedAt"],
    compare: ["id", "tenantId", "studentId", "groupId", "status", "startDate", "endDate", "reason", "createdBy", "endedBy", "endedAt", "createdAt"],
  },
  {
    key: "invoiceTransactions", table: "invoices_transactions", rows: (seed) => seed.invoiceTransactions,
    sqlite: ["id", "tenantId", "studentId", "branchId", "type", "amount", "description", "invoiceDate", "createdAt", "status", "effect", "currency"],
    postgres: ["id", "tenantId", "studentId", "branchId", "type", "amount", "description", "invoiceDate", "createdAt", "status", "effect", "currency"],
  },
  {
    key: "schedules", table: "schedules", rows: (seed) => seed.schedules,
    sqlite: ["id", "tenantId", "branchId", "groupId", "teacherId", "weekday", "startTime", "endTime", "isRecurring", "lessonType", "createdAt", "validFrom", "validUntil", "status", "updatedAt", "seriesId", "version"],
    postgres: ["id", "tenantId", "branchId", "groupId", "teacherId", "weekday", "startTime", "endTime", "isRecurring", "lessonType", "createdAt", "validFrom", "validUntil", "status", "updatedAt", "seriesId", "version"],
  },
  {
    key: "lessons", table: "lessons", rows: (seed) => seed.lessons,
    sqlite: ["id", "tenantId", "branchId", "groupId", "teacherId", "scheduleId", "date", "time", "startTime", "endTime", "status", "lessonType", "isTrial", "topic", "homework", "note", "createdBy", "updatedBy", "completedBy", "createdAt", "updatedAt", "completedAt", "attendanceVersion", "version", "financialStatus", "financialVersion"],
    postgres: ["id", "tenantId", "branchId", "groupId", "teacherId", "scheduleId", "date", "time", "startTime", "endTime", "status", "lessonType", "isTrial", "topic", "homework", "note", "createdBy", "updatedBy", "completedBy", "createdAt", "updatedAt", "completedAt", "attendanceVersion", "version", "financialStatus", "financialVersion"],
  },
  {
    key: "reasons", table: "attendance_reasons", rows: (seed) => seed.reasons,
    sqlite: ["id", "tenantId", "code", "name", "attendanceStatus", "chargePercent", "consumePercent", "isActive", "isSystem", "version", "createdAt", "updatedAt"],
    postgres: ["id", "tenantId", "code", "name", "attendanceStatus", "chargePercent", "consumePercent", "isActive", "isSystem", "version", "createdAt", "updatedAt"],
  },
  {
    key: "attendance", table: "attendance", rows: (seed) => seed.attendance,
    sqlite: ["id", "tenantId", "lessonId", "studentId", "status", "reasonId", "reasonCode", "reasonName", "chargePercent", "consumePercent", "note", "createdAt"],
    postgres: ["id", "tenantId", "lessonId", "studentId", "status", "reasonId", "reasonCode", "reasonName", "chargePercent", "consumePercent", "note", "sourceVersion", "createdAt", "updatedAt"],
    compare: ["id", "tenantId", "lessonId", "studentId", "status", "reasonId", "reasonCode", "reasonName", "chargePercent", "consumePercent", "note", "createdAt"],
  },
  {
    key: "revisions", table: "lesson_attendance_revisions", rows: (seed) => seed.revisions,
    sqlite: ["id", "tenantId", "lessonId", "revisionNo", "actorUserId", "actorRole", "reason", "snapshotJson", "createdAt"],
    postgres: ["id", "tenantId", "lessonId", "revisionNo", "actorUserId", "actorRole", "reason", "snapshotJson", "createdAt", "updatedAt"],
    compare: ["id", "tenantId", "lessonId", "revisionNo", "actorUserId", "actorRole", "reason", "snapshotJson", "createdAt"],
  },
  {
    key: "financePeriods", table: "finance_periods", rows: (seed) => seed.financePeriods,
    sqlite: ["id", "tenantId", "branchId", "label", "startDate", "endDate", "status", "closedBy", "closedAt", "createdAt", "updatedAt"],
    postgres: ["id", "tenantId", "branchId", "label", "startDate", "endDate", "status", "closedBy", "closedAt", "createdAt", "updatedAt"],
  },
  {
    key: "billingPolicies", table: "lesson_billing_policies", rows: (seed) => seed.billingPolicies,
    sqlite: ["id", "tenantId", "branchId", "groupId", "name", "billingMode", "status", "baseAmount", "currency", "validFrom", "validUntil", "version", "createdBy", "createdAt", "updatedBy", "updatedAt"],
    postgres: ["id", "tenantId", "branchId", "groupId", "name", "billingMode", "status", "baseAmount", "currency", "validFrom", "validUntil", "version", "createdBy", "createdAt", "updatedBy", "updatedAt"],
  },
  {
    key: "settlements", table: "lesson_financial_settlements", rows: (seed) => seed.settlements,
    sqlite: ["id", "tenantId", "branchId", "lessonId", "attendanceRevisionNo", "status", "serviceDate", "postingDate", "currency", "billingPolicyId", "billingPolicyVersion", "teacherRateRuleId", "teacherRateRuleVersion", "confirmedBy", "confirmedAt", "reversedBy", "reversedAt", "reversalReason", "version", "idempotencyKey", "requestFingerprint"],
    postgres: ["id", "tenantId", "branchId", "lessonId", "attendanceRevisionNo", "status", "serviceDate", "postingDate", "currency", "billingPolicyId", "billingPolicyVersion", "teacherRateRuleId", "teacherRateRuleVersion", "confirmedBy", "confirmedAt", "reversedBy", "reversedAt", "reversalReason", "version", "idempotencyKey", "requestFingerprint"],
  },
].map((spec) => Object.freeze({ ...spec, compare: spec.compare || spec.sqlite }));

function snake(value) {
  return value.replace(/[A-Z]/g, (character) => `_${character.toLowerCase()}`);
}

function safeSchemaName(value) {
  if (!new RegExp(`^${SCHEMA_PREFIX}[a-z0-9_]+$`).test(value)) {
    throw new Error(`Unsafe repository contract schema name: ${value}`);
  }
  return value;
}

function schemaName() {
  return safeSchemaName(`${SCHEMA_PREFIX}${process.pid}_${crypto.randomBytes(6).toString("hex")}`);
}

function quoteIdentifier(value) {
  return `"${safeSchemaName(value)}"`;
}

function sqliteValue(value) {
  if (typeof value === "boolean") return value ? 1 : 0;
  if (Array.isArray(value) || (value && typeof value === "object")) return JSON.stringify(value);
  return value;
}

function postgresValue(value) {
  if (Array.isArray(value) || (value && typeof value === "object" && !(value instanceof Date))) {
    return JSON.stringify(value);
  }
  return value;
}

function insertSQLiteRows(db, table, rows, columns) {
  if (!rows.length) return;
  const names = columns.map(snake);
  const insert = db.prepare(`INSERT INTO ${table} (${names.join(", ")}) VALUES (${names.map(() => "?").join(", ")})`);
  for (const row of rows) insert.run(...columns.map((column) => sqliteValue(row[column])));
}

async function insertPostgresRows(client, table, rows, columns) {
  if (!rows.length) return;
  const names = columns.map(snake);
  const placeholders = columns.map((_column, index) => `$${index + 1}`).join(", ");
  for (const row of rows) {
    await client.query(
      `INSERT INTO ${table} (${names.join(", ")}) VALUES (${placeholders})`,
      columns.map((column) => postgresValue(row[column])),
    );
  }
}

function seedSQLite(db, seed = CONTRACT_FIXTURE) {
  db.exec("BEGIN IMMEDIATE");
  try {
    for (const spec of TABLE_SPECS) {
      insertSQLiteRows(db, spec.table, spec.rows(seed), spec.sqlite);
      if (spec.key === "tenant") {
        // The production SQLite schema seeds wall-clock-based system reasons from
        // an AFTER INSERT trigger. Replace them inside the same fixture transaction
        // so both stores receive only the deterministic canonical reason rows.
        db.prepare("DELETE FROM attendance_reasons WHERE tenant_id = ?").run(seed.context.tenantId);
      }
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

async function seedPostgres(pool, seed = CONTRACT_FIXTURE) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const spec of TABLE_SPECS) await insertPostgresRows(client, spec.table, spec.rows(seed), spec.postgres);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function createSQLiteContractStore(seed = CONTRACT_FIXTURE) {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(sqliteSchema);
    sqliteOutboxMigration.up(db);
    sqliteInboxMigration.up(db);
    sqliteReferenceOutboxMigration.up(db);
    sqliteLessonEventReferenceMigration.up(db);
    seedSQLite(db, seed);
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

function postgresSupplementalSchema() {
  return `
    CREATE TABLE branches (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, name TEXT NOT NULL,
      status TEXT NOT NULL, is_main BOOLEAN NOT NULL, created_at TIMESTAMPTZ NOT NULL
    );
    CREATE TABLE guardians (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, name TEXT NOT NULL, phone TEXT,
      phone_normalized TEXT, email TEXT, telegram_chat_id TEXT, preferred_language TEXT NOT NULL,
      status TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL
    );
    CREATE TABLE student_guardians (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, student_id TEXT NOT NULL, guardian_id TEXT NOT NULL,
      relationship TEXT NOT NULL, is_primary BOOLEAN NOT NULL, is_emergency BOOLEAN NOT NULL,
      receives_notifications BOOLEAN NOT NULL, created_at TIMESTAMPTZ NOT NULL
    );
    CREATE TABLE invoices_transactions (
      id BIGINT PRIMARY KEY, tenant_id TEXT NOT NULL, student_id TEXT NOT NULL, branch_id TEXT,
      type TEXT NOT NULL, amount NUMERIC(18,2) NOT NULL, description TEXT, invoice_date DATE NOT NULL,
      created_at TIMESTAMPTZ NOT NULL, status TEXT NOT NULL, effect TEXT, currency TEXT NOT NULL
    );
    CREATE TABLE schedules (
      id BIGINT PRIMARY KEY, tenant_id TEXT NOT NULL, branch_id TEXT, group_id TEXT NOT NULL,
      teacher_id TEXT, weekday TEXT NOT NULL, start_time TIME NOT NULL, end_time TIME NOT NULL,
      is_recurring BOOLEAN NOT NULL, lesson_type TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL,
      valid_from DATE, valid_until DATE, status TEXT NOT NULL, updated_at TIMESTAMPTZ NOT NULL,
      series_id TEXT, version BIGINT NOT NULL
    );
    CREATE TABLE lesson_billing_policies (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, branch_id TEXT, group_id TEXT, name TEXT NOT NULL,
      billing_mode TEXT NOT NULL, status TEXT NOT NULL, base_amount NUMERIC(18,2) NOT NULL,
      currency TEXT NOT NULL, valid_from DATE NOT NULL, valid_until DATE, version BIGINT NOT NULL,
      created_by TEXT, created_at TIMESTAMPTZ NOT NULL, updated_by TEXT, updated_at TIMESTAMPTZ NOT NULL
    );
    CREATE TABLE lesson_financial_settlements (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, branch_id TEXT, lesson_id TEXT NOT NULL,
      attendance_revision_no BIGINT NOT NULL, status TEXT NOT NULL, service_date DATE NOT NULL,
      posting_date DATE NOT NULL, currency TEXT NOT NULL, billing_policy_id TEXT NOT NULL,
      billing_policy_version BIGINT NOT NULL, teacher_rate_rule_id TEXT,
      teacher_rate_rule_version BIGINT, confirmed_by TEXT NOT NULL, confirmed_at TIMESTAMPTZ NOT NULL,
      reversed_by TEXT, reversed_at TIMESTAMPTZ, reversal_reason TEXT, version BIGINT NOT NULL,
      idempotency_key TEXT NOT NULL, request_fingerprint TEXT NOT NULL
    );
  `;
}

async function applyPostgresSchema(pool) {
  const files = fs.readdirSync(POSTGRES_MIGRATIONS).filter((file) => file.endsWith(".sql")).sort();
  for (const file of files) await pool.query(fs.readFileSync(path.join(POSTGRES_MIGRATIONS, file), "utf8"));
  await pool.query(postgresSupplementalSchema());
  return files;
}

function resolveDatabaseOptions(options = {}) {
  const databaseUrl = String(options.databaseUrl || process.env.ARCHITECTURE_TEST_DATABASE_URL || "").trim();
  const explicitlyAllowed = options.allowDatabase === true || process.env.ARCHITECTURE_CONTRACT_ALLOW_DATABASE === "true";
  if (!databaseUrl) throw new Error("ARCHITECTURE_TEST_DATABASE_URL is required for the PostgreSQL contract fixture");
  if (!/^postgres(?:ql)?:\/\//.test(databaseUrl)) throw new Error("ARCHITECTURE_TEST_DATABASE_URL must be a PostgreSQL URL");
  if (!explicitlyAllowed) {
    throw new Error("Set ARCHITECTURE_CONTRACT_ALLOW_DATABASE=true to allow an isolated PostgreSQL fixture schema");
  }
  const runtimeUrl = String(process.env.DATABASE_URL || "").trim();
  const sharedAllowed = options.allowSharedDatabase === true || process.env.ARCHITECTURE_CONTRACT_ALLOW_SHARED_DATABASE === "true";
  if (runtimeUrl && runtimeUrl === databaseUrl && !sharedAllowed) {
    throw new Error("The fixture database matches DATABASE_URL; set ARCHITECTURE_CONTRACT_ALLOW_SHARED_DATABASE=true only for an approved test database");
  }
  return { databaseUrl };
}

function createAdapters(sqlite, postgres) {
  const { SQLiteAttendanceRepository } = require("../../src/modules/attendance/infrastructure/SQLiteAttendanceRepository");
  const { PostgresAttendanceRepository } = require("../../src/modules/attendance/infrastructure/PostgresAttendanceRepository");
  const { SQLiteAttendanceQueryRepository } = require("../../src/modules/attendance/infrastructure/SQLiteAttendanceQueryRepository");
  const { PostgresAttendanceQueryRepository } = require("../../src/modules/attendance/infrastructure/PostgresAttendanceQueryRepository");
  const sqliteCommand = new SQLiteAttendanceRepository(sqlite);
  return {
    sqlite: {
      command: sqliteCommand,
      query: new SQLiteAttendanceQueryRepository(sqlite),
    },
    postgres: {
      command: new PostgresAttendanceRepository(postgres, {
        financeGuard: sqliteCommand,
        lessonReferenceReader: sqliteCommand,
      }),
      query: new PostgresAttendanceQueryRepository(postgres),
    },
  };
}

async function createRepositoryContractFixture(options = {}) {
  const { databaseUrl } = resolveDatabaseOptions(options);
  const seed = options.seed || CONTRACT_FIXTURE;
  const isolatedSchema = schemaName();
  const control = new Pool({ connectionString: databaseUrl, max: 1 });
  let sqlite;
  let postgres;
  let cleaned = false;
  try {
    await control.query(`CREATE SCHEMA ${quoteIdentifier(isolatedSchema)}`);
    postgres = new Pool({
      connectionString: databaseUrl,
      max: 4,
      // The schema is disposable and is dropped after every contract run.
      // Avoid host/docker fsync latency from turning deterministic fixtures
      // into multi-minute suites; production connections keep durable commits.
      options: `-c search_path=${isolatedSchema},public -c synchronous_commit=off`,
    });
    await applyPostgresSchema(postgres);
    sqlite = createSQLiteContractStore(seed);
    await seedPostgres(postgres, seed);
  } catch (error) {
    if (postgres) await postgres.end().catch(() => {});
    if (sqlite) sqlite.close();
    await control.query(`DROP SCHEMA IF EXISTS ${quoteIdentifier(isolatedSchema)} CASCADE`).catch(() => {});
    await control.end().catch(() => {});
    throw error;
  }

  async function cleanup() {
    if (cleaned) return { schemaDropped: true, alreadyClean: true };
    cleaned = true;
    sqlite.close();
    await postgres.end();
    await control.query(`DROP SCHEMA ${quoteIdentifier(isolatedSchema)} CASCADE`);
    const { rows } = await control.query(
      "SELECT EXISTS(SELECT 1 FROM information_schema.schemata WHERE schema_name = $1) AS exists",
      [isolatedSchema],
    );
    await control.end();
    return { schemaDropped: !rows[0].exists, alreadyClean: false };
  }

  return {
    seed,
    context: seed.context,
    sqlite,
    postgres,
    postgresSchema: isolatedSchema,
    postgresMigrations: fs.readdirSync(POSTGRES_MIGRATIONS).filter((file) => file.endsWith(".sql")).sort(),
    adapters: createAdapters(sqlite, postgres),
    cleanup,
  };
}

async function withRepositoryContractFixture(callback, options = {}) {
  const fixture = await createRepositoryContractFixture(options);
  try {
    return await callback(fixture);
  } finally {
    await fixture.cleanup();
  }
}

function localDate(value) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function canonicalValue(key, value) {
  if (value === undefined || value === null) return null;
  if (JSON_KEYS.has(key)) {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return canonicalObject(parsed);
  }
  if (DATE_KEYS.has(key)) return value instanceof Date ? localDate(value) : String(value).slice(0, 10);
  if (TIME_KEYS.has(key)) return String(value).slice(0, 5);
  if (value instanceof Date) return value.toISOString();
  if (BOOLEAN_KEYS.has(key)) return Boolean(value);
  if (NUMBER_KEYS.has(key)) return Number(value);
  return value;
}

function canonicalObject(value) {
  if (Array.isArray(value)) return value.map(canonicalObject);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalObject(value[key])]));
  }
  return value;
}

function canonicalRows(rows, columns) {
  return rows.map((row) => Object.fromEntries(columns.map((column) => [column, canonicalValue(column, row[column])]))).sort((left, right) => {
    const leftKey = String(left.id ?? `${left.tenantId}\0${left.lessonId}\0${left.studentId}`);
    const rightKey = String(right.id ?? `${right.tenantId}\0${right.lessonId}\0${right.studentId}`);
    return leftKey.localeCompare(rightKey);
  });
}

function readSQLiteSpec(db, spec) {
  const columns = spec.compare.map((column) => `${snake(column)} AS ${column}`);
  return canonicalRows(db.prepare(`SELECT ${columns.join(", ")} FROM ${spec.table}`).all(), spec.compare);
}

async function readPostgresSpec(pool, spec) {
  const columns = spec.compare.map((column) => `${snake(column)} AS "${column}"`);
  const { rows } = await pool.query(`SELECT ${columns.join(", ")} FROM ${spec.table}`);
  return canonicalRows(rows, spec.compare);
}

function expectedSpec(seed, spec) {
  return canonicalRows(spec.rows(seed), spec.compare);
}

function digest(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function fixtureParityReport(fixture) {
  const tables = {};
  let ok = true;
  for (const spec of TABLE_SPECS) {
    const expected = expectedSpec(fixture.seed, spec);
    const sqlite = readSQLiteSpec(fixture.sqlite, spec);
    const postgres = await readPostgresSpec(fixture.postgres, spec);
    const sqliteMatch = JSON.stringify(sqlite) === JSON.stringify(expected);
    const postgresMatch = JSON.stringify(postgres) === JSON.stringify(expected);
    const storesMatch = JSON.stringify(sqlite) === JSON.stringify(postgres);
    tables[spec.key] = {
      rows: expected.length,
      sqliteMatch,
      postgresMatch,
      storesMatch,
      expectedHash: digest(expected),
      sqliteHash: digest(sqlite),
      postgresHash: digest(postgres),
    };
    if (!sqliteMatch || !postgresMatch || !storesMatch) ok = false;
  }
  return {
    ok,
    tenantId: fixture.context.tenantId,
    branchId: fixture.context.branchId,
    deterministicDate: fixture.context.lessonDate,
    tables,
  };
}

module.exports = {
  CONTRACT_FIXTURE,
  TABLE_SPECS,
  createRepositoryContractFixture,
  createSQLiteContractStore,
  fixtureParityReport,
  withRepositoryContractFixture,
};
