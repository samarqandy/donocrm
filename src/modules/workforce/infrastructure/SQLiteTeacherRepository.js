"use strict";

const { conflict, persistenceContext } = require("./sqliteSupport");

const TEACHER_FIELDS = `
  id, tenant_id, branch_id, name, phone, email, specialization,
  employment_type, status, hired_at, max_weekly_minutes, note, created_at
`;

function teacherSnapshot(row) {
  if (!row) return null;
  return Object.freeze({
    id: row.id,
    tenantId: row.tenant_id,
    branchId: row.branch_id || null,
    name: row.name,
    phone: row.phone || "",
    email: row.email || "",
    specialization: row.specialization || "",
    employmentType: row.employment_type,
    status: row.status,
    hiredAt: row.hired_at || null,
    maxWeeklyMinutes: Number(row.max_weekly_minutes),
    note: row.note || "",
    createdAt: row.created_at || "",
  });
}

class SQLiteTeacherRepository {
  constructor(db) {
    if (!db || typeof db.prepare !== "function") throw new TypeError("Injected SQLite database is required");
    this.db = db;
  }

  findById(context, teacherId) {
    const { tenantId } = persistenceContext(context);
    return teacherSnapshot(this.db.prepare(`
      SELECT ${TEACHER_FIELDS}
      FROM teachers
      WHERE tenant_id = ? AND id = ?
      LIMIT 1
    `).get(tenantId, teacherId));
  }

  insert(context, record) {
    const { tenantId } = persistenceContext(context);
    try {
      this.db.prepare(`
        INSERT INTO teachers (
          id, tenant_id, branch_id, name, phone, email, specialization,
          employment_type, status, hired_at, max_weekly_minutes, note, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        record.id,
        tenantId,
        record.branchId || null,
        record.name,
        record.phone || "",
        record.email || "",
        record.specialization || "",
        record.employmentType,
        record.status,
        record.hiredAt || null,
        record.maxWeeklyMinutes,
        record.note || "",
        record.createdAt,
      );
    } catch (error) {
      throw conflict(error, "Teacher record conflicts with owned storage");
    }
    return this.findById(context, record.id);
  }

  replaceProfile(context, replacement) {
    const { tenantId } = persistenceContext(context);
    try {
      const result = this.db.prepare(`
        UPDATE teachers
        SET branch_id = ?, name = ?, phone = ?, email = ?, specialization = ?,
            employment_type = ?, hired_at = ?, max_weekly_minutes = ?, note = ?
        WHERE tenant_id = ? AND id = ?
      `).run(
        replacement.branchId || null,
        replacement.name,
        replacement.phone || "",
        replacement.email || "",
        replacement.specialization || "",
        replacement.employmentType,
        replacement.hiredAt || null,
        replacement.maxWeeklyMinutes,
        replacement.note || "",
        tenantId,
        replacement.teacherId,
      );
      if (Number(result.changes) !== 1) return null;
    } catch (error) {
      throw conflict(error, "Teacher profile conflicts with owned storage");
    }
    return this.findById(context, replacement.teacherId);
  }

  setStatus(context, change) {
    const { tenantId } = persistenceContext(context);
    if (!["active", "inactive"].includes(change.status)) throw new TypeError("Teacher status is invalid");
    const result = this.db.prepare(`
      UPDATE teachers SET status = ? WHERE tenant_id = ? AND id = ?
    `).run(change.status, tenantId, change.teacherId);
    return Number(result.changes) === 1 ? this.findById(context, change.teacherId) : null;
  }

  listTenantBase(context) {
    const { tenantId } = persistenceContext(context);
    return Object.freeze(this.db.prepare(`
      SELECT ${TEACHER_FIELDS}
      FROM teachers
      WHERE tenant_id = ?
      ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END, name
    `).all(tenantId).map(teacherSnapshot));
  }

  getBaseProfile(context, teacherId) {
    return this.findById(context, teacherId);
  }

  getReference(context, teacherId) {
    const { tenantId } = persistenceContext(context);
    const row = this.db.prepare(`
      SELECT tenant_id, id, name, status, branch_id
      FROM teachers
      WHERE tenant_id = ? AND id = ?
      LIMIT 1
    `).get(tenantId, teacherId);
    if (!row) return null;
    return Object.freeze({
      tenantId: row.tenant_id,
      teacherId: row.id,
      displayName: row.name,
      status: row.status,
      branchId: row.branch_id || null,
    });
  }
}

module.exports = { SQLiteTeacherRepository, TEACHER_FIELDS, teacherSnapshot };
