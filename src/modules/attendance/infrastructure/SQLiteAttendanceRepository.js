const { AttendanceRepository } = require("../domain/AttendanceRepository");
const { DomainError } = require("../../../core/errors/DomainError");
const { id } = require("../../../utils/id");

function mapLesson(row) {
  if (!row) return null;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    branchId: row.branch_id || "",
    groupId: row.group_id,
    teacherId: row.effective_teacher_id || row.teacher_id || "",
    date: row.date,
    status: row.status === "waiting" ? "planned" : row.status,
    attendanceVersion: Number(row.attendance_version || 0),
    financialStatus: row.financial_status || "unposted",
    topic: row.topic || "",
    homework: row.homework || "",
    note: row.note || "",
    version: Number(row.version || 1),
  };
}

function mapReason(row) {
  if (!row) return null;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    code: row.code,
    name: row.name,
    attendanceStatus: row.attendance_status,
    chargePercent: Number(row.charge_percent || 0),
    consumePercent: Number(row.consume_percent || 0),
    isActive: Boolean(row.is_active),
    isSystem: Boolean(row.is_system),
    version: Number(row.version || 1),
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
  };
}

function mapStudent(row) {
  const attendanceTotal = Number(row.attendance_total || 0);
  const attendancePresent = Number(row.attendance_present || 0);
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    groupId: row.group_id,
    groupName: row.group_name || "",
    parentName: row.parent_name || "",
    parentRelationship: row.parent_relationship || "guardian",
    parentEmail: row.parent_email || "",
    phone: row.phone || "",
    studentPhone: row.student_phone || "",
    email: row.email || "",
    birthDate: row.birth_date || "",
    gender: row.gender || "",
    address: row.address || "",
    source: row.source || "",
    enrollmentDate: row.enrollment_date || "",
    note: row.note || "",
    archivedAt: row.archived_at || "",
    archiveReason: row.archive_reason || "",
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
    telegramChatId: row.effective_telegram_chat_id || row.telegram_chat_id || "",
    debt: Number(row.debt || 0),
    balance: Number(row.ledger_balance ?? row.balance ?? 0),
    status: row.status || "active",
    attendanceTotal,
    attendancePresent,
    attendanceRate: attendanceTotal ? Math.round((attendancePresent / attendanceTotal) * 100) : 0,
    attendanceStatus: row.attendance_status || "",
    attendanceReasonId: row.attendance_reason_id || "",
    attendanceReasonCode: row.attendance_reason_code || "",
    attendanceReasonName: row.attendance_reason_name || "",
    attendanceNote: row.attendance_note || "",
  };
}

function mapAttendance(row) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    lessonId: row.lesson_id,
    studentId: row.student_id,
    studentName: row.student_name || "",
    status: row.status,
    reasonId: row.reason_id || "",
    reasonCode: row.reason_code || "",
    reasonName: row.reason_name || "",
    chargePercent: Number(row.charge_percent || 0),
    consumePercent: Number(row.consume_percent || 0),
    note: row.note || "",
    createdAt: row.created_at,
  };
}

function attendanceSnapshot(rows) {
  return rows.map((row) => ({
    studentId: row.studentId,
    status: row.status,
    reasonId: row.reasonId || "",
    reasonCode: row.reasonCode || "",
    reasonName: row.reasonName || "",
    chargePercent: Number(row.chargePercent || 0),
    consumePercent: Number(row.consumePercent || 0),
    note: row.note || "",
  })).sort((left, right) => left.studentId.localeCompare(right.studentId));
}

function lessonSnapshot(lesson) {
  if (!lesson) return null;
  return {
    date: lesson.date,
    status: lesson.status,
    attendanceVersion: Number(lesson.attendanceVersion || 0),
    financialStatus: lesson.financialStatus || "unposted",
    topic: lesson.topic || "",
    homework: lesson.homework || "",
    note: lesson.note || "",
    version: Number(lesson.version || 1),
  };
}

function isAttendanceReasonCodeConflict(error) {
  return String(error?.code || "").startsWith("SQLITE_CONSTRAINT")
    || (
      error?.code === "ERR_SQLITE_ERROR"
      && /UNIQUE constraint failed:\s*attendance_reasons\.tenant_id,\s*attendance_reasons\.code/i.test(
        String(error.message || ""),
      )
    );
}

