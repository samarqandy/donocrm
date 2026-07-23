const { AttendanceQueryRepository } = require("../domain/AttendanceQueryRepository");

function dateValue(value) {
  if (!value) return "";
  if (!(value instanceof Date)) return String(value).slice(0, 10);
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function timestampValue(value) {
  if (!value) return "";
  return value instanceof Date ? value.toISOString() : String(value);
}

function mapRecord(row) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    lessonId: row.lesson_id,
    studentId: row.student_id,
    studentName: row.student_name,
    parentName: row.parent_name,
    groupId: row.group_id,
    groupName: row.group_name,
    subject: row.subject,
    teacherId: row.teacher_id,
    status: row.status,
    reasonId: row.reason_id || "",
    reasonCode: row.reason_code || "",
    reasonName: row.reason_name || "",
    chargePercent: Number(row.charge_percent || 0),
    consumePercent: Number(row.consume_percent || 0),
    note: row.note || "",
    createdAt: timestampValue(row.created_at),
    lessonTime: row.lesson_time || "",
    lessonDate: dateValue(row.lesson_date),
  };
}

function summary(row) {
  const result = {
    total: Number(row?.total || 0),
    present: Number(row?.present || 0),
    absent: Number(row?.absent || 0),
    late: Number(row?.late || 0),
    excused: Number(row?.excused || 0),
    rate: 0,
  };
  result.rate = result.total ? Math.round(((result.present + result.late) / result.total) * 100) : 0;
  return result;
}

function statsBy(rows, key) {
  return Object.fromEntries(rows.map((row) => {
    const total = Number(row.attendance_total || 0);
    const present = Number(row.attendance_present || 0);
    return [row[key], {
      attendanceTotal: total,
      attendancePresent: present,
      attendanceRate: total ? Math.round((present / total) * 100) : 0,
    }];
  }));
}

const RECORDS_SQL = `
  SELECT attendance.*, student.name AS student_name, student.parent_name,
         lesson.group_id, lesson.time AS lesson_time, lesson.date AS lesson_date,
         group_row.name AS group_name, group_row.subject,
         COALESCE(lesson.teacher_id, group_row.teacher_id) AS teacher_id
  FROM attendance
  JOIN students student
    ON student.tenant_id = attendance.tenant_id AND student.id = attendance.student_id
  JOIN lessons lesson
    ON lesson.tenant_id = attendance.tenant_id AND lesson.id = attendance.lesson_id
  JOIN groups group_row
    ON group_row.tenant_id = lesson.tenant_id AND group_row.id = lesson.group_id
`;

class PostgresAttendanceQueryRepository extends AttendanceQueryRepository {
  constructor(pool) {
    super();
    this.pool = pool;
  }

  async counts(tenantId) {
    const { rows } = await this.pool.query(`
      SELECT status, COUNT(*)::int AS count
      FROM attendance WHERE tenant_id = $1 GROUP BY status
    `, [tenantId]);
    const counts = { present: 0, absent: 0, late: 0, excused: 0 };
    for (const row of rows) counts[row.status] = Number(row.count || 0);
    return counts;
  }

  async list(tenantId) {
    const { rows } = await this.pool.query(`${RECORDS_SQL}
      WHERE attendance.tenant_id = $1
      ORDER BY attendance.created_at DESC
    `, [tenantId]);
    return rows.map(mapRecord);
  }

  async listForTeacher(tenantId, teacherId) {
    const { rows } = await this.pool.query(`${RECORDS_SQL}
      WHERE attendance.tenant_id = $1
        AND COALESCE(lesson.teacher_id, group_row.teacher_id) = $2
      ORDER BY attendance.created_at DESC
    `, [tenantId, teacherId]);
    return rows.map(mapRecord);
  }

