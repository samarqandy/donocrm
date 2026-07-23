const crypto = require("node:crypto");

function payloadOf(event) {
  return typeof event.payload_json === "string" ? JSON.parse(event.payload_json) : event.payload_json;
}

class PostgresAttendanceOutboxRelay {
  constructor({ sqlite, postgres, batchSize = 50 }) {
    this.sqlite = sqlite;
    this.postgres = postgres;
    this.batchSize = Math.max(1, Math.min(Number(batchSize) || 50, 500));
    this.running = false;
  }

  async pending() {
    const { rows } = await this.postgres.query(`
      SELECT * FROM migration_outbox
      WHERE source_store = 'postgres' AND target_store = 'sqlite'
        AND status IN ('pending', 'failed') AND attempts < 20 AND available_at <= NOW()
      ORDER BY sequence LIMIT $1
    `, [this.batchSize]);
    return rows;
  }

  async markDone(event) {
    await this.postgres.query(`
      UPDATE migration_outbox
      SET status = 'done', processed_at = NOW(), last_error = NULL, updated_at = NOW()
      WHERE tenant_id = $1 AND id = $2
    `, [event.tenant_id, event.id]);
  }

  async markFailed(event, error) {
    await this.postgres.query(`
      UPDATE migration_outbox
      SET status = 'failed', attempts = attempts + 1, last_error = $3, updated_at = NOW()
      WHERE tenant_id = $1 AND id = $2
    `, [event.tenant_id, event.id, String(error.message || error).slice(0, 1000)]);
  }

