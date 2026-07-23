const { id } = require("../../../utils/id");

class SQLiteAttendanceNotificationRepository {
  constructor(db) {
    this.db = db;
  }

  queue(tenantId, messages, occurredAt) {
    const contact = this.db.prepare(`
      SELECT CASE
        WHEN guardian_link.id IS NOT NULL AND COALESCE(guardian_link.receives_notifications, 1) != 1 THEN NULL
        ELSE COALESCE(NULLIF(guardian.telegram_chat_id, ''), NULLIF(student.telegram_chat_id, ''))
      END AS telegram_chat_id
      FROM students student
      LEFT JOIN student_guardians guardian_link
        ON guardian_link.tenant_id = student.tenant_id
       AND guardian_link.student_id = student.id AND guardian_link.is_primary = 1
      LEFT JOIN guardians guardian
        ON guardian.tenant_id = guardian_link.tenant_id AND guardian.id = guardian_link.guardian_id
      WHERE student.tenant_id = ? AND student.id = ?
      LIMIT 1
    `);
    const insert = this.db.prepare(`
      INSERT OR IGNORE INTO messages
        (id, tenant_id, student_id, recipient, channel, text, status, attempts, created_at, dedupe_key)
      VALUES (?, ?, ?, ?, 'telegram', ?, 'queued', 0, ?, ?)
    `);
    let sentCount = 0;
    let skippedCount = 0;
    let alreadyQueuedCount = 0;
    this.db.exec("BEGIN IMMEDIATE");
    try {
      for (const message of messages) {
        const recipient = contact.get(tenantId, message.studentId);
        if (!recipient?.telegram_chat_id) {
          skippedCount += 1;
          continue;
        }
        const result = insert.run(
          id(), tenantId, message.studentId, message.recipient,
          message.text, occurredAt, message.dedupeKey,
        );
        if (Number(result.changes || 0)) sentCount += 1;
        else alreadyQueuedCount += 1;
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return {
      sent_count: sentCount,
      skipped_count: skippedCount,
      already_queued_count: alreadyQueuedCount,
    };
  }
}

module.exports = { SQLiteAttendanceNotificationRepository };
