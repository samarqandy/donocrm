const { DomainError } = require("../../../core/errors/DomainError");
const { tenant, admin, requiredText, percent } = require("./AttendanceReasonValidation");

class UpdateAttendanceReason {
  constructor({ repository, clock }) {
    this.repository = repository;
    this.clock = clock;
  }

  async execute(context, reasonIdInput, body = {}) {
    admin(context);
    const tenantId = tenant(context);
    const reasonId = String(reasonIdInput || "").trim();
    if (!reasonId) throw new DomainError("reasonId is required");
    const existing = await this.repository.findReason(tenantId, reasonId);
    if (!existing) throw new DomainError("Attendance reason not found", 404);
    const isActive = body.isActive === undefined && body.is_active === undefined
      ? existing.isActive
      : Boolean(body.isActive ?? body.is_active);
    if (existing.isSystem && !isActive) throw new DomainError("System attendance reason cannot be disabled");
    const row = await this.repository.updateReason({
      tenantId,
      reasonId,
      expectedVersion: existing.version,
      name: body.name === undefined ? existing.name : requiredText(body.name, "name", 120),
      chargePercent: body.chargePercent === undefined && body.charge_percent === undefined
        ? existing.chargePercent
        : percent(body.chargePercent ?? body.charge_percent, "chargePercent"),
      consumePercent: body.consumePercent === undefined && body.consume_percent === undefined
        ? existing.consumePercent
        : percent(body.consumePercent ?? body.consume_percent, "consumePercent"),
      isActive,
      actorUserId: context.userId,
      actorRole: context.role,
      occurredAt: this.clock.now(),
    });
    await this.repository.audit(context, "updated", row.id, "attendance_reason");
    return row;
  }
}

module.exports = { UpdateAttendanceReason };
