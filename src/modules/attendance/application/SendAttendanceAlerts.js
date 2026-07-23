const { DomainError } = require("../../../core/errors/DomainError");

class SendAttendanceAlerts {
  constructor({ repository, notificationRepository, clock }) {
    this.repository = repository;
    this.notificationRepository = notificationRepository;
    this.clock = clock;
  }

  async execute(context, lessonIdInput) {
    const tenantId = String(context.tenantId || "").trim();
    const lessonId = String(lessonIdInput || "").trim();
    if (!tenantId) throw new DomainError("Tenant context is required", 403);
    if (!lessonId) throw new DomainError("lessonId is required");
    const source = await this.repository.findAlertSource(tenantId, lessonId);
    if (!source) throw new DomainError("Lesson not found", 404);
    if (context.role === "teacher" && source.lesson.teacherId !== context.userId) {
      throw new DomainError("Only assigned teacher can send attendance alerts", 403);
    }
    if (source.lesson.status !== "completed") {
      throw new DomainError("Attendance alerts require a completed lesson", 409);
    }
    const subject = source.lesson.subject || source.lesson.groupName || "dars";
    const teacherName = source.lesson.teacherName || "o'qituvchi";
    const dateText = source.lesson.date === this.clock.today() ? "bugun" : `${source.lesson.date} kungi`;
    const messages = source.records.map((record) => ({
      studentId: record.studentId,
      recipient: record.studentName,
      text: `Assalomu alaykum! 🎓 ${subject} guruhidan xabar. O'qituvchi: ${teacherName}. ${record.studentName} ${dateText} soat ${source.lesson.startTime} dagi darsga ${record.status === "late" ? "kechikdi" : "kelmadi"}. Sababini bilish uchun guruhga yozavering.`,
      dedupeKey: `attendance:${lessonId}:${source.lesson.attendanceVersion}:${record.studentId}:${record.status}`,
    }));
    const result = await this.notificationRepository.queue(tenantId, messages, this.clock.now());
    await this.repository.audit(context, "queued", lessonId, "attendance_alerts");
    return { success: true, ...result };
  }
}

module.exports = { SendAttendanceAlerts };
