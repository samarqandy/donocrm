const { DomainError } = require("../../../core/errors/DomainError");

function teacherStudent(student) {
  const { debt, balance, telegramChatId, parentEmail, ...safe } = student;
  return safe;
}

class GetAttendanceLesson {
  constructor({ repository }) {
    this.repository = repository;
  }

  async execute(context, lessonIdInput) {
    const tenantId = String(context.tenantId || "").trim();
    const lessonId = String(lessonIdInput || "").trim();
    if (!tenantId) throw new DomainError("Tenant context is required", 403);
    if (!lessonId) throw new DomainError("lessonId is required");
    const lesson = await this.repository.findLesson(tenantId, lessonId);
    if (!lesson) throw new DomainError("Lesson not found", 404);
    if (context.role === "teacher" && lesson.teacherId !== context.userId) {
      throw new DomainError("Only assigned teacher can view this lesson roster", 403);
    }
    const students = await this.repository.findLessonRoster(tenantId, lessonId);
    return {
      lesson,
      students: context.role === "teacher" ? students.map(teacherStudent) : students,
    };
  }
}

module.exports = { GetAttendanceLesson };
