const { DomainError } = require("../../../core/errors/DomainError");

const STATUSES = new Set(["present", "absent", "late", "excused"]);

class Attendance {
  constructor(fields) {
    Object.assign(this, fields);
    Object.freeze(this);
  }

  static create(input) {
    const studentId = String(input.studentId || "").trim();
    const status = String(input.status || "").trim();
    const note = String(input.note || "").trim();
    if (!studentId) throw new DomainError("studentId is required");
    if (!STATUSES.has(status)) throw new DomainError("status is invalid");
    if (note.length > 500) throw new DomainError("note is too long");
    return new Attendance({
      studentId,
      status,
      reasonId: String(input.reasonId || input.reason_id || "").trim(),
      note,
    });
  }
}

module.exports = { Attendance, ATTENDANCE_STATUSES: STATUSES };
