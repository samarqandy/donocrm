const TABLE_ORDER = [
  "tenants",
  "teachers",
  "groups",
  "students",
  "student_group_enrollments",
  "lessons",
  "attendance_reasons",
  "finance_periods",
  "attendance",
];

const FINANCIAL_STATUSES = new Set(["unposted", "legacy", "pending", "posted", "reversed"]);
const LESSON_STATUSES = new Set(["waiting", "planned", "completed", "cancelled"]);
const REASON_CODE_BY_STATUS = {
  present: "present",
  absent: "absent_unexcused",
  late: "late",
  excused: "excused",
};

function value(input, fallback = null) {
  return input === undefined || input === null || input === "" ? fallback : input;
}

function timestamp(input, fallback) {
  return value(input, fallback);
}

function json(input) {
  if (input === undefined || input === null || input === "") return null;
  if (typeof input !== "string") return input;
  try {
    return JSON.parse(input);
  } catch (_error) {
    return null;
  }
}

function lessonTimes(row) {
  const range = String(row.time || "").split("-").map((part) => part.trim());
  const start = value(row.start_time, range[0] || "00:00");
  let end = value(row.end_time, range[1] || "00:01");
  if (end <= start) end = start === "23:59" ? "23:59:59" : "23:59";
  return { start, end };
}

function all(db, table, tenantId) {
  return db.prepare(`SELECT * FROM ${table} WHERE tenant_id = ? ORDER BY id`).all(tenantId);
}

