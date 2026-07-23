const { AttendanceQueryRepository } = require("../domain/AttendanceQueryRepository");

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
    reasonId: row.reason_id || row.fallback_reason_id || "",
    reasonCode: row.reason_code || row.fallback_reason_code || "",
    reasonName: row.reason_name || row.fallback_reason_name || "",
    chargePercent: Number(row.charge_percent ?? row.fallback_charge_percent ?? 0),
    consumePercent: Number(row.consume_percent ?? row.fallback_consume_percent ?? 0),
    note: row.note,
    createdAt: row.created_at,
    lessonTime: row.lesson_time,
    lessonDate: row.lesson_date,
  };
}

const RECORDS_SQL = `
  SELECT attendance.*, student.name AS student_name, student.parent_name,
         lesson.group_id, lesson.time AS lesson_time, lesson.date AS lesson_date,
         group_row.name AS group_name, group_row.subject,
         COALESCE(lesson.teacher_id, group_row.teacher_id) AS teacher_id,
         fallback_reason.id AS fallback_reason_id,
         fallback_reason.code AS fallback_reason_code,
         fallback_reason.name AS fallback_reason_name,
         fallback_reason.charge_percent AS fallback_charge_percent,
         fallback_reason.consume_percent AS fallback_consume_percent
  FROM attendance
  JOIN students student
    ON student.tenant_id = attendance.tenant_id AND student.id = attendance.student_id
  JOIN lessons lesson
    ON lesson.tenant_id = attendance.tenant_id AND lesson.id = attendance.lesson_id
  JOIN groups group_row
    ON group_row.tenant_id = lesson.tenant_id AND group_row.id = lesson.group_id
  LEFT JOIN attendance_reasons fallback_reason
    ON fallback_reason.tenant_id = attendance.tenant_id
   AND fallback_reason.code = CASE attendance.status
     WHEN 'present' THEN 'present'
     WHEN 'absent' THEN 'absent_unexcused'
     WHEN 'late' THEN 'late'
     WHEN 'excused' THEN 'excused'
   END
`;

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

function placeholders(ids) {
  return ids.length ? ` AND attendance.student_id IN (${ids.map(() => "?").join(",")})` : "";
}

function groupPlaceholders(ids) {
  return ids.length ? ` AND lesson.group_id IN (${ids.map(() => "?").join(",")})` : "";
}

class SQLiteAttendanceQueryRepository extends AttendanceQueryRepository {
  constructor(db) {
    super();
    this.db = db;
  }

  counts(tenantId) {
    const rows = this.db.prepare(`
      SELECT status, COUNT(*) AS count
      FROM attendance WHERE tenant_id = ? GROUP BY status
    `).all(tenantId);
    const counts = { present: 0, absent: 0, late: 0, excused: 0 };
    for (const row of rows) counts[row.status] = Number(row.count || 0);
    return counts;
  }

  list(tenantId) {
    return this.db.prepare(`${RECORDS_SQL}
      WHERE attendance.tenant_id = ?
      ORDER BY attendance.created_at DESC
    `).all(tenantId).map(mapRecord);
  }

  listForTeacher(tenantId, teacherId) {
    return this.db.prepare(`${RECORDS_SQL}
      WHERE attendance.tenant_id = ?
        AND COALESCE(lesson.teacher_id, group_row.teacher_id) = ?
      ORDER BY attendance.created_at DESC
    `).all(tenantId, teacherId).map(mapRecord);
  }

  studentStats(tenantId, studentIds = []) {
    const ids = [...new Set((studentIds || []).filter(Boolean))];
    const rows = this.db.prepare(`
      SELECT attendance.student_id,
             COUNT(*) AS attendance_total,
             SUM(CASE WHEN attendance.status IN ('present', 'late') THEN 1 ELSE 0 END) AS attendance_present
      FROM attendance
      WHERE attendance.tenant_id = ?${placeholders(ids)}
      GROUP BY attendance.student_id
    `).all(tenantId, ...ids);
    return Object.fromEntries(rows.map((row) => {
      const total = Number(row.attendance_total || 0);
      const present = Number(row.attendance_present || 0);
      return [row.student_id, {
        attendanceTotal: total,
        attendancePresent: present,
        attendanceRate: total ? Math.round((present / total) * 100) : 0,
      }];
    }));
  }

