const { DomainError } = require("../../../core/errors/DomainError");

function requiredReason(value) {
  const reason = String(value || "").trim();
  if (!reason) throw new DomainError("reason is required");
  if (reason.length > 500) throw new DomainError("reason is too long");
  return reason;
}

class ReopenAttendance {
  constructor({ repository, clock }) {
    this.repository = repository;
    this.clock = clock;
  }

  async execute(context, lessonIdInput, body = {}) {
    if (context.role !== "admin") throw new DomainError("Admin role is required", 403);
    const tenantId = String(context.tenantId || "").trim();
    const lessonId = String(lessonIdInput || "").trim();
    if (!tenantId) throw new DomainError("Tenant context is required", 403);
    if (!lessonId) throw new DomainError("lessonId is required");
    const lesson = await this.repository.findLesson(tenantId, lessonId);
    if (!lesson) throw new DomainError("Lesson not found", 404);
    if (lesson.status !== "completed") throw new DomainError("Only a completed lesson can be reopened", 409);
    if (lesson.financialStatus === "posted" || await this.repository.hasActiveSettlement(tenantId, lessonId)) {
      throw new DomainError("Reverse the active financial settlement before reopening the lesson", 409);
    }
    const closedPeriod = await this.repository.findClosedFinancePeriod(tenantId, lesson.branchId || "", lesson.date);
    if (closedPeriod) throw new DomainError(`Finance period is closed: ${closedPeriod.label}`, 409);
    const reopened = await this.repository.reopenLesson({
      tenantId,
      lessonId,
      lesson,
      reason: requiredReason(body.reason),
      actorUserId: context.userId,
      actorRole: context.role,
      occurredAt: this.clock.now(),
    });
    await this.repository.audit(context, "reopened", lessonId, "lesson_completion");
    return reopened;
  }
}

module.exports = { ReopenAttendance };