  apply(event) {
    const payload = payloadOf(event);
    if (event.aggregate_type === "attendance_reason") return this.applyReason(event, payload);
    const isReopen = event.event_type === "attendance.reopened";
    if (!isReopen && event.event_type !== "attendance.replaced") {
      throw new Error(`Unsupported attendance event: ${event.event_type}`);
    }
    if (!payload || payload.tenantId !== event.tenant_id) throw new Error("Reverse relay tenant mismatch");
    if (!payload.lessonId || !Array.isArray(payload.records)) throw new Error("Reverse relay payload is invalid");
    const occurredAt = payload.lesson?.updatedAt || event.created_at || new Date().toISOString();
    this.sqlite.exec("BEGIN IMMEDIATE");
    try {
      const accepted = this.sqlite.prepare(`
        INSERT OR IGNORE INTO migration_inbox
          (tenant_id, event_id, source_store, event_type, received_at)
        VALUES (?, ?, 'postgres', ?, ?)
      `).run(event.tenant_id, event.id, event.event_type, occurredAt);
      if (!accepted.changes) {
        this.sqlite.exec("COMMIT");
        return { applied: false, reason: "duplicate" };
      }

      const lesson = this.sqlite.prepare(`
        SELECT attendance_version FROM lessons WHERE tenant_id = ? AND id = ?
      `).get(event.tenant_id, payload.lessonId);
      if (!lesson) throw new Error("Rollback lesson is missing in SQLite");
      const applyState = Number(lesson.attendance_version || 0) < Number(payload.sourceVersion || 0);

      if (applyState) {
        this.sqlite.prepare("DELETE FROM attendance WHERE tenant_id = ? AND lesson_id = ?")
          .run(event.tenant_id, payload.lessonId);
        const insert = this.sqlite.prepare(`
          INSERT INTO attendance
            (id, tenant_id, lesson_id, student_id, status, note, created_at,
             reason_id, reason_code, reason_name, charge_percent, consume_percent)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const record of payload.records) {
          insert.run(
            crypto.randomUUID(),
            event.tenant_id,
            payload.lessonId,
            record.studentId,
            record.status,
            record.note || "",
            occurredAt,
            record.reasonId || null,
            record.reasonCode || "",
            record.reasonName || "",
            Number(record.chargePercent || 0),
            Number(record.consumePercent || 0),
          );
        }

        const lessonStatus = payload.lesson?.status || (isReopen ? "waiting" : "completed");
        const financialStatus = payload.lesson?.financialStatus || (isReopen ? "unposted" : "pending");
        this.sqlite.prepare(`
          UPDATE lessons
          SET status = ?, topic = ?, homework = ?, note = ?,
              attendance_version = ?, financial_status = ?,
              financial_posted_at = NULL, financial_posted_by = NULL,
              completed_by = CASE WHEN ? = 'completed' THEN COALESCE(NULLIF(completed_by, ''), ?) ELSE NULL END,
              completed_at = CASE WHEN ? = 'completed' THEN COALESCE(NULLIF(completed_at, ''), ?) ELSE NULL END,
              updated_by = ?, updated_at = ?, version = version + 1
          WHERE tenant_id = ? AND id = ?
        `).run(
          lessonStatus,
          payload.lesson?.topic || "",
          payload.lesson?.homework || "",
          payload.lesson?.note || "",
          Number(payload.sourceVersion),
          financialStatus,
          lessonStatus,
          payload.lesson?.updatedBy || payload.actorUserId || "system",
          lessonStatus,
          occurredAt,
          payload.lesson?.updatedBy || payload.actorUserId || "system",
          occurredAt,
          event.tenant_id,
          payload.lessonId,
        );
      }

      if (!isReopen) {
        this.sqlite.prepare(`
          INSERT OR IGNORE INTO lesson_attendance_revisions
            (id, tenant_id, lesson_id, revision_no, actor_user_id, actor_role, reason, snapshot_json, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          crypto.randomUUID(),
          event.tenant_id,
          payload.lessonId,
          Number(payload.sourceVersion),
          payload.actorUserId || payload.lesson?.updatedBy || "system",
          payload.actorRole || "system",
          payload.correctionReason ?? "PostgreSQL rollback relay",
          JSON.stringify(payload.records),
          occurredAt,
        );
      }
      this.sqlite.prepare(`
        INSERT OR IGNORE INTO lesson_events
          (id, tenant_id, lesson_id, actor_user_id, actor_role, action, reason,
           before_json, after_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        event.id,
        event.tenant_id,
        payload.lessonId,
        payload.actorUserId || payload.lesson?.updatedBy || "system",
        payload.actorRole || "system",
        payload.eventAction || (isReopen ? "completion_reversed" : payload.before?.lesson?.status === "completed" ? "attendance_corrected" : "completed"),
        payload.correctionReason || "",
        payload.before ? JSON.stringify(payload.before) : null,
        JSON.stringify(payload.after || { lesson: payload.lesson || {}, attendance: payload.records }),
        occurredAt,
      );
      this.sqlite.exec("COMMIT");
      return { applied: applyState, reason: applyState ? "applied" : "stale-history-materialized" };
    } catch (error) {
      this.sqlite.exec("ROLLBACK");
      throw error;
    }
  }

  applyReason(event, payload) {
    if (!["attendance_reason.created", "attendance_reason.updated"].includes(event.event_type)) {
      throw new Error(`Unsupported attendance reason event: ${event.event_type}`);
    }
    if (!payload || payload.tenantId !== event.tenant_id || !payload.reason?.id) {
      throw new Error("Reverse attendance reason payload is invalid");
    }
    const reason = payload.reason;
    const sourceVersion = Number(payload.sourceVersion || reason.version || event.source_version || 0);
    if (sourceVersion < 1) throw new Error("Reverse attendance reason version is invalid");
    const occurredAt = reason.updatedAt || event.created_at || new Date().toISOString();
    this.sqlite.exec("BEGIN IMMEDIATE");
    try {
      const accepted = this.sqlite.prepare(`
        INSERT OR IGNORE INTO migration_inbox
          (tenant_id, event_id, source_store, event_type, received_at)
        VALUES (?, ?, 'postgres', ?, ?)
      `).run(event.tenant_id, event.id, event.event_type, occurredAt);
      if (!accepted.changes) {
        this.sqlite.exec("COMMIT");
        return { applied: false, reason: "duplicate" };
      }
      const currentById = this.sqlite.prepare(
        "SELECT tenant_id, version FROM attendance_reasons WHERE id = ? LIMIT 1",
      ).get(reason.id);
      if (currentById && currentById.tenant_id !== event.tenant_id) {
        throw new Error("Attendance reason id belongs to another tenant");
      }
      let applied = false;
      if (!currentById) {
        this.sqlite.prepare(`
          INSERT INTO attendance_reasons
            (id, tenant_id, code, name, attendance_status, charge_percent, consume_percent,
             is_active, is_system, version, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          reason.id, event.tenant_id, reason.code, reason.name, reason.attendanceStatus,
          Number(reason.chargePercent), Number(reason.consumePercent), reason.isActive ? 1 : 0,
          reason.isSystem ? 1 : 0, sourceVersion, reason.createdAt || occurredAt, occurredAt,
        );
        applied = true;
      } else if (Number(currentById.version || 1) < sourceVersion) {
        const update = this.sqlite.prepare(`
          UPDATE attendance_reasons
          SET code = ?, name = ?, attendance_status = ?, charge_percent = ?, consume_percent = ?,
              is_active = ?, is_system = ?, version = ?, updated_at = ?
          WHERE tenant_id = ? AND id = ? AND version < ?
        `).run(
          reason.code, reason.name, reason.attendanceStatus, Number(reason.chargePercent),
          Number(reason.consumePercent), reason.isActive ? 1 : 0, reason.isSystem ? 1 : 0,
          sourceVersion, occurredAt, event.tenant_id, reason.id, sourceVersion,
        );
        applied = Number(update.changes || 0) === 1;
      }
      this.sqlite.exec("COMMIT");
      return { applied, reason: applied ? "applied" : "stale" };
    } catch (error) {
      this.sqlite.exec("ROLLBACK");
      throw error;
    }
  }

  async runOnce() {
    if (this.running) return { processed: 0, applied: 0, skipped: true };
    this.running = true;
    let processed = 0;
    let applied = 0;
    let failed = 0;
    try {
      for (const event of await this.pending()) {
        try {
          const result = this.apply(event);
          await this.markDone(event);
          processed += 1;
          if (result.applied) applied += 1;
        } catch (error) {
          await this.markFailed(event, error);
          failed += 1;
        }
      }
      return { processed, applied, failed, skipped: false };
    } finally {
      this.running = false;
    }
  }
}

module.exports = { PostgresAttendanceOutboxRelay };