  groupStats(tenantId, groupIds = []) {
    const ids = [...new Set((groupIds || []).filter(Boolean))];
    const rows = this.db.prepare(`
      SELECT lesson.group_id,
             COUNT(*) AS attendance_total,
             SUM(CASE WHEN attendance.status IN ('present', 'late') THEN 1 ELSE 0 END) AS attendance_present
      FROM attendance
      JOIN lessons lesson
        ON lesson.tenant_id = attendance.tenant_id AND lesson.id = attendance.lesson_id
      WHERE attendance.tenant_id = ?${groupPlaceholders(ids)}
      GROUP BY lesson.group_id
    `).all(tenantId, ...ids);
    return Object.fromEntries(rows.map((row) => {
      const total = Number(row.attendance_total || 0);
      const present = Number(row.attendance_present || 0);
      return [row.group_id, {
        attendanceTotal: total,
        attendancePresent: present,
        attendanceRate: total ? Math.round((present / total) * 100) : 0,
      }];
    }));
  }

  studentProfile(tenantId, studentId) {
    const summaryRow = this.db.prepare(`
      SELECT COUNT(*) AS total,
             SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END) AS present,
             SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END) AS absent,
             SUM(CASE WHEN status = 'late' THEN 1 ELSE 0 END) AS late,
             SUM(CASE WHEN status = 'excused' THEN 1 ELSE 0 END) AS excused
      FROM attendance WHERE tenant_id = ? AND student_id = ?
    `).get(tenantId, studentId);
    const records = this.db.prepare(`${RECORDS_SQL}
      WHERE attendance.tenant_id = ? AND attendance.student_id = ?
      ORDER BY lesson.date DESC, lesson.time DESC, attendance.created_at DESC
      LIMIT 100
    `).all(tenantId, studentId).map(mapRecord);
    return { summary: summary(summaryRow), records };
  }

  groupProfile(tenantId, groupId) {
    const summaryRow = this.db.prepare(`
      SELECT COUNT(*) AS total,
             SUM(CASE WHEN attendance.status = 'present' THEN 1 ELSE 0 END) AS present,
             SUM(CASE WHEN attendance.status = 'absent' THEN 1 ELSE 0 END) AS absent,
             SUM(CASE WHEN attendance.status = 'late' THEN 1 ELSE 0 END) AS late,
             SUM(CASE WHEN attendance.status = 'excused' THEN 1 ELSE 0 END) AS excused
      FROM attendance
      JOIN lessons lesson
        ON lesson.tenant_id = attendance.tenant_id AND lesson.id = attendance.lesson_id
      WHERE attendance.tenant_id = ? AND lesson.group_id = ?
    `).get(tenantId, groupId);
    const records = this.db.prepare(`${RECORDS_SQL}
      WHERE attendance.tenant_id = ? AND lesson.group_id = ?
      ORDER BY lesson.date DESC, lesson.time DESC, attendance.created_at DESC
      LIMIT 100
    `).all(tenantId, groupId).map(mapRecord);
    const memberRows = this.db.prepare(`
      SELECT attendance.student_id,
             COUNT(*) AS attendance_total,
             SUM(CASE WHEN attendance.status IN ('present', 'late') THEN 1 ELSE 0 END) AS attendance_present
      FROM attendance
      JOIN lessons lesson
        ON lesson.tenant_id = attendance.tenant_id AND lesson.id = attendance.lesson_id
      WHERE attendance.tenant_id = ? AND lesson.group_id = ?
      GROUP BY attendance.student_id
    `).all(tenantId, groupId);
    const memberStats = Object.fromEntries(memberRows.map((row) => {
      const total = Number(row.attendance_total || 0);
      const present = Number(row.attendance_present || 0);
      return [row.student_id, {
        attendanceTotal: total,
        attendancePresent: present,
        attendanceRate: total ? Math.round((present / total) * 100) : 0,
      }];
    }));
    return { summary: summary(summaryRow), records, memberStats };
  }
}

module.exports = { SQLiteAttendanceQueryRepository };
