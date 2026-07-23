const crypto = require("node:crypto");
const { TABLE_ORDER, buildAttendanceMigrationRows } = require("./AttendanceBackfill");

const VERIFY_COLUMNS = {
  tenants: ["id", "name", "type", "status", "plan", "language", "domain"],
  teachers: ["id", "name", "phone", "email", "specialization", "branch_id", "employment_type", "status", "hired_at", "max_weekly_minutes"],
  groups: ["id", "name", "subject", "teacher_id", "branch_id", "room", "monthly_fee", "active", "level", "capacity", "start_date", "end_date", "status"],
  students: ["id", "name", "group_id", "branch_id", "parent_name", "phone", "phone_normalized", "student_phone", "email", "birth_date", "gender", "enrollment_date", "debt", "balance", "status"],
  student_group_enrollments: ["id", "student_id", "group_id", "status", "start_date", "end_date"],
  lessons: ["id", "group_id", "teacher_id", "branch_id", "date", "time", "start_time", "end_time", "status", "lesson_type", "is_trial", "topic", "homework", "note", "attendance_version", "financial_status", "financial_version"],
  attendance_reasons: ["id", "code", "name", "attendance_status", "charge_percent", "consume_percent", "is_active", "is_system", "version"],
  finance_periods: ["id", "branch_id", "label", "start_date", "end_date", "status"],
  attendance: ["lesson_id", "student_id", "status", "reason_id", "reason_code", "reason_name", "note", "charge_percent", "consume_percent", "source_version"],
};

const NUMERIC_COLUMNS = new Set([
  "max_weekly_minutes", "monthly_fee", "capacity", "debt", "balance",
  "attendance_version", "financial_version", "charge_percent", "consume_percent", "source_version", "version",
]);
const BOOLEAN_COLUMNS = new Set(["active", "is_trial", "is_active", "is_system"]);
const TIME_COLUMNS = new Set(["start_time", "end_time"]);
const DATE_COLUMNS = new Set(["date", "hired_at", "start_date", "end_date", "birth_date", "enrollment_date"]);

function canonicalValue(column, input) {
  if (input === undefined || input === null || input === "") return null;
  if (BOOLEAN_COLUMNS.has(column)) return Boolean(input);
  if (NUMERIC_COLUMNS.has(column)) return Number(input);
  if (TIME_COLUMNS.has(column)) return String(input).slice(0, 5);
  if (DATE_COLUMNS.has(column) && input instanceof Date) {
    const year = input.getFullYear();
    const month = String(input.getMonth() + 1).padStart(2, "0");
    const day = String(input.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  if (input instanceof Date) return input.toISOString();
  return input;
}

function canonicalRows(table, rows) {
  const columns = VERIFY_COLUMNS[table];
  return rows.map((row) => Object.fromEntries(columns.map((column) => [column, canonicalValue(column, row[column])]))).sort((left, right) => {
    const leftKey = table === "attendance" ? `${left.lesson_id}\u0000${left.student_id}` : String(left.id);
    const rightKey = table === "attendance" ? `${right.lesson_id}\u0000${right.student_id}` : String(right.id);
    return leftKey.localeCompare(rightKey);
  });
}

function checksum(table, rows) {
  return crypto.createHash("sha256").update(JSON.stringify(canonicalRows(table, rows))).digest("hex");
}

function sortJson(value) {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortJson(value[key])]));
  }
  return value;
}

function stableJson(value) {
  if (value === undefined || value === null || value === "") return null;
  return sortJson(typeof value === "string" ? JSON.parse(value) : value);
}

