class AttendanceRepository {
  async findLesson(_tenantId, _lessonId) { throw new Error("Not implemented"); }
  async findLessonRoster(_tenantId, _lessonId) { throw new Error("Not implemented"); }
  async findByLesson(_tenantId, _lessonId) { throw new Error("Not implemented"); }
  async listReasons(_tenantId, _activeOnly = false) { throw new Error("Not implemented"); }
  async findReason(_tenantId, _reasonId) { throw new Error("Not implemented"); }
  async createReason(_command) { throw new Error("Not implemented"); }
  async updateReason(_command) { throw new Error("Not implemented"); }
  async findClosedFinancePeriod(_tenantId, _branchId, _date) { throw new Error("Not implemented"); }
  async hasActiveSettlement(_tenantId, _lessonId) { throw new Error("Not implemented"); }
  async replaceForLesson(_command) { throw new Error("Not implemented"); }
  async reopenLesson(_command) { throw new Error("Not implemented"); }
  async findAlertSource(_tenantId, _lessonId) { throw new Error("Not implemented"); }
  async audit(_context, _action, _entityId) { throw new Error("Not implemented"); }
}

module.exports = { AttendanceRepository };
