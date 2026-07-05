const { id } = require("../utils/id");
const { now, today } = require("../utils/time");

function camelStudent(row) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    groupId: row.group_id,
    parentName: row.parent_name,
    phone: row.phone,
    telegramChatId: row.telegram_chat_id,
    debt: row.debt,
    groupName: row.group_name,
  };
}

function camelGroup(row) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    subject: row.subject,
    teacherId: row.teacher_id,
    teacherName: row.teacher_name,
    room: row.room,
    monthlyFee: row.monthly_fee,
    active: Boolean(row.active),
    studentsCount: row.students_count || 0,
  };
}

function camelLesson(row) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    groupId: row.group_id,
    date: row.date,
    time: row.time,
    status: row.status,
    groupName: row.group_name,
    subject: row.subject,
    room: row.room,
    teacherId: row.teacher_id,
    teacherName: row.teacher_name,
  };
}

function camelPayment(row) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    studentId: row.student_id,
    studentName: row.student_name,
    amount: row.amount,
    type: row.type,
    createdAt: row.created_at,
  };
}

function camelMessage(row) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    to: row.recipient,
    channel: row.channel,
    text: row.text,
    status: row.status,
    attempts: row.attempts,
    createdAt: row.created_at,
    sentAt: row.sent_at,
  };
}

function camelLead(row) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    phone: row.phone,
    source: row.source,
    status: row.status,
    note: row.note,
    createdAt: row.created_at,
  };
}

function camelAudit(row) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    userId: row.user_id,
    role: row.role,
    action: row.action,
    entity: row.entity,
    entityId: row.entity_id,
    createdAt: row.created_at,
  };
}

function camelAttendance(row) {
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
    note: row.note,
    createdAt: row.created_at,
    lessonTime: row.lesson_time,
    lessonDate: row.lesson_date,
  };
}

class AppRepository {
  constructor(db) {
    this.db = db;
  }

