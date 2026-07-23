const { Attendance } = require("../domain/Attendance");
const { DomainError } = require("../../../core/errors/DomainError");

const DEFAULT_REASON_CODES = {
  present: "present",
  absent: "absent_unexcused",
  late: "late",
  excused: "excused",
};

function text(value, max, field, fallback = "") {
  const result = String(value === undefined || value === null ? fallback : value).trim();
  if (result.length > max) throw new DomainError(`${field} is too long`);
  return result;
}

function normalized(records) {
  return records.map((record) => ({
    studentId: record.studentId,
    status: record.status,
    reasonId: record.reasonId || "",
    note: record.note || "",
  })).sort((left, right) => left.studentId.localeCompare(right.studentId));
}

class MarkAttendance {
  constructor({ repository, clock }) {
    this.repository = repository;
    this.clock = clock;
  }

  async execute(context, body) {
    const tenantId = String(context.tenantId || "").trim();
    const lessonId = String(body.lessonId || "").trim();
    if (!tenantId) throw new DomainError("Tenant context is required", 403);
    if (!lessonId) throw new DomainError("lessonId is required");

    const lesson = await this.repository.findLesson(tenantId, lessonId);
    if (!lesson) throw new DomainError("Lesson not found", 404, "LESSON_NOT_FOUND");
    if (context.role === "teacher" && lesson.teacherId !== context.userId) {
      throw new DomainError("Only assigned teacher can save attendance", 403);
    }
    if (lesson.status === "cancelled") throw new DomainError("Cancelled lesson cannot be completed", 409);
    if (lesson.date > this.clock.today()) throw new DomainError("Future lesson cannot be completed", 409);
    if (!Array.isArray(body.records)) throw new DomainError("records must be an array");

    const [roster, currentRecords, reasons] = await Promise.all([
      this.repository.findLessonRoster(tenantId, lessonId),
      this.repository.findByLesson(tenantId, lessonId),
      this.repository.listReasons(tenantId, false),
    ]);
    if (!roster.length) throw new DomainError("Lesson roster is empty; cancel the lesson or add participants before completion", 409);

    const allowedIds = new Set(roster.map((student) => student.id));
    const currentByStudent = new Map(currentRecords.map((record) => [record.studentId, record]));
    const reasonsById = new Map(reasons.map((reason) => [reason.id, reason]));
    const reasonsByCode = new Map(reasons.map((reason) => [reason.code, reason]));

    const records = body.records.map((raw) => Attendance.create(raw)).map((record) => {
      if (!allowedIds.has(record.studentId)) throw new DomainError("Student does not belong to this lesson group");
      const reason = record.reasonId
        ? reasonsById.get(record.reasonId)
        : reasonsByCode.get(DEFAULT_REASON_CODES[record.status]);
      const current = currentByStudent.get(record.studentId);
      const preserve = lesson.status === "completed" && current?.reasonId === reason?.id && current?.status === record.status;
      if (!reason || (!reason.isActive && !preserve)) throw new DomainError("attendance reason is invalid or inactive");
      if (reason.attendanceStatus !== record.status) throw new DomainError("attendance reason does not match status");
      return {
        ...record,
        reasonId: reason.id,
        reasonCode: preserve ? current.reasonCode : reason.code,
        reasonName: preserve ? current.reasonName : reason.name,
        chargePercent: preserve ? current.chargePercent : reason.chargePercent,
        consumePercent: preserve ? current.consumePercent : reason.consumePercent,
      };
    });

    const submittedIds = new Set(records.map((record) => record.studentId));
    if (submittedIds.size !== records.length) throw new DomainError("records contains duplicate studentId values");
    if (submittedIds.size !== allowedIds.size || [...allowedIds].some((id) => !submittedIds.has(id))) {
      throw new DomainError("records must contain every student in the lesson roster exactly once");
    }

    const details = {
      topic: text(body.topic, 500, "topic", lesson.topic),
      homework: text(body.homework, 2000, "homework", lesson.homework),
      note: text(body.lessonNote ?? body.lesson_note, 2000, "lessonNote", lesson.note),
    };
    const correctionReason = text(body.correctionReason ?? body.correction_reason, 500, "correctionReason");
    const unchanged = JSON.stringify(normalized(currentRecords)) === JSON.stringify(normalized(records))
      && details.topic === (lesson.topic || "")
      && details.homework === (lesson.homework || "")
      && details.note === (lesson.note || "");
    if (lesson.status === "completed" && unchanged) return { ok: true, reused: true, lesson };
    if (lesson.status === "completed") {
      if (context.role !== "admin") throw new DomainError("Only an admin can correct completed attendance", 403);
      if (!correctionReason) throw new DomainError("correctionReason is required for completed attendance");
      if (lesson.financialStatus === "posted") {
        throw new DomainError("Reverse the active financial settlement before correcting attendance", 409);
      }
    }
    const closedPeriod = await this.repository.findClosedFinancePeriod(tenantId, lesson.branchId || "", lesson.date);
    if (closedPeriod) throw new DomainError(`Finance period is closed: ${closedPeriod.label}`, 409);

    const updatedLesson = await this.repository.replaceForLesson({
      tenantId,
      lesson,
      lessonId,
      records,
      actorUserId: context.userId,
      actorRole: context.role,
      correctionReason,
      details,
      occurredAt: this.clock.now(),
    });
    await this.repository.audit(context, lesson.status === "completed" ? "corrected" : "completed", lessonId);
    return { ok: true, lesson: updatedLesson };
  }
}

module.exports = { MarkAttendance };