function buildAttendanceMigrationRows(db, tenantId) {
  const tenant = db.prepare("SELECT * FROM tenants WHERE id = ?").get(tenantId);
  if (!tenant) throw new Error(`SQLite tenant not found: ${tenantId}`);
  const generatedAt = new Date().toISOString();

  const teachers = all(db, "teachers", tenantId).map((row) => ({
    tenant_id: tenantId,
    id: row.id,
    name: row.name,
    phone: value(row.phone),
    email: value(row.email),
    specialization: value(row.specialization),
    branch_id: value(row.branch_id),
    employment_type: value(row.employment_type, "full_time"),
    status: row.status === "inactive" ? "archived" : value(row.status, "active"),
    hired_at: value(row.hired_at),
    max_weekly_minutes: Number(value(row.max_weekly_minutes, 2400)),
    note: value(row.note),
    created_at: timestamp(row.created_at, generatedAt),
    updated_at: timestamp(row.updated_at, timestamp(row.created_at, generatedAt)),
  }));

  const groups = all(db, "groups", tenantId).map((row) => ({
    tenant_id: tenantId,
    id: row.id,
    name: row.name,
    subject: value(row.subject, row.name),
    teacher_id: row.teacher_id,
    branch_id: value(row.branch_id),
    room: value(row.room),
    monthly_fee: Number(value(row.monthly_fee, 0)),
    active: Boolean(row.active),
    description: value(row.description),
    level: value(row.level),
    capacity: Number(value(row.capacity, 0)),
    start_date: value(row.start_date),
    end_date: value(row.end_date),
    status: value(row.status, row.active ? "active" : "archived"),
    color: value(row.color),
    note: value(row.note),
    archived_at: value(row.archived_at),
    archive_reason: value(row.archive_reason),
    created_at: timestamp(row.created_at, generatedAt),
    updated_at: timestamp(row.updated_at, timestamp(row.created_at, generatedAt)),
  }));

  const students = all(db, "students", tenantId).map((row) => ({
    tenant_id: tenantId,
    id: row.id,
    name: row.name,
    group_id: row.group_id,
    branch_id: value(row.branch_id),
    parent_name: value(row.parent_name, ""),
    phone: value(row.phone),
    phone_normalized: value(row.phone_normalized),
    student_phone: value(row.student_phone),
    email: value(row.email),
    birth_date: value(row.birth_date),
    gender: value(row.gender),
    address: value(row.address),
    source: value(row.source),
    enrollment_date: value(row.enrollment_date),
    telegram_chat_id: value(row.telegram_chat_id),
    debt: Number(value(row.debt, 0)),
    balance: Number(value(row.balance, 0)),
    status: value(row.status, "active"),
    note: value(row.note),
    archived_at: value(row.archived_at),
    archive_reason: value(row.archive_reason),
    created_at: timestamp(row.created_at, generatedAt),
    updated_at: timestamp(row.updated_at, timestamp(row.created_at, generatedAt)),
  }));

  const enrollments = all(db, "student_group_enrollments", tenantId).map((row) => ({
    tenant_id: tenantId,
    id: row.id,
    student_id: row.student_id,
    group_id: row.group_id,
    status: value(row.status, "active"),
    start_date: row.start_date,
    end_date: value(row.end_date),
    reason: value(row.reason),
    created_by: value(row.created_by),
    ended_by: value(row.ended_by),
    created_at: timestamp(row.created_at, generatedAt),
    ended_at: value(row.ended_at),
    updated_at: timestamp(row.ended_at, timestamp(row.created_at, generatedAt)),
  }));

  const lessons = all(db, "lessons", tenantId).map((row) => {
    const times = lessonTimes(row);
    return {
      tenant_id: tenantId,
      id: row.id,
      group_id: row.group_id,
      teacher_id: value(row.teacher_id),
      branch_id: value(row.branch_id),
      date: row.date,
      time: value(row.time, `${times.start} - ${times.end}`),
      start_time: times.start,
      end_time: times.end,
      status: LESSON_STATUSES.has(row.status) ? row.status : "planned",
      schedule_id: value(row.schedule_id),
      attendance_data: json(row.attendance_data),
      lesson_type: value(row.lesson_type, "group"),
      is_trial: Boolean(row.is_trial),
      room_id: value(row.room_id),
      room_name: value(row.room_name),
      occurrence_date: value(row.occurrence_date),
      topic: value(row.topic),
      homework: value(row.homework),
      note: value(row.note),
      cancelled_reason: value(row.cancelled_reason),
      reschedule_reason: value(row.reschedule_reason),
      created_by: value(row.created_by),
      updated_by: value(row.updated_by),
      completed_by: value(row.completed_by),
      cancelled_by: value(row.cancelled_by),
      created_at: timestamp(row.created_at, generatedAt),
      updated_at: timestamp(row.updated_at, timestamp(row.created_at, generatedAt)),
      completed_at: value(row.completed_at),
      cancelled_at: value(row.cancelled_at),
      cancelled_from_status: value(row.cancelled_from_status),
      attendance_version: Number(value(row.attendance_version, 0)),
      version: Math.max(1, Number(value(row.version, 1))),
      financial_status: FINANCIAL_STATUSES.has(row.financial_status) ? row.financial_status : "unposted",
      financial_version: Number(value(row.financial_version, 0)),
      financial_posted_at: value(row.financial_posted_at),
      financial_posted_by: value(row.financial_posted_by),
      financial_reversed_at: value(row.financial_reversed_at),
      financial_reversed_by: value(row.financial_reversed_by),
      financial_reversal_reason: value(row.financial_reversal_reason),
      schedule_series_id: value(row.schedule_series_id),
      occurrence_key: value(row.occurrence_key),
      override_mask: Number(value(row.override_mask, 0)),
      base_schedule_id: value(row.base_schedule_id),
      base_schedule_version: value(row.base_schedule_version),
    };
  });

  const reasons = all(db, "attendance_reasons", tenantId).map((row) => ({
    tenant_id: tenantId,
    id: row.id,
    code: row.code,
    name: row.name,
    attendance_status: row.attendance_status,
    charge_percent: Number(value(row.charge_percent, 100)),
    consume_percent: Number(value(row.consume_percent, 100)),
    is_active: Boolean(row.is_active),
    is_system: Boolean(row.is_system),
    version: Math.max(1, Number(value(row.version, 1))),
    created_at: timestamp(row.created_at, generatedAt),
    updated_at: timestamp(row.updated_at, timestamp(row.created_at, generatedAt)),
  }));

  const financePeriods = all(db, "finance_periods", tenantId).map((row) => ({
    tenant_id: tenantId,
    id: row.id,
    branch_id: value(row.branch_id),
    label: row.label,
    start_date: row.start_date,
    end_date: row.end_date,
    status: value(row.status, "open"),
    closed_by: value(row.closed_by),
    closed_at: value(row.closed_at),
    reopened_by: value(row.reopened_by),
    reopened_at: value(row.reopened_at),
    reopen_reason: value(row.reopened_reason, value(row.reopen_reason)),
    created_at: timestamp(row.created_at, generatedAt),
    updated_at: timestamp(row.updated_at, timestamp(row.created_at, generatedAt)),
  }));

  const lessonVersion = new Map(lessons.map((row) => [row.id, row.attendance_version]));
  const reasonByCode = new Map(reasons.map((row) => [row.code, row]));
  const attendance = all(db, "attendance", tenantId).map((row) => {
    const fallbackReason = reasonByCode.get(REASON_CODE_BY_STATUS[row.status]);
    return {
      tenant_id: tenantId,
      id: row.id,
      lesson_id: row.lesson_id,
      student_id: row.student_id,
      status: row.status,
      reason_id: value(row.reason_id, fallbackReason?.id || null),
      reason_code: value(row.reason_code, fallbackReason?.code || REASON_CODE_BY_STATUS[row.status] || ""),
      reason_name: value(row.reason_name, fallbackReason?.name || ""),
      note: value(row.note, ""),
      charge_percent: Number(value(row.charge_percent, fallbackReason?.charge_percent ?? 0)),
      consume_percent: Number(value(row.consume_percent, fallbackReason?.consume_percent ?? 0)),
      source_version: Number(lessonVersion.get(row.lesson_id) || 0),
      created_at: timestamp(row.created_at, generatedAt),
      updated_at: timestamp(row.updated_at, timestamp(row.created_at, generatedAt)),
    };
  });

  return {
    tenants: [{
      id: tenant.id,
      name: tenant.name,
      type: value(tenant.type, "center"),
      status: value(tenant.status, "active"),
      plan: value(tenant.plan, "pilot"),
      language: value(tenant.language, "uz"),
      domain: value(tenant.domain),
      telegram_bot: value(tenant.telegram_bot),
      telegram_bot_token_encrypted: value(tenant.telegram_bot_token_encrypted),
      telegram_update_offset: Number(value(tenant.telegram_update_offset, 0)),
      suspended_at: value(tenant.suspended_at),
      suspended_reason: value(tenant.suspended_reason),
      created_at: timestamp(tenant.created_at, generatedAt),
      updated_at: timestamp(tenant.updated_at, timestamp(tenant.created_at, generatedAt)),
    }],
    teachers,
    groups,
    students,
    student_group_enrollments: enrollments,
    lessons,
    attendance_reasons: reasons,
    finance_periods: financePeriods,
    attendance,
  };
}