  async studentStats(tenantId, studentIds = []) {
    const ids = [...new Set((studentIds || []).filter(Boolean))];
    const { rows } = await this.pool.query(`
      SELECT attendance.student_id,
             COUNT(*)::int AS attendance_total,
             COUNT(*) FILTER (WHERE attendance.status IN ('present', 'late'))::int AS attendance_present
      FROM attendance
      WHERE attendance.tenant_id = $1
        AND (cardinality($2::text[]) = 0 OR attendance.student_id = ANY($2::text[]))
      GROUP BY attendance.student_id
    `, [tenantId, ids]);
    return statsBy(rows, "student_id");
  }

  async groupStats(tenantId, groupIds = []) {
    const ids = [...new Set((groupIds || []).filter(Boolean))];
    const { rows } = await this.pool.query(`
      SELECT lesson.group_id,
             COUNT(*)::int AS attendance_total,
             COUNT(*) FILTER (WHERE attendance.status IN ('present', 'late'))::int AS attendance_present
      FROM attendance
      JOIN lessons lesson
        ON lesson.tenant_id = attendance.tenant_id AND lesson.id = attendance.lesson_id
      WHERE attendance.tenant_id = $1
        AND (cardinality($2::text[]) = 0 OR lesson.group_id = ANY($2::text[]))
      GROUP BY lesson.group_id
    `, [tenantId, ids]);
    return statsBy(rows, "group_id");
  }

  async studentProfile(tenantId, studentId) {
    const [summaryResult, recordsResult] = await Promise.all([
      this.pool.query(`
        SELECT COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE status = 'present')::int AS present,
               COUNT(*) FILTER (WHERE status = 'absent')::int AS absent,
               COUNT(*) FILTER (WHERE status = 'late')::int AS late,
               COUNT(*) FILTER (WHERE status = 'excused')::int AS excused
        FROM attendance WHERE tenant_id = $1 AND student_id = $2
      `, [tenantId, studentId]),
      this.pool.query(`${RECORDS_SQL}
        WHERE attendance.tenant_id = $1 AND attendance.student_id = $2
        ORDER BY lesson.date DESC, lesson.time DESC, attendance.created_at DESC
        LIMIT 100
      `, [tenantId, studentId]),
    ]);
    return { summary: summary(summaryResult.rows[0]), records: recordsResult.rows.map(mapRecord) };
  }

  async groupProfile(tenantId, groupId) {
    const [summaryResult, recordsResult, membersResult] = await Promise.all([
      this.pool.query(`
        SELECT COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE attendance.status = 'present')::int AS present,
               COUNT(*) FILTER (WHERE attendance.status = 'absent')::int AS absent,
               COUNT(*) FILTER (WHERE attendance.status = 'late')::int AS late,
               COUNT(*) FILTER (WHERE attendance.status = 'excused')::int AS excused
        FROM attendance
        JOIN lessons lesson
          ON lesson.tenant_id = attendance.tenant_id AND lesson.id = attendance.lesson_id
        WHERE attendance.tenant_id = $1 AND lesson.group_id = $2
      `, [tenantId, groupId]),
      this.pool.query(`${RECORDS_SQL}
        WHERE attendance.tenant_id = $1 AND lesson.group_id = $2
        ORDER BY lesson.date DESC, lesson.time DESC, attendance.created_at DESC
        LIMIT 100
      `, [tenantId, groupId]),
      this.pool.query(`
        SELECT attendance.student_id,
               COUNT(*)::int AS attendance_total,
               COUNT(*) FILTER (WHERE attendance.status IN ('present', 'late'))::int AS attendance_present
        FROM attendance
        JOIN lessons lesson
          ON lesson.tenant_id = attendance.tenant_id AND lesson.id = attendance.lesson_id
        WHERE attendance.tenant_id = $1 AND lesson.group_id = $2
        GROUP BY attendance.student_id
      `, [tenantId, groupId]),
    ]);
    return {
      summary: summary(summaryResult.rows[0]),
      records: recordsResult.rows.map(mapRecord),
      memberStats: statsBy(membersResult.rows, "student_id"),
    };
  }
}

module.exports = { PostgresAttendanceQueryRepository };