class SQLiteAttendanceRepository extends AttendanceRepository {
  constructor(db, {
    idGenerator = id,
    clock = () => new Date().toISOString(),
  } = {}) {
    super();
    this.db = db;
    this.idGenerator = idGenerator;
    this.clock = clock;
    this.storeName = "sqlite";
  }

  resolveEffectiveTeacher(tenantId, { teacherId = "", scheduleId = null, groupId }) {
    if (teacherId) return teacherId;
    const row = this.db.prepare(`
      SELECT COALESCE(schedule.teacher_id, group_row.teacher_id) AS effective_teacher_id
      FROM groups group_row
      LEFT JOIN schedules schedule
        ON schedule.tenant_id = group_row.tenant_id AND schedule.id = ?
      WHERE group_row.tenant_id = ? AND group_row.id = ?
      LIMIT 1
    `).get(scheduleId, tenantId, groupId);
    return row ? row.effective_teacher_id || "" : null;
  }

  findLesson(tenantId, lessonId) {
    const row = this.db.prepare(`
      SELECT lesson.*,
             COALESCE(lesson.teacher_id, schedule.teacher_id, group_row.teacher_id) AS effective_teacher_id
      FROM lessons lesson
      JOIN groups group_row
        ON group_row.tenant_id = lesson.tenant_id AND group_row.id = lesson.group_id
      LEFT JOIN schedules schedule
        ON schedule.tenant_id = lesson.tenant_id AND schedule.id = lesson.schedule_id
      WHERE lesson.tenant_id = ? AND lesson.id = ? LIMIT 1
    `).get(tenantId, lessonId);
    return mapLesson(row);
  }

  findLessonRoster(tenantId, lessonId) {
    return this.db.prepare(`
      SELECT student.*, group_row.name AS group_name,
             guardian_link.relationship AS parent_relationship,
             guardian.email AS parent_email,
             COALESCE(NULLIF(student.telegram_chat_id, ''), guardian.telegram_chat_id, '') AS effective_telegram_chat_id,
             existing.status AS attendance_status,
             existing.reason_id AS attendance_reason_id,
             existing.reason_code AS attendance_reason_code,
             existing.reason_name AS attendance_reason_name,
             existing.note AS attendance_note,
             COALESCE((
               SELECT SUM(CASE
                 WHEN transaction_row.effect = 'credit' THEN transaction_row.amount
                 WHEN transaction_row.effect = 'debit' THEN -transaction_row.amount
                 WHEN transaction_row.type IN ('payment', 'discount') THEN transaction_row.amount
                 ELSE -transaction_row.amount END)
               FROM invoices_transactions transaction_row
               WHERE transaction_row.student_id = student.id
                 AND transaction_row.tenant_id = student.tenant_id
                 AND COALESCE(transaction_row.status, 'active') = 'active'
             ), student.balance, 0) AS ledger_balance,
             (SELECT COUNT(*) FROM attendance aggregate_row
               WHERE aggregate_row.tenant_id = student.tenant_id AND aggregate_row.student_id = student.id) AS attendance_total,
             (SELECT COUNT(*) FROM attendance aggregate_row
               WHERE aggregate_row.tenant_id = student.tenant_id AND aggregate_row.student_id = student.id
                 AND aggregate_row.status IN ('present', 'late')) AS attendance_present
      FROM lessons lesson
      JOIN groups group_row
        ON group_row.tenant_id = lesson.tenant_id AND group_row.id = lesson.group_id
      JOIN students student ON student.tenant_id = lesson.tenant_id
      LEFT JOIN student_guardians guardian_link
        ON guardian_link.tenant_id = student.tenant_id
       AND guardian_link.student_id = student.id AND guardian_link.is_primary = 1
      LEFT JOIN guardians guardian
        ON guardian.tenant_id = guardian_link.tenant_id AND guardian.id = guardian_link.guardian_id
      LEFT JOIN attendance existing
        ON existing.tenant_id = lesson.tenant_id
       AND existing.lesson_id = lesson.id AND existing.student_id = student.id
      WHERE lesson.tenant_id = ? AND lesson.id = ?
        AND (
          existing.id IS NOT NULL
          OR EXISTS (
            SELECT 1 FROM student_group_enrollments enrollment
            WHERE enrollment.tenant_id = lesson.tenant_id
              AND enrollment.student_id = student.id
              AND enrollment.group_id = lesson.group_id
              AND enrollment.start_date <= lesson.date
              AND (enrollment.end_date IS NULL OR enrollment.end_date = '' OR lesson.date < enrollment.end_date)
          )
        )
      ORDER BY student.name
    `).all(tenantId, lessonId).map(mapStudent);
  }