function assertReference(rows, childTable, childColumn, parentTable) {
  const parents = new Set(rows[parentTable].map((row) => row.id));
  const invalid = rows[childTable].filter((row) => row[childColumn] && !parents.has(row[childColumn]));
  if (invalid.length) {
    throw new Error(`${childTable}.${childColumn} has ${invalid.length} orphan reference(s) to ${parentTable}`);
  }
}

function validateRows(rows) {
  assertReference(rows, "groups", "teacher_id", "teachers");
  assertReference(rows, "students", "group_id", "groups");
  assertReference(rows, "student_group_enrollments", "student_id", "students");
  assertReference(rows, "student_group_enrollments", "group_id", "groups");
  assertReference(rows, "lessons", "group_id", "groups");
  assertReference(rows, "lessons", "teacher_id", "teachers");
  assertReference(rows, "attendance", "lesson_id", "lessons");
  assertReference(rows, "attendance", "student_id", "students");
  assertReference(rows, "attendance", "reason_id", "attendance_reasons");
}

async function upsert(client, table, row) {
  const columns = Object.keys(row);
  const conflictColumns = table === "tenants" ? ["id"]
    : table === "attendance" ? ["tenant_id", "lesson_id", "student_id"]
      : ["tenant_id", "id"];
  const updates = columns
    .filter((column) => !conflictColumns.includes(column))
    .map((column) => `${column} = EXCLUDED.${column}`)
    .join(", ");
  const placeholders = columns.map((_column, index) => `$${index + 1}`).join(", ");
  await client.query(`
    INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders})
    ON CONFLICT (${conflictColumns.join(", ")}) DO UPDATE SET ${updates}
  `, columns.map((column) => row[column]));
}

class AttendanceBackfill {
  constructor({ sqlite, postgres }) {
    this.sqlite = sqlite;
    this.postgres = postgres;
  }

  async run(tenantId) {
    const normalizedTenantId = String(tenantId || "").trim();
    if (!normalizedTenantId) throw new Error("tenantId is required");
    const rows = buildAttendanceMigrationRows(this.sqlite, normalizedTenantId);
    validateRows(rows);
    const client = await this.postgres.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL lock_timeout = '5s'");
      await client.query("SET LOCAL statement_timeout = '60s'");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`donocrm:attendance-backfill:${normalizedTenantId}`]);
      for (const table of TABLE_ORDER) {
        for (const row of rows[table]) await upsert(client, table, row);
      }
      await client.query("COMMIT");
      return Object.fromEntries(TABLE_ORDER.map((table) => [table, rows[table].length]));
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = {
  AttendanceBackfill,
  TABLE_ORDER,
  buildAttendanceMigrationRows,
  upsert,
};
