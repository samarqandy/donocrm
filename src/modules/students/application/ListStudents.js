const { DomainError } = require("../../../core/errors/DomainError");

function teacherStudentDto(student) {
  const { debt, balance, telegramChatId, ...safeStudent } = student;
  return safeStudent;
}

class ListStudents {
  constructor({ repository, attendanceQueries }) {
    this.repository = repository;
    this.attendanceQueries = attendanceQueries;
  }

  async execute(context, query = {}) {
    if (!context?.tenantId) throw new DomainError("Tenant context is required", 403);
    const search = String(query.search || "").trim();
    const teacherId = context.role === "teacher" ? context.userId : null;
    const includeArchived = context.role === "admin" && Boolean(query.includeArchived);
    const students = await this.repository.list({
      tenantId: context.tenantId,
      teacherId,
      search,
      includeArchived,
    });
    const queryRepository = this.attendanceQueries(context.tenantId);
    const stats = await queryRepository.studentStats(
      context.tenantId,
      students.map((student) => student.id),
    );
    const projected = students.map((student) => ({
      ...student,
      ...(stats[student.id] || { attendanceTotal: 0, attendancePresent: 0, attendanceRate: 0 }),
    }));
    return context.role === "teacher" ? projected.map(teacherStudentDto) : projected;
  }
}

module.exports = { ListStudents, teacherStudentDto };
