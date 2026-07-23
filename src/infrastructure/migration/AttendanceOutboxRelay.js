const crypto = require("node:crypto");
const { buildAttendanceMigrationRows, upsert } = require("./AttendanceBackfill");

const REFERENCE_TABLES = new Set(["teachers", "groups", "students", "student_group_enrollments", "lessons", "lesson_events"]);

class AttendanceOutboxRelay {
  constructor({ sqlite, postgres, batchSize = 50 }) {
    this.sqlite = sqlite;
    this.postgres = postgres;
    this.batchSize = Math.max(1, Math.min(Number(batchSize) || 50, 500));
    this.running = false;
  }

  pending() {
    return this.sqlite.prepare(`
      SELECT * FROM migration_outbox
      WHERE source_store = 'sqlite' AND target_store = 'postgres'
        AND status IN ('pending', 'failed') AND attempts < 20
      ORDER BY sequence LIMIT ?
    `).all(this.batchSize);
  }

  markDone(event) {
    this.sqlite.prepare(`
      UPDATE migration_outbox SET status = 'done', processed_at = ?, last_error = NULL
      WHERE id = ?
    `).run(new Date().toISOString(), event.id);
  }

  markFailed(event, error) {
    this.sqlite.prepare(`
      UPDATE migration_outbox
      SET status = 'failed', attempts = attempts + 1, last_error = ?
      WHERE id = ?
    `).run(String(error.message || error).slice(0, 1000), event.id);
  }