  tenant(tenantId) {
    const row = this.db.prepare("SELECT id, name, type, status, plan, language, telegram_bot, telegram_bot_token, created_at FROM tenants WHERE id = ?").get(tenantId);
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      type: row.type,
      status: row.status,
      plan: row.plan,
      language: row.language,
      telegramBot: row.telegram_bot,
      telegramBotTokenSet: Boolean(row.telegram_bot_token),
      createdAt: row.created_at,
    };
  }

  userByUsername(username) {
    return this.db.prepare("SELECT id, tenant_id, username, password, name, role FROM users WHERE username = ?").get(username);
  }

  userBySession(sessionId, nowIso) {
    return this.db
      .prepare(
        `SELECT u.id, u.tenant_id, u.username, u.name, u.role, s.id AS session_id
         FROM sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.id = ? AND s.expires_at > ?`,
      )
      .get(sessionId, nowIso);
  }

  createSession(user, sessionId, createdAt, expiresAt) {
    this.db.prepare("INSERT INTO sessions (id, user_id, tenant_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?)").run(
      sessionId,
      user.id,
      user.tenant_id,
      createdAt,
      expiresAt,
    );
  }

  deleteSession(sessionId) {
    this.db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
  }

  updateTelegramSettings(tenantId, payload) {
    this.db.prepare("UPDATE tenants SET telegram_bot = ?, telegram_bot_token = ? WHERE id = ?").run(payload.telegramBot, payload.telegramBotToken, tenantId);
    return this.tenant(tenantId);
  }

  students(tenantId) {
    return this.db
      .prepare(
        `SELECT s.*, g.name AS group_name
         FROM students s
         JOIN groups g ON g.id = s.group_id
         WHERE s.tenant_id = ?
         ORDER BY s.name`,
      )
      .all(tenantId)
      .map(camelStudent);
  }

  groups(tenantId) {
    return this.db
      .prepare(
        `SELECT g.*, t.name AS teacher_name, COUNT(s.id) AS students_count
         FROM groups g
         LEFT JOIN teachers t ON t.id = g.teacher_id
         LEFT JOIN students s ON s.group_id = g.id AND s.tenant_id = g.tenant_id
         WHERE g.tenant_id = ?
         GROUP BY g.id
         ORDER BY g.name`,
      )
      .all(tenantId)
      .map(camelGroup);
  }

  group(tenantId, groupId) {
    return this.groups(tenantId).find((group) => group.id === groupId);
  }

  teachers(tenantId) {
    return this.db.prepare("SELECT id, tenant_id AS tenantId, name, phone FROM teachers WHERE tenant_id = ? ORDER BY name").all(tenantId);
  }

  teacher(tenantId, teacherId) {
    return this.teachers(tenantId).find((teacher) => teacher.id === teacherId);
  }

  lessons(tenantId) {
    return this.db
      .prepare(
        `SELECT l.*, g.name AS group_name, g.subject, g.room, g.teacher_id, t.name AS teacher_name
         FROM lessons l
         JOIN groups g ON g.id = l.group_id
         LEFT JOIN teachers t ON t.id = g.teacher_id
         WHERE l.tenant_id = ?
         ORDER BY l.date, l.time`,
      )
      .all(tenantId)
      .map(camelLesson);
  }

  payments(tenantId) {
    return this.db.prepare("SELECT * FROM payments WHERE tenant_id = ? ORDER BY created_at DESC").all(tenantId).map(camelPayment);
  }

  messages(tenantId) {
    return this.db.prepare("SELECT * FROM messages WHERE tenant_id = ? ORDER BY created_at DESC").all(tenantId).map(camelMessage);
  }

  leads(tenantId) {
    return this.db.prepare("SELECT * FROM leads WHERE tenant_id = ? ORDER BY created_at DESC").all(tenantId).map(camelLead);
  }

  auditLogs(tenantId) {
    return this.db.prepare("SELECT * FROM audit_logs WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 25").all(tenantId).map(camelAudit);
  }

  attendanceCounts(tenantId) {
    const rows = this.db.prepare("SELECT status, COUNT(*) AS count FROM attendance WHERE tenant_id = ? GROUP BY status").all(tenantId);
    const counts = { present: 0, absent: 0, late: 0, excused: 0 };
    rows.forEach((row) => {
      counts[row.status] = row.count;
    });
    return counts;
  }

  attendanceRecords(tenantId) {
    return this.db
      .prepare(
        `SELECT a.*, s.name AS student_name, s.parent_name, l.group_id, l.time AS lesson_time, l.date AS lesson_date,
                g.name AS group_name, g.subject, g.teacher_id
         FROM attendance a
         JOIN students s ON s.id = a.student_id
         JOIN lessons l ON l.id = a.lesson_id
         JOIN groups g ON g.id = l.group_id
         WHERE a.tenant_id = ?
         ORDER BY a.created_at DESC`,
      )
      .all(tenantId)
      .map(camelAttendance);
  }

  createStudent(tenantId, payload) {
    const row = { id: id(), tenantId, ...payload };
    this.db.prepare(
      "INSERT INTO students (id, tenant_id, name, group_id, parent_name, phone, telegram_chat_id, debt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(row.id, tenantId, row.name, row.groupId, row.parentName, row.phone || "", row.telegramChatId || "", row.debt || 0);
    return row;
  }

  createGroup(tenantId, payload) {
    const row = { id: id(), tenantId, ...payload };
    this.db.prepare(
      "INSERT INTO groups (id, tenant_id, name, subject, teacher_id, room, monthly_fee, active) VALUES (?, ?, ?, ?, ?, ?, ?, 1)",
    ).run(row.id, tenantId, row.name, row.subject, row.teacherId, row.room || "", row.monthlyFee || 0);
    return row;
  }

  createLesson(tenantId, payload) {
    const row = { id: id(), tenantId, ...payload, date: payload.date || today(), status: payload.status || "waiting" };
    this.db.prepare("INSERT INTO lessons (id, tenant_id, group_id, date, time, status) VALUES (?, ?, ?, ?, ?, ?)").run(
      row.id,
      tenantId,
      row.groupId,
      row.date,
      row.time,
      row.status,
    );
    return row;
  }

  lesson(tenantId, lessonId) {
    return this.lessons(tenantId).find((lesson) => lesson.id === lessonId);
  }

  studentsByGroup(tenantId, groupId) {
    return this.students(tenantId).filter((student) => student.groupId === groupId);
  }

  replaceAttendance(tenantId, lessonId, records) {
    this.db.exec("BEGIN");
    try {
      this.db.prepare("DELETE FROM attendance WHERE tenant_id = ? AND lesson_id = ?").run(tenantId, lessonId);
      const stmt = this.db.prepare("INSERT INTO attendance (id, tenant_id, lesson_id, student_id, status, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)");
      records.forEach((record) => stmt.run(id(), tenantId, lessonId, record.studentId, record.status, record.note || "", now()));
      this.db.prepare("UPDATE lessons SET status = 'completed' WHERE tenant_id = ? AND id = ?").run(tenantId, lessonId);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  createPayment(tenantId, student, payload) {
    const row = { id: id(), tenantId, studentId: student.id, studentName: student.name, amount: payload.amount, type: payload.type, createdAt: now() };
    this.db.exec("BEGIN");
    try {
      this.db.prepare("INSERT INTO payments (id, tenant_id, student_id, student_name, amount, type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
        row.id,
        tenantId,
        student.id,
        student.name,
        row.amount,
        row.type,
        row.createdAt,
      );
      this.db.prepare("UPDATE students SET debt = MAX(0, debt - ?) WHERE tenant_id = ? AND id = ?").run(row.amount, tenantId, student.id);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return row;
  }

  createMessage(tenantId, payload) {
    const row = { id: id(), tenantId, channel: "telegram", status: "queued", attempts: 0, createdAt: now(), ...payload };
    this.db.prepare("INSERT INTO messages (id, tenant_id, recipient, channel, text, status, attempts, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(
      row.id,
      tenantId,
      row.to,
      row.channel,
      row.text,
      row.status,
      row.attempts,
      row.createdAt,
    );
    return row;
  }

  processMessages(tenantId) {
    const queued = this.db.prepare("SELECT * FROM messages WHERE tenant_id = ? AND status = 'queued'").all(tenantId);
    const stmt = this.db.prepare("UPDATE messages SET attempts = attempts + 1, status = ?, sent_at = ? WHERE id = ?");
    queued.forEach((message) => stmt.run(message.attempts + 1 > 2 ? "failed" : "sent", now(), message.id));
    return queued.length;
  }

  createLead(tenantId, payload) {
    const row = { id: id(), tenantId, createdAt: now(), ...payload };
    this.db.prepare("INSERT INTO leads (id, tenant_id, name, phone, source, status, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(
      row.id,
      tenantId,
      row.name,
      row.phone || "",
      row.source || "Manual",
      row.status,
      row.note || "",
      row.createdAt,
    );
    return row;
  }

  importStudents(tenantId, students) {
    const stmt = this.db.prepare("INSERT INTO students (id, tenant_id, name, phone, parent_name, group_id, telegram_chat_id, debt) VALUES (?, ?, ?, ?, ?, ?, '', ?)");
    this.db.exec("BEGIN");
    try {
      students.forEach((student) => stmt.run(id(), tenantId, student.name, student.phone || "", student.parentName || "", student.groupId, student.debt || 0));
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return students.length;
  }

  student(tenantId, studentId) {
    return this.students(tenantId).find((student) => student.id === studentId);
  }

  audit(context, action, entity, entityId) {
    this.db.prepare("INSERT INTO audit_logs (id, tenant_id, user_id, role, action, entity, entity_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(
      id(),
      context.tenantId,
      context.userId,
      context.role,
      action,
      entity,
      entityId,
      now(),
    );
  }
}

module.exports = { AppRepository };
