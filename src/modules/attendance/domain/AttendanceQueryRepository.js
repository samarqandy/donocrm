class AttendanceQueryRepository {
  counts(_tenantId) { throw new Error("Not implemented"); }
  list(_tenantId) { throw new Error("Not implemented"); }
  listForTeacher(_tenantId, _teacherId) { throw new Error("Not implemented"); }
  studentStats(_tenantId, _studentIds = []) { throw new Error("Not implemented"); }
  groupStats(_tenantId, _groupIds = []) { throw new Error("Not implemented"); }
  studentProfile(_tenantId, _studentId) { throw new Error("Not implemented"); }
  groupProfile(_tenantId, _groupId) { throw new Error("Not implemented"); }
}

module.exports = { AttendanceQueryRepository };
