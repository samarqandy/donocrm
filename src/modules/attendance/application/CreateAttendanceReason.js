const { DomainError } = require("../../../core/errors/DomainError");
const { STATUSES, tenant, admin, requiredText, percent } = require("./AttendanceReasonValidation");

class CreateAttendanceReason {
  constructor({ repository, clock }) {
    this.repository = repository;
    this.clock = clock;
  }

  async execute(context, body = {}) {
    admin(context);
    const tenantId = tenant(context);
    const code = String(body.code || "").trim().toLowerCase();
    if (!/^[a-z][a-z0-9_]{1,39}$/.test(code)) throw new DomainError("code is invalid");
    const attendanceStatus = String(body.attendanceStatus ?? body.attendance_status ?? "").trim();
    if (!STATUSES.has(attendanceStatus)) throw new DomainError("attendanceStatus is invalid");
    const row = await this.repository.createReason({
      tenantId,
      code,
      name: requiredText(body.name, "name", 120),
      attendanceStatus,
      chargePercent: percent(body.chargePercent ?? body.charge_percent, "chargePercent"),
      consumePercent: percent(body.consumePercent ?? body.consume_percent, "consumePercent"),
      actorUserId: context.userId,
      actorRole: context.role,
      occurredAt: this.clock.now(),
    });
    await this.repository.audit(context, "created", row.id, "attendance_reason");
    return row;
  }
}

module.exports = { CreateAttendanceReason };
