"use strict";

const {
  OwnedRecordConflictError,
  conflict,
  immediateTransaction,
  persistenceContext,
} = require("./sqliteSupport");

const WORKING_HOUR_FIELDS = `
  id, tenant_id, branch_id, teacher_id, weekday, start_time, end_time, created_at
`;

function workingHourSnapshot(row) {
  if (!row) return null;
  return Object.freeze({
    id: row.id,
    tenantId: row.tenant_id,
    branchId: row.branch_id || null,
    teacherId: row.teacher_id,
    weekday: row.weekday,
    startTime: row.start_time,
    endTime: row.end_time,
    createdAt: row.created_at,
  });
}

class SQLiteTeacherWorkingHourRepository {
  constructor(db) {
    if (!db || typeof db.prepare !== "function") throw new TypeError("Injected SQLite database is required");
    this.db = db;
  }

  list(context, filter = { teacherId: null }) {
    const { tenantId } = persistenceContext(context);
    const teacherId = filter.teacherId || null;
    const rows = teacherId
      ? this.db.prepare(`
          SELECT ${WORKING_HOUR_FIELDS}
          FROM teacher_working_hours
          WHERE tenant_id = ? AND teacher_id = ?
          ORDER BY CAST(weekday AS INTEGER), start_time, end_time, id
        `).all(tenantId, teacherId)
      : this.db.prepare(`
          SELECT ${WORKING_HOUR_FIELDS}
          FROM teacher_working_hours
          WHERE tenant_id = ?
          ORDER BY teacher_id, CAST(weekday AS INTEGER), start_time, end_time, id
        `).all(tenantId);
    return Object.freeze(rows.map(workingHourSnapshot));
  }

  findById(context, workingHourId) {
    const { tenantId } = persistenceContext(context);
    return workingHourSnapshot(this.db.prepare(`
      SELECT ${WORKING_HOUR_FIELDS}
      FROM teacher_working_hours
      WHERE tenant_id = ? AND id = ?
      LIMIT 1
    `).get(tenantId, workingHourId));
  }

  findOverlap(context, query) {
    const { tenantId } = persistenceContext(context);
    const row = this.db.prepare(`
      SELECT id
      FROM teacher_working_hours
      WHERE tenant_id = ? AND teacher_id = ? AND weekday = ?
        AND start_time < ? AND end_time > ?
      ORDER BY id
      LIMIT 1
    `).get(tenantId, query.teacherId, String(query.weekday), query.endTime, query.startTime);
    return row?.id || null;
  }

  insert(context, record) {
    persistenceContext(context);
    try {
      return immediateTransaction(this.db, () => {
        if (this.findOverlap(context, record)) {
          throw new OwnedRecordConflictError("Working Hour overlaps an owned interval");
        }
        this.db.prepare(`
          INSERT INTO teacher_working_hours (
            id, tenant_id, branch_id, teacher_id, weekday, start_time, end_time, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          record.id,
          context.tenantId,
          record.branchId || null,
          record.teacherId,
          String(record.weekday),
          record.startTime,
          record.endTime,
          record.createdAt,
        );
        return this.findById(context, record.id);
      });
    } catch (error) {
      throw conflict(error, "Working Hour record conflicts with owned storage");
    }
  }

  deleteById(context, workingHourId) {
    persistenceContext(context);
    return immediateTransaction(this.db, () => {
      const existing = this.findById(context, workingHourId);
      if (!existing) return null;
      const result = this.db.prepare(`
        DELETE FROM teacher_working_hours WHERE tenant_id = ? AND id = ?
      `).run(context.tenantId, workingHourId);
      return Number(result.changes) === 1 ? existing : null;
    });
  }
}

module.exports = {
  SQLiteTeacherWorkingHourRepository,
  WORKING_HOUR_FIELDS,
  workingHourSnapshot,
};
