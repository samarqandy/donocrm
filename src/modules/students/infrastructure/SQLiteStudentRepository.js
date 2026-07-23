const { StudentRepository } = require("../domain/StudentRepository");

function mapStudent(row) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    groupId: row.group_id,
    parentName: row.parent_name,
    phone: row.phone || "",
    parentRelationship: row.parent_relationship || "guardian",
    parentEmail: row.parent_email || "",
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
    groupName: row.group_name || "",
    attendanceTotal: 0,
    attendancePresent: 0,
    attendanceRate: 0,
  };
}

class SQLiteStudentRepository extends StudentRepository {
  constructor(db) {
    super();
    this.db = db;
  }

  list({ tenantId, teacherId = null, search = "", includeArchived = false }) {
    const clauses = ["student.tenant_id = ?"];
    const params = [tenantId];
    if (teacherId) {
      clauses.push("group_row.teacher_id = ?");
      params.push(teacherId);
    }
    if (!includeArchived) clauses.push("student.status != 'left'");
    const normalizedSearch = String(search || "").trim().toLowerCase();
    if (normalizedSearch) {
      clauses.push("(LOWER(student.name) LIKE ? OR LOWER(COALESCE(student.phone, '')) LIKE ?)");
      const like = `%${normalizedSearch}%`;
      params.push(like, like);
    }
    const limit = normalizedSearch ? "LIMIT 20" : "";
    return this.db.prepare(`
      SELECT student.*, group_row.name AS group_name,
             guardian_link.relationship AS parent_relationship,
             guardian.email AS parent_email,
             COALESCE(NULLIF(student.telegram_chat_id, ''), guardian.telegram_chat_id, '') AS effective_telegram_chat_id,
             COALESCE((
               SELECT SUM(CASE
                 WHEN transaction_row.effect = 'credit' THEN transaction_row.amount
                 WHEN transaction_row.effect = 'debit' THEN -transaction_row.amount
                 WHEN transaction_row.type IN ('payment', 'discount') THEN transaction_row.amount
                 ELSE -transaction_row.amount
               END)
               FROM invoices_transactions transaction_row
               WHERE transaction_row.tenant_id = student.tenant_id
                 AND transaction_row.student_id = student.id
                 AND COALESCE(transaction_row.status, 'active') = 'active'
             ), student.balance, 0) AS ledger_balance
      FROM students student
      JOIN groups group_row
        ON group_row.tenant_id = student.tenant_id AND group_row.id = student.group_id
      LEFT JOIN student_guardians guardian_link
        ON guardian_link.tenant_id = student.tenant_id
       AND guardian_link.student_id = student.id
       AND guardian_link.is_primary = 1
      LEFT JOIN guardians guardian
        ON guardian.tenant_id = guardian_link.tenant_id AND guardian.id = guardian_link.guardian_id
      WHERE ${clauses.join(" AND ")}
      ORDER BY CASE student.status WHEN 'left' THEN 1 ELSE 0 END, student.name, student.id
      ${limit}
    `).all(...params).map(mapStudent);
  }
}

module.exports = { SQLiteStudentRepository };
