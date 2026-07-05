const { enumValue, positiveAmount, required } = require("./validation");

function attendanceCounts(records) {
  return records.reduce(
    (counts, record) => {
      counts[record.status] = (counts[record.status] || 0) + 1;
      return counts;
    },
    { present: 0, absent: 0, late: 0, excused: 0 },
  );
}

class AppService {
  constructor(repository) {
    this.repository = repository;
  }

  bootstrap(context) {
    const tenant = this.repository.tenant(context.tenantId);
    if (!tenant) {
      const error = new Error("Tenant not found");
      error.status = 404;
      throw error;
    }

    let students = this.repository.students(context.tenantId);
    let groups = this.repository.groups(context.tenantId);
    let teachers = this.repository.teachers(context.tenantId);
    let lessons = this.repository.lessons(context.tenantId);
    let payments = this.repository.payments(context.tenantId);
    let messages = this.repository.messages(context.tenantId);
    let leads = this.repository.leads(context.tenantId);
    let auditLogs = this.repository.auditLogs(context.tenantId);
    let attendanceRecords = this.repository.attendanceRecords(context.tenantId);

    if (context.role === "teacher") {
      lessons = lessons.filter((lesson) => lesson.teacherId === context.userId);
      const groupIds = new Set(lessons.map((lesson) => lesson.groupId));
      students = students
        .filter((student) => groupIds.has(student.groupId))
        .map((student) => ({ ...student, debt: 0, telegramChatId: "" }));
      groups = groups.filter((group) => group.teacherId === context.userId).map((group) => ({ ...group, monthlyFee: 0 }));
      teachers = teachers.filter((teacher) => teacher.id === context.userId);
      attendanceRecords = attendanceRecords.filter((record) => record.teacherId === context.userId);
      payments = [];
      messages = [];
      leads = [];
      auditLogs = auditLogs.filter((log) => log.userId === context.userId);
    }

    const attendance = attendanceCounts(attendanceRecords);
    const debtors = context.role === "teacher" ? [] : students.filter((student) => student.debt > 0);
    const debtTotal = context.role === "teacher" ? 0 : students.reduce((sum, student) => sum + Number(student.debt || 0), 0);

    const dashboard = {
      tenant,
      stats: {
        students: students.length,
        groups: groups.length,
        teachers: teachers.length,
        lessonsToday: lessons.length,
        revenueToday: payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0),
        present: attendance.present,
        absent: attendance.absent,
        queuedMessages: messages.filter((message) => message.status === "queued").length,
        debtTotal,
      },
      lessons,
      debtors,
      messages: messages.slice(0, 8),
    };