  findByLesson(tenantId, lessonId) {
    return this.db.prepare(`
      SELECT attendance.*, student.name AS student_name
      FROM attendance
      JOIN students student
        ON student.tenant_id = attendance.tenant_id AND student.id = attendance.student_id
      WHERE attendance.tenant_id = ? AND attendance.lesson_id = ?
      ORDER BY attendance.student_id
    `).all(tenantId, lessonId).map(mapAttendance);
  }

  listReasons(tenantId, activeOnly = false) {
    return this.db.prepare(`
      SELECT * FROM attendance_reasons
      WHERE tenant_id = ? AND (? = 0 OR is_active = 1)
      ORDER BY is_system DESC, attendance_status, name
    `).all(tenantId, activeOnly ? 1 : 0).map(mapReason);
  }

  findReason(tenantId, reasonId) {
    return mapReason(this.db.prepare(`
      SELECT * FROM attendance_reasons WHERE tenant_id = ? AND id = ? LIMIT 1
    `).get(tenantId, reasonId));
  }

  createReason(command) {
    const reasonId = this.idGenerator();
    const eventId = this.idGenerator();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.prepare(`
        INSERT INTO attendance_reasons
          (id, tenant_id, code, name, attendance_status, charge_percent, consume_percent,
           is_active, is_system, version, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0, 1, ?, ?)
      `).run(
        reasonId, command.tenantId, command.code, command.name, command.attendanceStatus,
        command.chargePercent, command.consumePercent, command.occurredAt, command.occurredAt,
      );
      const reason = this.findReason(command.tenantId, reasonId);
      if (process.env.DONO_ATTENDANCE_MIRROR_ENABLED === "true") {
        this.insertReasonOutbox({
          eventId,
          eventType: "attendance_reason.created",
          command,
          reason,
        });
      }
      this.db.exec("COMMIT");
      return reason;
    } catch (error) {
      this.db.exec("ROLLBACK");
      if (isAttendanceReasonCodeConflict(error)) {
        throw new DomainError("Attendance reason code already exists", 409);
      }
      throw error;
    }
  }

  updateReason(command) {
    const eventId = this.idGenerator();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const existing = this.findReason(command.tenantId, command.reasonId);
      if (!existing) throw new DomainError("Attendance reason not found", 404);
      const update = this.db.prepare(`
        UPDATE attendance_reasons
        SET name = ?, charge_percent = ?, consume_percent = ?, is_active = ?,
            version = version + 1, updated_at = ?
        WHERE tenant_id = ? AND id = ? AND version = ?
      `).run(
        command.name, command.chargePercent, command.consumePercent, command.isActive ? 1 : 0,
        command.occurredAt, command.tenantId, command.reasonId, command.expectedVersion,
      );
      if (Number(update.changes || 0) !== 1) {
        throw new DomainError("Attendance reason changed concurrently; reload and try again", 409);
      }
      const reason = this.findReason(command.tenantId, command.reasonId);
      if (process.env.DONO_ATTENDANCE_MIRROR_ENABLED === "true") {
        this.insertReasonOutbox({
          eventId,
          eventType: "attendance_reason.updated",
          command,
          reason,
        });
      }
      this.db.exec("COMMIT");
      return reason;
    } catch (error) {
      this.db.exec("ROLLBACK");
      if (isAttendanceReasonCodeConflict(error)) {
        throw new DomainError("Attendance reason code already exists", 409);
      }
      throw error;
    }
  }

  insertReasonOutbox({ eventId, eventType, command, reason }) {
    this.db.prepare(`
      INSERT INTO migration_outbox
        (id, tenant_id, aggregate_type, aggregate_id, event_type, source_store,
         target_store, source_version, payload_json, status, attempts, created_at)
      VALUES (?, ?, 'attendance_reason', ?, ?, 'sqlite', 'postgres', ?, ?, 'pending', 0, ?)
    `).run(
      eventId, command.tenantId, reason.id, eventType, reason.version,
      JSON.stringify({
        eventId,
        eventType,
        tenantId: command.tenantId,
        sourceVersion: reason.version,
        actorUserId: command.actorUserId || "system",
        actorRole: command.actorRole || "system",
        reason,
      }),
      command.occurredAt,
    );
  }

  findClosedFinancePeriod(tenantId, branchId, date) {
    const row = this.db.prepare(`
      SELECT * FROM finance_periods
      WHERE tenant_id = ? AND status = 'closed'
        AND start_date <= ? AND end_date >= ?
        AND (branch_id IS NULL OR branch_id = '' OR branch_id = ?)
      ORDER BY CASE WHEN branch_id = ? THEN 0 ELSE 1 END, start_date DESC
      LIMIT 1
    `).get(tenantId, date, date, branchId || "", branchId || "");
    return row ? { id: row.id, label: row.label, branchId: row.branch_id || "" } : null;
  }

  hasActiveSettlement(tenantId, lessonId) {
    return Boolean(this.db.prepare(`
      SELECT 1 FROM lesson_financial_settlements
      WHERE tenant_id = ? AND lesson_id = ? AND status = 'confirmed' LIMIT 1
    `).get(tenantId, lessonId));
  }

  findAlertSource(tenantId, lessonId) {
    const lesson = this.db.prepare(`
      SELECT lesson.id, lesson.date, lesson.status, lesson.attendance_version,
             group_row.name AS group_name, group_row.subject,
             COALESCE(lesson.teacher_id, schedule.teacher_id, group_row.teacher_id) AS teacher_id,
             teacher.name AS teacher_name,
             COALESCE(NULLIF(lesson.start_time, ''), schedule.start_time,
                      TRIM(SUBSTR(lesson.time, 1, INSTR(lesson.time || '-', '-') - 1))) AS start_time
      FROM lessons lesson
      JOIN groups group_row
        ON group_row.tenant_id = lesson.tenant_id AND group_row.id = lesson.group_id
      LEFT JOIN schedules schedule
        ON schedule.tenant_id = lesson.tenant_id AND schedule.id = lesson.schedule_id
      LEFT JOIN teachers teacher
        ON teacher.tenant_id = lesson.tenant_id
       AND teacher.id = COALESCE(lesson.teacher_id, schedule.teacher_id, group_row.teacher_id)
      WHERE lesson.tenant_id = ? AND lesson.id = ? LIMIT 1
    `).get(tenantId, lessonId);
    if (!lesson) return null;
    const records = this.db.prepare(`
      SELECT attendance.student_id, student.name AS student_name, attendance.status
      FROM attendance
      JOIN students student
        ON student.tenant_id = attendance.tenant_id AND student.id = attendance.student_id
      WHERE attendance.tenant_id = ? AND attendance.lesson_id = ?
        AND attendance.status IN ('absent', 'late')
      ORDER BY student.name
    `).all(tenantId, lessonId).map((row) => ({
      studentId: row.student_id,
      studentName: row.student_name,
      status: row.status,
    }));
    return {
      lesson: {
        id: lesson.id,
        date: lesson.date,
        status: lesson.status,
        attendanceVersion: Number(lesson.attendance_version || 0),
        groupName: lesson.group_name || "",
        subject: lesson.subject || "",
        teacherId: lesson.teacher_id || "",
        teacherName: lesson.teacher_name || "",
        startTime: lesson.start_time || "",
      },
      records,
    };
  }

  replaceForLesson(command) {
    const timestamp = command.occurredAt;
    const snapshot = attendanceSnapshot(command.records);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const lesson = this.findLesson(command.tenantId, command.lessonId);
      if (!lesson) throw new DomainError("Lesson not found", 404);
      if (Number(lesson.attendanceVersion) !== Number(command.lesson.attendanceVersion || 0)) {
        throw new DomainError("Attendance changed concurrently; reload the lesson and try again", 409);
      }
      if (lesson.financialStatus === "posted" || this.hasActiveSettlement(command.tenantId, command.lessonId)) {
        throw new DomainError("Reverse the active financial settlement before correcting attendance", 409);
      }
      const closedPeriod = this.findClosedFinancePeriod(command.tenantId, lesson.branchId, lesson.date);
      if (closedPeriod) throw new DomainError(`Finance period is closed: ${closedPeriod.label}`, 409);
      const beforeRecords = this.findByLesson(command.tenantId, command.lessonId);
      const revision = Number(lesson.attendanceVersion) + 1;

      this.db.prepare("DELETE FROM attendance WHERE tenant_id = ? AND lesson_id = ?")
        .run(command.tenantId, command.lessonId);
      const insertAttendance = this.db.prepare(`
        INSERT INTO attendance
          (id, tenant_id, lesson_id, student_id, status, reason_id, reason_code,
           reason_name, charge_percent, consume_percent, note, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const record of snapshot) {
        insertAttendance.run(
          this.idGenerator(), command.tenantId, command.lessonId, record.studentId, record.status,
          record.reasonId || null, record.reasonCode, record.reasonName,
          record.chargePercent, record.consumePercent, record.note, timestamp,
        );
      }
      this.db.prepare(`
        INSERT INTO lesson_attendance_revisions
          (id, tenant_id, lesson_id, revision_no, actor_user_id, actor_role,
           reason, snapshot_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        this.idGenerator(), command.tenantId, command.lessonId, revision,
        command.actorUserId || "system", command.actorRole || "system",
        command.correctionReason || "", JSON.stringify(snapshot), timestamp,
      );
      const update = this.db.prepare(`
        UPDATE lessons
        SET status = 'completed', attendance_version = ?, financial_status = 'pending',
            financial_posted_at = NULL, financial_posted_by = NULL,
            financial_reversed_at = NULL, financial_reversed_by = NULL,
            financial_reversal_reason = NULL,
            topic = ?, homework = ?, note = ?,
            completed_by = COALESCE(NULLIF(completed_by, ''), ?),
            completed_at = COALESCE(NULLIF(completed_at, ''), ?),
            updated_by = ?, updated_at = ?, version = version + 1
        WHERE tenant_id = ? AND id = ? AND attendance_version = ?
      `).run(
        revision, command.details.topic, command.details.homework, command.details.note,
        command.actorUserId || "system", timestamp, command.actorUserId || "system", timestamp,
        command.tenantId, command.lessonId, lesson.attendanceVersion,
      );
      if (Number(update.changes || 0) !== 1) {
        throw new DomainError("Attendance changed concurrently; reload the lesson and try again", 409);
      }
      const afterLesson = this.findLesson(command.tenantId, command.lessonId);
      const eventId = this.idGenerator();
      const beforeSnapshot = { ...lessonSnapshot(lesson), attendance: beforeRecords };
      const afterSnapshot = { ...lessonSnapshot(afterLesson), attendance: snapshot };
      this.db.prepare(`
        INSERT INTO lesson_events
          (id, tenant_id, lesson_id, actor_user_id, actor_role, action, reason,
           before_json, after_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        eventId, command.tenantId, command.lessonId,
        command.actorUserId || "system", command.actorRole || "system",
        lesson.status === "completed" ? "attendance_corrected" : "completed",
        command.correctionReason || "",
        JSON.stringify(beforeSnapshot),
        JSON.stringify(afterSnapshot),
        timestamp,
      );

      if (process.env.DONO_ATTENDANCE_MIRROR_ENABLED === "true") {
        this.db.prepare(`
          INSERT INTO migration_outbox
            (id, tenant_id, aggregate_type, aggregate_id, event_type, source_store,
             target_store, source_version, payload_json, status, attempts, created_at)
          VALUES (?, ?, 'attendance', ?, 'attendance.replaced', 'sqlite',
                  'postgres', ?, ?, 'pending', 0, ?)
        `).run(
          eventId, command.tenantId, command.lessonId, revision,
          JSON.stringify({
            eventId,
            eventAction: lesson.status === "completed" ? "attendance_corrected" : "completed",
            tenantId: command.tenantId,
            lessonId: command.lessonId,
            sourceVersion: revision,
            records: snapshot,
            actorUserId: command.actorUserId || "system",
            actorRole: command.actorRole || "system",
            correctionReason: command.correctionReason || "",
            before: beforeSnapshot,
            after: afterSnapshot,
            lesson: {
              status: "completed",
              financialStatus: "pending",
              topic: command.details.topic,
              homework: command.details.homework,
              note: command.details.note,
              attendanceVersion: revision,
              updatedBy: command.actorUserId || "system",
              updatedAt: timestamp,
            },
          }),
          timestamp,
        );
      }
      this.db.exec("COMMIT");
      return afterLesson;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  reopenLesson(command) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const lesson = this.findLesson(command.tenantId, command.lessonId);
      if (!lesson) throw new DomainError("Lesson not found", 404);
      if (lesson.status !== "completed") throw new DomainError("Only a completed lesson can be reopened", 409);
      if (Number(lesson.attendanceVersion) !== Number(command.lesson.attendanceVersion || 0)) {
        throw new DomainError("Attendance changed concurrently; reload the lesson and try again", 409);
      }
      if (lesson.financialStatus === "posted" || this.hasActiveSettlement(command.tenantId, command.lessonId)) {
        throw new DomainError("Reverse the active financial settlement before reopening the lesson", 409);
      }
      const closedPeriod = this.findClosedFinancePeriod(command.tenantId, lesson.branchId, lesson.date);
      if (closedPeriod) throw new DomainError(`Finance period is closed: ${closedPeriod.label}`, 409);
      const beforeRecords = this.findByLesson(command.tenantId, command.lessonId);
      const sourceVersion = Number(lesson.attendanceVersion) + 1;
      this.db.prepare("DELETE FROM attendance WHERE tenant_id = ? AND lesson_id = ?")
        .run(command.tenantId, command.lessonId);
      const update = this.db.prepare(`
        UPDATE lessons
        SET status = 'waiting', attendance_version = ?,
            financial_status = CASE WHEN financial_status = 'reversed' THEN 'reversed' ELSE 'unposted' END,
            completed_by = NULL, completed_at = NULL,
            updated_by = ?, updated_at = ?, version = version + 1
        WHERE tenant_id = ? AND id = ? AND status = 'completed' AND attendance_version = ?
      `).run(
        sourceVersion, command.actorUserId || "system", command.occurredAt,
        command.tenantId, command.lessonId, lesson.attendanceVersion,
      );
      if (Number(update.changes || 0) !== 1) {
        throw new DomainError("Lesson changed while it was being reopened", 409);
      }
      const afterLesson = this.findLesson(command.tenantId, command.lessonId);
      const eventId = this.idGenerator();
      const beforeSnapshot = { ...lessonSnapshot(lesson), attendance: beforeRecords };
      const afterSnapshot = { ...lessonSnapshot(afterLesson), attendance: [] };
      this.db.prepare(`
        INSERT INTO lesson_events
          (id, tenant_id, lesson_id, actor_user_id, actor_role, action, reason,
           before_json, after_json, created_at)
        VALUES (?, ?, ?, ?, ?, 'completion_reversed', ?, ?, ?, ?)
      `).run(
        eventId, command.tenantId, command.lessonId,
        command.actorUserId || "system", command.actorRole || "system", command.reason,
        JSON.stringify(beforeSnapshot), JSON.stringify(afterSnapshot), command.occurredAt,
      );
      if (process.env.DONO_ATTENDANCE_MIRROR_ENABLED === "true") {
        this.db.prepare(`
          INSERT INTO migration_outbox
            (id, tenant_id, aggregate_type, aggregate_id, event_type, source_store,
             target_store, source_version, payload_json, status, attempts, created_at)
          VALUES (?, ?, 'attendance', ?, 'attendance.reopened', 'sqlite',
                  'postgres', ?, ?, 'pending', 0, ?)
        `).run(
          eventId, command.tenantId, command.lessonId, sourceVersion,
          JSON.stringify({
            eventId,
            eventAction: "completion_reversed",
            tenantId: command.tenantId,
            lessonId: command.lessonId,
            sourceVersion,
            records: [],
            actorUserId: command.actorUserId || "system",
            actorRole: command.actorRole || "system",
            correctionReason: command.reason,
            before: beforeSnapshot,
            after: afterSnapshot,
            lesson: {
              status: "waiting",
              financialStatus: afterLesson.financialStatus,
              topic: afterLesson.topic,
              homework: afterLesson.homework,
              note: afterLesson.note,
              attendanceVersion: sourceVersion,
              updatedBy: command.actorUserId || "system",
              updatedAt: command.occurredAt,
            },
          }),
          command.occurredAt,
        );
      }
      this.db.exec("COMMIT");
      return afterLesson;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  audit(context, action, entityId, entity = "attendance") {
    this.db.prepare(`
      INSERT INTO audit_logs
        (id, tenant_id, user_id, role, action, entity, entity_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      this.idGenerator(),
      context.tenantId,
      context.userId,
      context.role,
      action,
      entity,
      entityId,
      this.clock(),
    );
  }
}

module.exports = { SQLiteAttendanceRepository };