function historyChecksum(kind, rows) {
  const normalized = rows.map((row) => kind === "events" ? {
    id: row.id,
    lessonId: row.lesson_id,
    actorUserId: row.actor_user_id || null,
    actorRole: row.actor_role || null,
    action: row.action,
    reason: row.reason || "",
    before: stableJson(row.before_json),
    after: stableJson(row.after_json),
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  } : {
    lessonId: row.lesson_id,
    revisionNo: Number(row.revision_no),
    actorUserId: row.actor_user_id || null,
    actorRole: row.actor_role || null,
    reason: row.reason || "",
    snapshot: stableJson(row.snapshot_json),
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  }).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  return crypto.createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

class AttendanceParityVerifier {
  constructor({ sqlite, postgres }) {
    this.sqlite = sqlite;
    this.postgres = postgres;
  }

  async run(tenantId) {
    const normalizedTenantId = String(tenantId || "").trim();
    if (!normalizedTenantId) throw new Error("tenantId is required");
    const expected = buildAttendanceMigrationRows(this.sqlite, normalizedTenantId);
    const tables = {};
    for (const table of TABLE_ORDER) {
      const { rows: actual } = await this.postgres.query(
        table === "tenants" ? "SELECT * FROM tenants WHERE id = $1" : `SELECT * FROM ${table} WHERE tenant_id = $1`,
        [normalizedTenantId],
      );
      const sqliteChecksum = checksum(table, expected[table]);
      const postgresChecksum = checksum(table, actual);
      tables[table] = {
        sqliteCount: expected[table].length,
        postgresCount: actual.length,
        countMatch: expected[table].length === actual.length,
        sqliteChecksum,
        postgresChecksum,
        checksumMatch: sqliteChecksum === postgresChecksum,
      };
    }

    const orphanChecks = {
      groupsWithoutTeacher: `SELECT COUNT(*)::int AS count FROM groups child LEFT JOIN teachers parent ON parent.tenant_id = child.tenant_id AND parent.id = child.teacher_id WHERE child.tenant_id = $1 AND parent.id IS NULL`,
      studentsWithoutGroup: `SELECT COUNT(*)::int AS count FROM students child LEFT JOIN groups parent ON parent.tenant_id = child.tenant_id AND parent.id = child.group_id WHERE child.tenant_id = $1 AND parent.id IS NULL`,
      enrollmentsWithoutStudent: `SELECT COUNT(*)::int AS count FROM student_group_enrollments child LEFT JOIN students parent ON parent.tenant_id = child.tenant_id AND parent.id = child.student_id WHERE child.tenant_id = $1 AND parent.id IS NULL`,
      enrollmentsWithoutGroup: `SELECT COUNT(*)::int AS count FROM student_group_enrollments child LEFT JOIN groups parent ON parent.tenant_id = child.tenant_id AND parent.id = child.group_id WHERE child.tenant_id = $1 AND parent.id IS NULL`,
      lessonsWithoutGroup: `SELECT COUNT(*)::int AS count FROM lessons child LEFT JOIN groups parent ON parent.tenant_id = child.tenant_id AND parent.id = child.group_id WHERE child.tenant_id = $1 AND parent.id IS NULL`,
      attendanceWithoutLesson: `SELECT COUNT(*)::int AS count FROM attendance child LEFT JOIN lessons parent ON parent.tenant_id = child.tenant_id AND parent.id = child.lesson_id WHERE child.tenant_id = $1 AND parent.id IS NULL`,
      attendanceWithoutStudent: `SELECT COUNT(*)::int AS count FROM attendance child LEFT JOIN students parent ON parent.tenant_id = child.tenant_id AND parent.id = child.student_id WHERE child.tenant_id = $1 AND parent.id IS NULL`,
    };
    const orphans = {};
    for (const [name, sql] of Object.entries(orphanChecks)) {
      const { rows } = await this.postgres.query(sql, [normalizedTenantId]);
      orphans[name] = Number(rows[0].count || 0);
    }

    const history = {};
    for (const [kind, table] of Object.entries({ events: "lesson_events", revisions: "lesson_attendance_revisions" })) {
      const sqliteRows = this.sqlite.prepare(`SELECT * FROM ${table} WHERE tenant_id = ?`).all(normalizedTenantId);
      const { rows: postgresRows } = await this.postgres.query(`SELECT * FROM ${table} WHERE tenant_id = $1`, [normalizedTenantId]);
      const sqliteChecksum = historyChecksum(kind, sqliteRows);
      const postgresChecksum = historyChecksum(kind, postgresRows);
      history[kind] = {
        sqliteCount: sqliteRows.length,
        postgresCount: postgresRows.length,
        countMatch: sqliteRows.length === postgresRows.length,
        sqliteChecksum,
        postgresChecksum,
        checksumMatch: sqliteChecksum === postgresChecksum,
      };
    }

    const { rows: relayRows } = await this.postgres.query(`
      SELECT
        COUNT(*) FILTER (WHERE status IN ('pending', 'processing'))::int AS pending,
        COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
        COALESCE(EXTRACT(EPOCH FROM (NOW() - MIN(created_at) FILTER (WHERE status IN ('pending', 'processing')))), 0)::bigint AS oldest_pending_seconds
      FROM migration_outbox
      WHERE tenant_id = $1 AND aggregate_type IN ('attendance', 'attendance_reason', 'attendance_reference')
        AND source_store = 'postgres' AND target_store = 'sqlite'
    `, [normalizedTenantId]);
    const postgresToSqlite = {
      pending: Number(relayRows[0].pending || 0),
      failed: Number(relayRows[0].failed || 0),
      oldestPendingSeconds: Number(relayRows[0].oldest_pending_seconds || 0),
    };
    const sqliteRelay = this.sqlite.prepare(`
      SELECT
        SUM(CASE WHEN status IN ('pending', 'processing') THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
        MIN(CASE WHEN status IN ('pending', 'processing') THEN created_at END) AS oldest_pending_at
      FROM migration_outbox
      WHERE tenant_id = ? AND aggregate_type IN ('attendance', 'attendance_reason', 'attendance_reference')
        AND source_store = 'sqlite' AND target_store = 'postgres'
    `).get(normalizedTenantId);
    const oldestPendingAt = sqliteRelay.oldest_pending_at ? Date.parse(sqliteRelay.oldest_pending_at) : NaN;
    const sqliteToPostgres = {
      pending: Number(sqliteRelay.pending || 0),
      failed: Number(sqliteRelay.failed || 0),
      oldestPendingSeconds: Number.isFinite(oldestPendingAt)
        ? Math.max(0, Math.floor((Date.now() - oldestPendingAt) / 1000))
        : 0,
    };
    const relay = { sqliteToPostgres, postgresToSqlite };
    const tableParity = Object.values(tables).every((item) => item.countMatch && item.checksumMatch);
    const historyParity = Object.values(history).every((item) => item.countMatch && item.checksumMatch);
    const orphanFree = Object.values(orphans).every((count) => count === 0);
    const relayHealthy = [sqliteToPostgres, postgresToSqlite]
      .every((direction) => direction.pending === 0 && direction.failed === 0);
    return {
      tenantId: normalizedTenantId,
      ok: tableParity && historyParity && orphanFree && relayHealthy,
      verifiedAt: new Date().toISOString(),
      tables,
      history,
      orphans,
      relay,
    };
  }
}

module.exports = { AttendanceParityVerifier, canonicalRows };