  async apply(event) {
    const payload = JSON.parse(event.payload_json);
    if (event.aggregate_type === "attendance_reference") return this.applyReference(event, payload);
    if (event.aggregate_type === "attendance_reason") return this.applyReason(event, payload);
    const isReopen = event.event_type === "attendance.reopened";
    if (!isReopen && event.event_type !== "attendance.replaced") {
      throw new Error(`Unsupported attendance event: ${event.event_type}`);
    }
    const client = await this.postgres.connect();
    try {
      await client.query("BEGIN");
      const accepted = await client.query(`
        INSERT INTO migration_inbox(tenant_id, event_id, source_store, event_type)
        VALUES ($1, $2, 'sqlite', $3)
        ON CONFLICT(tenant_id, event_id) DO NOTHING
        RETURNING event_id
      `, [event.tenant_id, event.id, event.event_type]);
      if (!accepted.rowCount) {
        await client.query("COMMIT");
        return;
      }

      const current = await client.query(`
        SELECT *, attendance_version AS source_version
        FROM lessons WHERE tenant_id = $1 AND id = $2
      `, [payload.tenantId, payload.lessonId]);
      if (!current.rows[0]) throw new Error("Shadow lesson is missing in PostgreSQL; run attendance backfill first");
      const beforeAttendance = await client.query(`
        SELECT student_id AS "studentId", status, reason_id AS "reasonId",
               reason_code AS "reasonCode", reason_name AS "reasonName",
               charge_percent AS "chargePercent", consume_percent AS "consumePercent",
               COALESCE(note, '') AS note
        FROM attendance WHERE tenant_id = $1 AND lesson_id = $2 ORDER BY student_id
      `, [payload.tenantId, payload.lessonId]);
      // A lessons reference event can be sequenced before the attendance event
      // from the same SQLite transaction. In that case the lesson version is
      // already equal while the PostgreSQL attendance snapshot is still stale.
      // The inbox makes an accepted event idempotent, so equality must apply.
      const applyState = Number(current.rows[0].source_version || 0) <= Number(payload.sourceVersion);
      if (applyState) {
        await client.query("DELETE FROM attendance WHERE tenant_id = $1 AND lesson_id = $2", [payload.tenantId, payload.lessonId]);
        for (const record of payload.records) {
          await client.query(`
            INSERT INTO attendance
              (id, tenant_id, lesson_id, student_id, status, note, reason_id, reason_code,
               reason_name, charge_percent, consume_percent, source_version, created_at, updated_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13)
          `, [
            crypto.randomUUID(), payload.tenantId, payload.lessonId, record.studentId, record.status,
            record.note || "", record.reasonId || null, record.reasonCode || "", record.reasonName || "",
            record.chargePercent || 0, record.consumePercent || 0, payload.sourceVersion,
            payload.lesson.updatedAt || event.created_at,
          ]);
        }
        const lessonStatus = payload.lesson.status || (isReopen ? "waiting" : "completed");
        const financialStatus = payload.lesson.financialStatus || (isReopen ? "unposted" : "pending");
        await client.query(`
          UPDATE lessons SET status = $1, topic = $2, homework = $3, note = $4,
            attendance_version = GREATEST(attendance_version, $5),
            financial_status = $6, financial_posted_at = NULL, financial_posted_by = NULL,
            completed_by = CASE WHEN $1 = 'completed' THEN COALESCE(NULLIF(completed_by, ''), $7) ELSE NULL END,
            completed_at = CASE WHEN $1 = 'completed' THEN COALESCE(completed_at, $8) ELSE NULL END,
            updated_by = $7, updated_at = $8, version = version + 1
          WHERE tenant_id = $9 AND id = $10
        `, [
          lessonStatus, payload.lesson.topic || "", payload.lesson.homework || "", payload.lesson.note || "",
          payload.sourceVersion, financialStatus, payload.lesson.updatedBy || payload.actorUserId || "system",
          payload.lesson.updatedAt || event.created_at,
          payload.tenantId, payload.lessonId,
        ]);
      }
      if (!isReopen) {
        await client.query(`
          INSERT INTO lesson_attendance_revisions
            (id, tenant_id, lesson_id, revision_no, actor_user_id, actor_role,
             reason, snapshot_json, created_at, updated_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$9)
          ON CONFLICT (tenant_id, lesson_id, revision_no) DO NOTHING
        `, [
          crypto.randomUUID(), payload.tenantId, payload.lessonId, payload.sourceVersion,
          payload.actorUserId || payload.lesson.updatedBy || "system", payload.actorRole || "system",
          payload.correctionReason ?? "", JSON.stringify(payload.records),
          payload.lesson.updatedAt || event.created_at,
        ]);
      }
      await client.query(`
        INSERT INTO lesson_events
          (id, tenant_id, lesson_id, actor_user_id, actor_role, action, reason,
           before_json, after_json, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$10)
        ON CONFLICT (tenant_id, id) DO NOTHING
      `, [
        event.id, payload.tenantId, payload.lessonId,
        payload.actorUserId || payload.lesson.updatedBy || "system", payload.actorRole || "system",
        payload.eventAction || (isReopen ? "completion_reversed" : current.rows[0].status === "completed" ? "attendance_corrected" : "completed"),
        payload.correctionReason || "",
        JSON.stringify(payload.before || { lesson: current.rows[0], attendance: beforeAttendance.rows }),
        JSON.stringify(payload.after || { lesson: payload.lesson, attendance: payload.records }),
        payload.lesson.updatedAt || event.created_at,
      ]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async applyReference(event, payload) {
    const table = String(payload?.table || "");
    const aggregateId = String(payload?.id || "");
    const operation = String(payload?.operation || "");
    if (!REFERENCE_TABLES.has(table) || !aggregateId || !["upsert", "delete"].includes(operation)) {
      throw new Error("Attendance reference relay payload is invalid");
    }
    if (event.event_type !== `reference.${table}.${operation}`) {
      throw new Error("Attendance reference event type mismatch");
    }
    const sourceSequence = Number(event.sequence || 0);
    if (!Number.isSafeInteger(sourceSequence) || sourceSequence < 1) {
      throw new Error("Attendance reference sequence is invalid");
    }
    const client = await this.postgres.connect();
    try {
      await client.query("BEGIN");
      const accepted = await client.query(`
        INSERT INTO migration_inbox(tenant_id, event_id, source_store, event_type)
        VALUES ($1, $2, 'sqlite', $3)
        ON CONFLICT(tenant_id, event_id) DO NOTHING
        RETURNING event_id
      `, [event.tenant_id, event.id, event.event_type]);
      if (!accepted.rowCount) {
        await client.query("COMMIT");
        return { applied: false, reason: "duplicate" };
      }
      const version = await client.query(`
        INSERT INTO attendance_reference_mirror_versions
          (tenant_id, aggregate_type, aggregate_id, last_sequence)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (tenant_id, aggregate_type, aggregate_id) DO UPDATE
        SET last_sequence = EXCLUDED.last_sequence
        WHERE attendance_reference_mirror_versions.last_sequence < EXCLUDED.last_sequence
        RETURNING last_sequence
      `, [event.tenant_id, table, aggregateId, sourceSequence]);
      if (!version.rowCount) {
        await client.query("COMMIT");
        return { applied: false, reason: "stale" };
      }

      if (operation === "delete") {
        await client.query(`DELETE FROM ${table} WHERE tenant_id = $1 AND id = $2`, [event.tenant_id, aggregateId]);
      } else {
        const migrationRows = table === "lesson_events" ? null : buildAttendanceMigrationRows(this.sqlite, event.tenant_id);
        const row = table === "lesson_events"
          ? this.sqlite.prepare("SELECT * FROM lesson_events WHERE tenant_id = ? AND id = ? LIMIT 1").get(event.tenant_id, aggregateId)
          : migrationRows[table].find((candidate) => candidate.id === aggregateId);
        if (row) {
          if (table === "lesson_events") {
            await client.query(`
              INSERT INTO lesson_events
                (tenant_id, id, lesson_id, actor_user_id, actor_role, action, reason,
                 before_json, after_json, created_at, updated_at)
              VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$10)
              ON CONFLICT (tenant_id, id) DO UPDATE SET
                actor_user_id = EXCLUDED.actor_user_id,
                actor_role = EXCLUDED.actor_role,
                action = EXCLUDED.action,
                reason = EXCLUDED.reason,
                before_json = EXCLUDED.before_json,
                after_json = EXCLUDED.after_json,
                created_at = EXCLUDED.created_at
            `, [
              event.tenant_id, row.id, row.lesson_id, row.actor_user_id || null,
              row.actor_role || null, row.action, row.reason || "", row.before_json || null,
              row.after_json || null, row.created_at,
            ]);
          } else {
            await upsert(client, table, row);
          }
        } else {
          await client.query(`DELETE FROM ${table} WHERE tenant_id = $1 AND id = $2`, [event.tenant_id, aggregateId]);
        }
      }
      await client.query("COMMIT");
      return { applied: true, reason: operation };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async applyReason(event, payload) {
    if (!["attendance_reason.created", "attendance_reason.updated"].includes(event.event_type)) {
      throw new Error(`Unsupported attendance reason event: ${event.event_type}`);
    }
    if (!payload || payload.tenantId !== event.tenant_id || !payload.reason?.id) {
      throw new Error("Attendance reason relay payload is invalid");
    }
    const reason = payload.reason;
    const sourceVersion = Number(payload.sourceVersion || reason.version || event.source_version || 0);
    if (sourceVersion < 1) throw new Error("Attendance reason relay version is invalid");
    const client = await this.postgres.connect();
    try {
      await client.query("BEGIN");
      const accepted = await client.query(`
        INSERT INTO migration_inbox(tenant_id, event_id, source_store, event_type)
        VALUES ($1, $2, 'sqlite', $3)
        ON CONFLICT(tenant_id, event_id) DO NOTHING
        RETURNING event_id
      `, [event.tenant_id, event.id, event.event_type]);
      if (!accepted.rowCount) {
        await client.query("COMMIT");
        return { applied: false, reason: "duplicate" };
      }
      const applied = await client.query(`
        INSERT INTO attendance_reasons
          (tenant_id, id, code, name, attendance_status, charge_percent, consume_percent,
           is_active, is_system, version, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        ON CONFLICT (tenant_id, id) DO UPDATE SET
          code = EXCLUDED.code,
          name = EXCLUDED.name,
          attendance_status = EXCLUDED.attendance_status,
          charge_percent = EXCLUDED.charge_percent,
          consume_percent = EXCLUDED.consume_percent,
          is_active = EXCLUDED.is_active,
          is_system = EXCLUDED.is_system,
          version = EXCLUDED.version,
          updated_at = EXCLUDED.updated_at
        WHERE attendance_reasons.version < EXCLUDED.version
        RETURNING id
      `, [
        event.tenant_id, reason.id, reason.code, reason.name, reason.attendanceStatus,
        Number(reason.chargePercent), Number(reason.consumePercent), Boolean(reason.isActive),
        Boolean(reason.isSystem), sourceVersion, reason.createdAt || event.created_at,
        reason.updatedAt || event.created_at,
      ]);
      await client.query("COMMIT");
      return { applied: Boolean(applied.rowCount), reason: applied.rowCount ? "applied" : "stale" };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async runOnce() {
    if (this.running) return { processed: 0, skipped: true };
    this.running = true;
    let processed = 0;
    let failed = 0;
    try {
      for (const event of this.pending()) {
        try {
          await this.apply(event);
          this.markDone(event);
          processed += 1;
        } catch (error) {
          this.markFailed(event, error);
          failed += 1;
        }
      }
      return { processed, failed, skipped: false };
    } finally {
      this.running = false;
    }
  }
}

module.exports = { AttendanceOutboxRelay };