    return { dashboard, students, groups, teachers, lessons, attendanceRecords, payments, messages, leads, auditLogs };
  }

  createStudent(context, body) {
    const groupId = required(body.groupId, "groupId");
    if (!this.repository.group(context.tenantId, groupId)) {
      const error = new Error("Group not found");
      error.status = 404;
      throw error;
    }
    const row = this.repository.createStudent(context.tenantId, {
      name: required(body.name, "name"),
      groupId,
      parentName: required(body.parentName, "parentName"),
      phone: body.phone || "",
      telegramChatId: body.telegramChatId || "",
      debt: Math.max(0, Number(body.debt || 0)),
    });
    this.repository.audit(context, "created", "student", row.id);
    return row;
  }

  createGroup(context, body) {
    const teacherId = required(body.teacherId, "teacherId");
    if (!this.repository.teacher(context.tenantId, teacherId)) {
      const error = new Error("Teacher not found");
      error.status = 404;
      throw error;
    }
    const row = this.repository.createGroup(context.tenantId, {
      name: required(body.name, "name"),
      subject: required(body.subject, "subject"),
      teacherId,
      room: body.room || "",
      monthlyFee: Math.max(0, Number(body.monthlyFee || 0)),
    });
    this.repository.audit(context, "created", "group", row.id);
    return row;
  }

  createLesson(context, body) {
    const groupId = required(body.groupId, "groupId");
    if (!this.repository.group(context.tenantId, groupId)) {
      const error = new Error("Group not found");
      error.status = 404;
      throw error;
    }
    const row = this.repository.createLesson(context.tenantId, {
      groupId,
      time: required(body.time, "time"),
      date: body.date,
    });
    this.repository.audit(context, "created", "lesson", row.id);
    return row;
  }

  saveAttendance(context, body) {
    const lessonId = required(body.lessonId, "lessonId");
    const lesson = this.repository.lesson(context.tenantId, lessonId);
    if (!lesson) {
      const error = new Error("Lesson not found");
      error.status = 404;
      throw error;
    }
    if (context.role === "teacher" && lesson.teacherId !== context.userId) {
      const error = new Error("Only assigned teacher can save attendance");
      error.status = 403;
      throw error;
    }

    const students = this.repository.studentsByGroup(context.tenantId, lesson.groupId);
    const allowedStudentIds = new Set(students.map((student) => student.id));
    const records = (body.records || []).map((record) => ({
      studentId: required(record.studentId, "studentId"),
      status: enumValue(record.status, ["present", "absent", "late", "excused"], "status"),
      note: record.note || "",
    }));

    records.forEach((record) => {
      if (!allowedStudentIds.has(record.studentId)) {
        const error = new Error("Student does not belong to this lesson group");
        error.status = 422;
        throw error;
      }
    });

    this.repository.replaceAttendance(context.tenantId, lessonId, records);
    const present = records.filter((record) => record.status === "present").length;
    this.repository.createMessage(context.tenantId, {
      to: `${lesson.groupName} ota-onalari`,
      text: `Davomat saqlandi: ${present}/${records.length} keldi.`,
    });
    this.repository.audit(context, "saved", "attendance", lessonId);
    return { ok: true, dashboard: this.bootstrap(context).dashboard };
  }

  createPayment(context, body) {
    const studentId = required(body.studentId, "studentId");
    const student = this.repository.student(context.tenantId, studentId);
    if (!student) {
      const error = new Error("Student not found");
      error.status = 404;
      throw error;
    }
    const row = this.repository.createPayment(context.tenantId, student, {
      amount: positiveAmount(body.amount),
      type: enumValue(body.type || "cash", ["cash", "card", "transfer"], "type"),
    });
    this.repository.createMessage(context.tenantId, {
      to: `${student.parentName} (${student.name})`,
      text: `To'lov qabul qilindi: ${row.amount.toLocaleString("ru-RU")} so'm.`,
    });
    this.repository.audit(context, "created", "payment", row.id);
    return row;
  }

  createMessage(context, body) {
    const row = this.repository.createMessage(context.tenantId, {
      to: required(body.to, "to"),
      text: required(body.text, "text"),
    });
    this.repository.audit(context, "queued", "message", row.id);
    return row;
  }

  updateTelegramSettings(context, body) {
    const telegramBot = required(body.telegramBot, "telegramBot");
    const telegramBotToken = required(body.telegramBotToken, "telegramBotToken");
    if (!/^\d+:[A-Za-z0-9_-]{20,}$/.test(telegramBotToken)) {
      const error = new Error("Telegram bot token format is invalid");
      error.status = 422;
      throw error;
    }
    const tenant = this.repository.updateTelegramSettings(context.tenantId, {
      telegramBot,
      telegramBotToken,
    });
    this.repository.audit(context, "updated", "telegram_settings", context.tenantId);
    return tenant;
  }

  processMessages(context) {
    const processed = this.repository.processMessages(context.tenantId);
    this.repository.audit(context, "processed", "message_queue", "telegram");
    return { processed };
  }

  createLead(context, body) {
    const row = this.repository.createLead(context.tenantId, {
      name: required(body.name, "name"),
      phone: body.phone || "",
      source: body.source || "Manual",
      status: enumValue(body.status || "new", ["new", "contacted", "converted"], "status"),
      note: body.note || "",
    });
    this.repository.audit(context, "created", "lead", row.id);
    return row;
  }

  importStudents(context, body) {
    const students = String(body.csv || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [name, phone, parentName, groupId, debt] = line.split(",").map((item) => item?.trim());
        return { name, phone, parentName, groupId, debt: Number(debt || 0) };
      })
      .filter((student) => student.name && student.groupId);

    const groupIds = new Set(this.repository.groups(context.tenantId).map((group) => group.id));
    const unknownGroup = students.find((student) => !groupIds.has(student.groupId));
    if (unknownGroup) {
      const error = new Error(`CSV contains unknown groupId: ${unknownGroup.groupId}`);
      error.status = 422;
      throw error;
    }

    const imported = this.repository.importStudents(context.tenantId, students);
    this.repository.audit(context, "imported", "students", String(imported));
    return { imported };
  }
}

module.exports = { AppService };
