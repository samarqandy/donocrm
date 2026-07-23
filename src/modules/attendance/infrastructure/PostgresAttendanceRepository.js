const crypto = require("node:crypto");
const { AttendanceRepository } = require("../domain/AttendanceRepository");
const { DomainError } = require("../../../core/errors/DomainError");

function mapLesson(row) {
  if (!row) return null;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    branchId: row.branch_id || "",
    groupId: row.group_id,
    teacherId: row.effective_teacher_id || row.teacher_id || "",
    date: row.calendar_date || (row.date instanceof Date ? row.date.toISOString().slice(0, 10) : String(row.date)),
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
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at || "",
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at || "",
  };
}

function timestampValue(value) {
  return value instanceof Date ? value.toISOString() : value;
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
    createdAt: timestampValue(row.created_at),
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

class PostgresAttendanceRepository extends AttendanceRepository {
  constructor(pool, {
    financeGuard = null,
    lessonReferenceReader = null,
    rosterProjection = null,
    alertSourceReader = null,
    idGenerator = () => crypto.randomUUID(),
    clock = () => new Date().toISOString(),
  } = {}) {
    super();
    this.pool = pool;
    this.financeGuard = financeGuard;
    this.lessonReferenceReader = lessonReferenceReader;
    this.rosterProjection = rosterProjection || lessonReferenceReader;
    this.alertSourceReader = alertSourceReader || lessonReferenceReader;
    this.idGenerator = idGenerator;
    this.clock = clock;
    this.storeName = "postgres";
  }

  async mapLessonRow(tenantId, row) {
    if (!row) return null;
    if (!row.teacher_id) {
      if (!this.lessonReferenceReader || typeof this.lessonReferenceReader.resolveEffectiveTeacher !== "function") {
        throw new Error("Attendance lesson reference reader is not configured");
      }
      row.effective_teacher_id = await this.lessonReferenceReader.resolveEffectiveTeacher(tenantId, {
        teacherId: row.teacher_id || "",
        scheduleId: row.schedule_id,
        groupId: row.group_id,
      });
      if (!row.effective_teacher_id) throw new Error("Attendance lesson reference is unavailable");
    }
    return mapLesson(row);
  }

  async findLesson(tenantId, lessonId) {
    const { rows } = await this.pool.query(
      "SELECT lesson.*, lesson.date::text AS calendar_date FROM lessons lesson WHERE tenant_id = $1 AND id = $2 LIMIT 1",
      [tenantId, lessonId],
    );
    return this.mapLessonRow(tenantId, rows[0]);
  }

  async findLessonRoster(tenantId, lessonId) {
    if (!this.rosterProjection || typeof this.rosterProjection.findLessonRoster !== "function") {
      throw new Error("Attendance roster projection is not configured");
    }
    const roster = await Promise.resolve(this.rosterProjection.findLessonRoster(tenantId, lessonId));
    const { rows } = await this.pool.query(`
      SELECT student_id,
             COUNT(*)::int AS attendance_total,
             COUNT(*) FILTER (WHERE status IN ('present', 'late'))::int AS attendance_present,
             MAX(status) FILTER (WHERE lesson_id = $2) AS attendance_status,
             MAX(reason_id) FILTER (WHERE lesson_id = $2) AS attendance_reason_id,
             MAX(reason_code) FILTER (WHERE lesson_id = $2) AS attendance_reason_code,
             MAX(reason_name) FILTER (WHERE lesson_id = $2) AS attendance_reason_name,
             MAX(note) FILTER (WHERE lesson_id = $2) AS attendance_note
      FROM attendance
      WHERE tenant_id = $1
      GROUP BY student_id
    `, [tenantId, lessonId]);
    const attendanceByStudent = new Map(rows.map((row) => [row.student_id, row]));
    return roster.map((student) => {
      const attendance = attendanceByStudent.get(student.id);
      if (!attendance) return student;
      const attendanceTotal = Number(attendance.attendance_total || 0);
      const attendancePresent = Number(attendance.attendance_present || 0);
      return {
        ...student,
        attendanceTotal,
        attendancePresent,
        attendanceRate: attendanceTotal ? Math.round((attendancePresent / attendanceTotal) * 100) : 0,
        attendanceStatus: attendance.attendance_status || "",
        attendanceReasonId: attendance.attendance_reason_id || "",
        attendanceReasonCode: attendance.attendance_reason_code || "",
        attendanceReasonName: attendance.attendance_reason_name || "",
        attendanceNote: attendance.attendance_note || "",
      };
    });
  }

  async findByLesson(tenantId, lessonId) {
    const { rows } = await this.pool.query(`
      SELECT attendance.*, student.name AS student_name
      FROM attendance
      JOIN students student
        ON student.tenant_id = attendance.tenant_id AND student.id = attendance.student_id
      WHERE attendance.tenant_id = $1 AND attendance.lesson_id = $2
      ORDER BY attendance.student_id
    `, [tenantId, lessonId]);
    return rows.map(mapAttendance);
  }

  async listReasons(tenantId, activeOnly = false) {
    const { rows } = await this.pool.query(`
      SELECT * FROM attendance_reasons
      WHERE tenant_id = $1 AND ($2::boolean = false OR is_active = true)
      ORDER BY is_system DESC, attendance_status, name
    `, [tenantId, activeOnly]);
    return rows.map(mapReason);
  }

  async findReason(tenantId, reasonId) {
    const { rows } = await this.pool.query(
      "SELECT * FROM attendance_reasons WHERE tenant_id = $1 AND id = $2 LIMIT 1",
      [tenantId, reasonId],
    );
    return mapReason(rows[0]);
  }

  async createReason(command) {
    const client = await this.pool.connect();
    const reasonId = this.idGenerator();
    const eventId = this.idGenerator();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query(`
        INSERT INTO attendance_reasons
          (tenant_id, id, code, name, attendance_status, charge_percent, consume_percent,
           is_active, is_system, version, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,true,false,1,$8,$8)
        RETURNING *
      `, [
        command.tenantId, reasonId, command.code, command.name, command.attendanceStatus,
        command.chargePercent, command.consumePercent, command.occurredAt,
      ]);
      const reason = mapReason(rows[0]);
      await this.insertReasonOutbox(client, { eventId, eventType: "attendance_reason.created", command, reason });
      await client.query("COMMIT");
      return reason;
    } catch (error) {
      await client.query("ROLLBACK");
      if (error.code === "23505") throw new DomainError("Attendance reason code already exists", 409);
      throw error;
    } finally {
      client.release();
    }
  }

  async updateReason(command) {
    const client = await this.pool.connect();
    const eventId = this.idGenerator();
    try {
      await client.query("BEGIN");
      const locked = await client.query(
        "SELECT * FROM attendance_reasons WHERE tenant_id = $1 AND id = $2 FOR UPDATE",
        [command.tenantId, command.reasonId],
      );
      if (!locked.rows[0]) throw new DomainError("Attendance reason not found", 404);
      if (Number(locked.rows[0].version || 1) !== Number(command.expectedVersion)) {
        throw new DomainError("Attendance reason changed concurrently; reload and try again", 409);
      }
      const { rows } = await client.query(`
        UPDATE attendance_reasons
        SET name = $1, charge_percent = $2, consume_percent = $3, is_active = $4,
            version = version + 1, updated_at = $5
        WHERE tenant_id = $6 AND id = $7 AND version = $8
        RETURNING *
      `, [
        command.name, command.chargePercent, command.consumePercent, command.isActive,
        command.occurredAt, command.tenantId, command.reasonId, command.expectedVersion,
      ]);
      if (!rows[0]) throw new DomainError("Attendance reason changed concurrently; reload and try again", 409);
      const reason = mapReason(rows[0]);
      await this.insertReasonOutbox(client, { eventId, eventType: "attendance_reason.updated", command, reason });
      await client.query("COMMIT");
      return reason;
    } catch (error) {
      await client.query("ROLLBACK");
      if (error.code === "23505") throw new DomainError("Attendance reason code already exists", 409);
      throw error;
    } finally {
      client.release();
    }
  }

  async insertReasonOutbox(client, { eventId, eventType, command, reason }) {
    await client.query(`
      INSERT INTO migration_outbox
        (id, tenant_id, aggregate_type, aggregate_id, event_type, source_store,
         target_store, source_version, payload_json, status, created_at, updated_at)
      VALUES ($1,$2,'attendance_reason',$3,$4,'postgres','sqlite',$5,$6::jsonb,'pending',$7,$7)
    `, [
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
    ]);
  }

  async findClosedFinancePeriod(tenantId, branchId, date) {
    if (!this.financeGuard || typeof this.financeGuard.findClosedFinancePeriod !== "function") {
      throw new Error("Attendance finance guard is not configured");
    }
    return this.financeGuard.findClosedFinancePeriod(tenantId, branchId, date);
  }

  async hasActiveSettlement(tenantId, lessonId) {
    if (!this.financeGuard || typeof this.financeGuard.hasActiveSettlement !== "function") {
      throw new Error("Attendance finance guard is not configured");
    }
    return Boolean(await this.financeGuard.hasActiveSettlement(tenantId, lessonId));
  }

  async findAlertSource(tenantId, lessonId) {
    if (!this.alertSourceReader || typeof this.alertSourceReader.findAlertSource !== "function") {
      throw new Error("Attendance alert source reader is not configured");
    }
    const source = await Promise.resolve(this.alertSourceReader.findAlertSource(tenantId, lessonId));
    if (!source) return null;
    const recordsResult = await this.pool.query(`
      SELECT attendance.student_id, student.name AS student_name, attendance.status
      FROM attendance
      JOIN students student
        ON student.tenant_id = attendance.tenant_id AND student.id = attendance.student_id
      WHERE attendance.tenant_id = $1 AND attendance.lesson_id = $2
        AND attendance.status IN ('absent', 'late')
      ORDER BY student.name
    `, [tenantId, lessonId]);
    return {
      lesson: source.lesson,
      records: recordsResult.rows.map((row) => ({
        studentId: row.student_id,
        studentName: row.student_name,
        status: row.status,
      })),
    };
  }

  async replaceForLesson(command) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const locked = await client.query(
        "SELECT lesson.*, lesson.date::text AS calendar_date FROM lessons lesson WHERE tenant_id = $1 AND id = $2 FOR UPDATE",
        [command.tenantId, command.lessonId],
      );
      if (!locked.rows[0]) throw new DomainError("Lesson not found", 404);
      const lockedLesson = await this.mapLessonRow(command.tenantId, locked.rows[0]);
      const lockedVersion = Number(lockedLesson.attendanceVersion || 0);
      if (lockedVersion !== Number(command.lesson.attendanceVersion || 0)) {
        throw new DomainError("Attendance changed concurrently; reload the lesson and try again", 409);
      }
      if (!this.financeGuard
        || typeof this.financeGuard.hasActiveSettlement !== "function"
        || typeof this.financeGuard.findClosedFinancePeriod !== "function") {
        throw new Error("Attendance finance guard is not configured");
      }
      const settled = await this.financeGuard.hasActiveSettlement(command.tenantId, command.lessonId);
      if (lockedLesson.financialStatus === "posted" || settled) {
        throw new DomainError("Reverse the active financial settlement before correcting attendance", 409);
      }
      const closedPeriod = await this.financeGuard.findClosedFinancePeriod(
        command.tenantId,
        lockedLesson.branchId,
        lockedLesson.date,
      );
      if (closedPeriod) throw new DomainError(`Finance period is closed: ${closedPeriod.label}`, 409);

      const snapshot = attendanceSnapshot(command.records);
      const actorUserId = command.actorUserId || "system";
      const actorRole = command.actorRole || "system";
      const correctionReason = command.correctionReason || "";
      const revision = lockedVersion + 1;
      const beforeAttendance = await client.query(`
        SELECT attendance.*, student.name AS student_name
        FROM attendance
        JOIN students student
          ON student.tenant_id = attendance.tenant_id AND student.id = attendance.student_id
        WHERE attendance.tenant_id = $1 AND attendance.lesson_id = $2
        ORDER BY attendance.student_id
      `, [command.tenantId, command.lessonId]);
      const beforeRecords = beforeAttendance.rows.map(mapAttendance);

      await client.query("DELETE FROM attendance WHERE tenant_id = $1 AND lesson_id = $2", [command.tenantId, command.lessonId]);
      for (const record of snapshot) {
        await client.query(`
          INSERT INTO attendance
            (id, tenant_id, lesson_id, student_id, status, note, reason_id, reason_code,
             reason_name, charge_percent, consume_percent, source_version, created_at, updated_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13)
        `, [
          this.idGenerator(), command.tenantId, command.lessonId, record.studentId, record.status,
          record.note, record.reasonId || null, record.reasonCode, record.reasonName,
          record.chargePercent, record.consumePercent, revision, command.occurredAt,
        ]);
      }

      await client.query(`
        INSERT INTO lesson_attendance_revisions
          (id, tenant_id, lesson_id, revision_no, actor_user_id, actor_role,
           reason, snapshot_json, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$9)
      `, [
        this.idGenerator(), command.tenantId, command.lessonId, revision,
        actorUserId, actorRole, correctionReason, JSON.stringify(snapshot), command.occurredAt,
      ]);

      const update = await client.query(`
        UPDATE lessons SET status = 'completed', attendance_version = $1,
          financial_status = 'pending', financial_posted_at = NULL, financial_posted_by = NULL,
          financial_reversed_at = NULL, financial_reversed_by = NULL,
          financial_reversal_reason = NULL,
          topic = $2, homework = $3, note = $4,
          completed_by = COALESCE(NULLIF(completed_by, ''), $5),
          completed_at = COALESCE(completed_at, $6), updated_by = $5, updated_at = $6,
          version = version + 1
        WHERE tenant_id = $7 AND id = $8 AND attendance_version = $9
      `, [revision, command.details.topic, command.details.homework, command.details.note,
        actorUserId, command.occurredAt, command.tenantId, command.lessonId, lockedVersion]);
      if (update.rowCount !== 1) {
        throw new DomainError("Attendance changed concurrently; reload the lesson and try again", 409);
      }

      const afterResult = await client.query(
        "SELECT lesson.*, lesson.date::text AS calendar_date FROM lessons lesson WHERE tenant_id = $1 AND id = $2 LIMIT 1",
        [command.tenantId, command.lessonId],
      );
      const afterLesson = await this.mapLessonRow(command.tenantId, afterResult.rows[0]);
      const eventId = this.idGenerator();
      const beforeSnapshot = { ...lessonSnapshot(lockedLesson), attendance: beforeRecords };
      const afterSnapshot = { ...lessonSnapshot(afterLesson), attendance: snapshot };
      await client.query(`
        INSERT INTO lesson_events
          (id, tenant_id, lesson_id, actor_user_id, actor_role, action, reason,
           before_json, after_json, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$10)
      `, [
        eventId, command.tenantId, command.lessonId,
        actorUserId, actorRole,
        lockedLesson.status === "completed" ? "attendance_corrected" : "completed",
        correctionReason,
        JSON.stringify(beforeSnapshot),
        JSON.stringify(afterSnapshot),
        command.occurredAt,
      ]);
      await client.query(`
        INSERT INTO migration_outbox
          (id, tenant_id, aggregate_type, aggregate_id, event_type, source_store,
           target_store, source_version, payload_json, status, created_at)
        VALUES ($1,$2,'attendance',$3,'attendance.replaced','postgres','sqlite',$4,$5::jsonb,'pending',$6)
      `, [eventId, command.tenantId, command.lessonId, revision, JSON.stringify({
        eventId,
        eventAction: lockedLesson.status === "completed" ? "attendance_corrected" : "completed",
        tenantId: command.tenantId,
        lessonId: command.lessonId,
        sourceVersion: revision,
        records: snapshot,
        actorUserId,
        actorRole,
        correctionReason,
        before: beforeSnapshot,
        after: afterSnapshot,
        lesson: {
          status: "completed",
          financialStatus: "pending",
          topic: command.details.topic,
          homework: command.details.homework,
          note: command.details.note,
          attendanceVersion: revision,
          updatedBy: actorUserId,
          updatedAt: command.occurredAt,
        },
      }), command.occurredAt]);
      await client.query("COMMIT");
      return afterLesson;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async reopenLesson(command) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const lockedResult = await client.query(
        "SELECT lesson.*, lesson.date::text AS calendar_date FROM lessons lesson WHERE tenant_id = $1 AND id = $2 FOR UPDATE",
        [command.tenantId, command.lessonId],
      );
      if (!lockedResult.rows[0]) throw new DomainError("Lesson not found", 404);
      const lockedLesson = await this.mapLessonRow(command.tenantId, lockedResult.rows[0]);
      if (lockedLesson.status !== "completed") throw new DomainError("Only a completed lesson can be reopened", 409);
      const lockedVersion = Number(lockedLesson.attendanceVersion || 0);
      if (lockedVersion !== Number(command.lesson.attendanceVersion || 0)) {
        throw new DomainError("Attendance changed concurrently; reload the lesson and try again", 409);
      }
      if (!this.financeGuard
        || typeof this.financeGuard.hasActiveSettlement !== "function"
        || typeof this.financeGuard.findClosedFinancePeriod !== "function") {
        throw new Error("Attendance finance guard is not configured");
      }
      const settled = await this.financeGuard.hasActiveSettlement(command.tenantId, command.lessonId);
      if (lockedLesson.financialStatus === "posted" || settled) {
        throw new DomainError("Reverse the active financial settlement before reopening the lesson", 409);
      }
      const closedPeriod = await this.financeGuard.findClosedFinancePeriod(
        command.tenantId,
        lockedLesson.branchId,
        lockedLesson.date,
      );
      if (closedPeriod) throw new DomainError(`Finance period is closed: ${closedPeriod.label}`, 409);

      const actorUserId = command.actorUserId || "system";
      const actorRole = command.actorRole || "system";
      const beforeAttendance = await client.query(`
        SELECT attendance.*, student.name AS student_name
        FROM attendance
        JOIN students student
          ON student.tenant_id = attendance.tenant_id AND student.id = attendance.student_id
        WHERE attendance.tenant_id = $1 AND attendance.lesson_id = $2
        ORDER BY attendance.student_id
      `, [command.tenantId, command.lessonId]);
      const beforeRecords = beforeAttendance.rows.map(mapAttendance);
      const sourceVersion = lockedVersion + 1;
      await client.query(
        "DELETE FROM attendance WHERE tenant_id = $1 AND lesson_id = $2",
        [command.tenantId, command.lessonId],
      );
      const updatedResult = await client.query(`
        UPDATE lessons
        SET status = 'waiting', attendance_version = $1,
            financial_status = CASE WHEN financial_status = 'reversed' THEN 'reversed' ELSE 'unposted' END,
            completed_by = NULL, completed_at = NULL,
            updated_by = $2, updated_at = $3, version = version + 1
        WHERE tenant_id = $4 AND id = $5 AND status = 'completed' AND attendance_version = $6
      `, [
        sourceVersion, actorUserId, command.occurredAt,
        command.tenantId, command.lessonId, lockedVersion,
      ]);
      if (updatedResult.rowCount !== 1) throw new DomainError("Lesson changed while it was being reopened", 409);
      const afterResult = await client.query(
        "SELECT lesson.*, lesson.date::text AS calendar_date FROM lessons lesson WHERE tenant_id = $1 AND id = $2 LIMIT 1",
        [command.tenantId, command.lessonId],
      );
      const afterLesson = await this.mapLessonRow(command.tenantId, afterResult.rows[0]);
      const eventId = this.idGenerator();
      const beforeSnapshot = { ...lessonSnapshot(lockedLesson), attendance: beforeRecords };
      const afterSnapshot = { ...lessonSnapshot(afterLesson), attendance: [] };
      await client.query(`
        INSERT INTO lesson_events
          (id, tenant_id, lesson_id, actor_user_id, actor_role, action, reason,
           before_json, after_json, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,'completion_reversed',$6,$7::jsonb,$8::jsonb,$9,$9)
      `, [
        eventId, command.tenantId, command.lessonId,
        actorUserId, actorRole, command.reason,
        JSON.stringify(beforeSnapshot), JSON.stringify(afterSnapshot), command.occurredAt,
      ]);
      await client.query(`
        INSERT INTO migration_outbox
          (id, tenant_id, aggregate_type, aggregate_id, event_type, source_store,
           target_store, source_version, payload_json, status, created_at)
        VALUES ($1,$2,'attendance',$3,'attendance.reopened','postgres','sqlite',$4,$5::jsonb,'pending',$6)
      `, [eventId, command.tenantId, command.lessonId, sourceVersion, JSON.stringify({
        eventId,
        eventAction: "completion_reversed",
        tenantId: command.tenantId,
        lessonId: command.lessonId,
        sourceVersion,
        records: [],
        actorUserId,
        actorRole,
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
          updatedBy: actorUserId,
          updatedAt: command.occurredAt,
        },
      }), command.occurredAt]);
      await client.query("COMMIT");
      return afterLesson;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async audit(context, action, entityId, entity = "attendance") {
    await this.pool.query(`
      INSERT INTO audit_logs (id, tenant_id, user_id, role, action, entity, entity_id, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    `, [
      this.idGenerator(),
      context.tenantId,
      context.userId,
      context.role,
      action,
      entity,
      entityId,
      this.clock(),
    ]);
  }
}

module.exports = { PostgresAttendanceRepository };
