const { tenant } = require("./AttendanceReasonValidation");

class ListAttendanceReasons {
  constructor({ repository }) {
    this.repository = repository;
  }

  async execute(context) {
    return this.repository.listReasons(tenant(context), context.role !== "admin");
  }
}

module.exports = { ListAttendanceReasons };
