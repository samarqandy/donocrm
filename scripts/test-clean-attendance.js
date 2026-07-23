const assert = require("node:assert/strict");
const { MarkAttendance } = require("../src/modules/attendance/application/MarkAttendance");
const { ReopenAttendance } = require("../src/modules/attendance/application/ReopenAttendance");
const { SendAttendanceAlerts } = require("../src/modules/attendance/application/SendAttendanceAlerts");
const { GetAttendanceLesson } = require("../src/modules/attendance/application/GetAttendanceLesson");
const { ListAttendanceReasons } = require("../src/modules/attendance/application/ListAttendanceReasons");
const { CreateAttendanceReason } = require("../src/modules/attendance/application/CreateAttendanceReason");
const { UpdateAttendanceReason } = require("../src/modules/attendance/application/UpdateAttendanceReason");

function fixture(overrides = {}) {
  const calls = [];
  const repository = {
    async findLesson() { return { id: "lesson-1", teacherId: "teacher-1", groupId: "group-1", branchId: "", date: "2026-07-15", status: "planned", attendanceVersion: 0, financialStatus: "unposted", topic: "", homework: "", note: "", ...overrides.lesson }; },
    async findLessonRoster() { return overrides.roster || [{ id: "student-1" }, { id: "student-2" }]; },
    async findByLesson() { return overrides.current || []; },
    async listReasons() { return [
      { id: "reason-present", code: "present", name: "Keldi", attendanceStatus: "present", chargePercent: 100, consumePercent: 100, isActive: true },
      { id: "reason-absent", code: "absent_unexcused", name: "Kelmadi", attendanceStatus: "absent", chargePercent: 100, consumePercent: 100, isActive: true },
    ]; },
    async findClosedFinancePeriod() { return overrides.closedPeriod || null; },
    async replaceForLesson(command) { calls.push(command); return { ...command.lesson, status: "completed", attendanceVersion: 1 }; },
    async audit(...args) { calls.push({ audit: args }); },
  };
  const useCase = new MarkAttendance({
    repository,
    clock: { now: () => "2026-07-15T10:00:00.000Z", today: () => "2026-07-15" },
  });
  return { useCase, calls };
}

const context = { tenantId: "tenant-1", userId: "admin-1", role: "admin" };
const validBody = {
  lessonId: "lesson-1",
  records: [
    { studentId: "student-1", status: "present" },
    { studentId: "student-2", status: "absent" },
  ],
};

async function run() {
  {
    const { useCase, calls } = fixture();
    const result = await useCase.execute(context, validBody);
    assert.equal(result.ok, true);
    assert.equal(result.lesson.status, "completed");
    assert.equal(calls[0].records.length, 2);
    assert.equal(calls[0].records[1].reasonId, "reason-absent");
  }
  {
    const { useCase } = fixture();
    await assert.rejects(
      () => useCase.execute({ ...context, role: "teacher", userId: "teacher-2" }, validBody),
      (error) => error.status === 403,
    );
  }
  {
    const { useCase } = fixture();
    await assert.rejects(
      () => useCase.execute(context, { ...validBody, records: validBody.records.slice(0, 1) }),
      /every student/,
    );
  }
  {
    const current = [
      { studentId: "student-1", status: "present", reasonId: "reason-present", reasonCode: "present", reasonName: "Keldi", chargePercent: 100, consumePercent: 100, note: "" },
      { studentId: "student-2", status: "absent", reasonId: "reason-absent", reasonCode: "absent_unexcused", reasonName: "Kelmadi", chargePercent: 100, consumePercent: 100, note: "" },
    ];
    const { useCase } = fixture({ lesson: { status: "completed" }, current });
    const reused = await useCase.execute(context, validBody);
    assert.equal(reused.reused, true);
  }
  {
    const calls = [];
    const repository = {
      async findLesson() { return { id: "lesson-1", branchId: "", date: "2026-07-15", status: "completed", attendanceVersion: 3, financialStatus: "pending" }; },
      async hasActiveSettlement() { return false; },
      async findClosedFinancePeriod() { return null; },
      async reopenLesson(command) { calls.push(command); return { ...command.lesson, status: "planned", attendanceVersion: 4 }; },
      async audit(...args) { calls.push({ audit: args }); },
    };
    const useCase = new ReopenAttendance({ repository, clock: { now: () => "2026-07-15T11:00:00.000Z" } });
    const result = await useCase.execute(context, "lesson-1", { reason: "Retake attendance" });
    assert.equal(result.status, "planned");
    assert.equal(calls[0].reason, "Retake attendance");
  }
  {
    const repository = { async findLesson() { throw new Error("must not run"); } };
    const useCase = new ReopenAttendance({ repository, clock: { now: () => "2026-07-15T11:00:00.000Z" } });
    await assert.rejects(
      () => useCase.execute({ ...context, role: "teacher" }, "lesson-1", { reason: "No" }),
      (error) => error.status === 403,
    );
  }
  {
    const queued = [];
    const repository = {
      async findAlertSource() { return {
        lesson: { id: "lesson-1", status: "completed", attendanceVersion: 4, teacherId: "teacher-1", teacherName: "Teacher", subject: "Math", groupName: "G1", date: "2026-07-15", startTime: "10:00" },
        records: [{ studentId: "student-1", studentName: "Student", status: "late" }],
      }; },
      async audit() {},
    };
    const notificationRepository = { async queue(_tenantId, messages) { queued.push(...messages); return { sent_count: 1, skipped_count: 0, already_queued_count: 0 }; } };
    const useCase = new SendAttendanceAlerts({ repository, notificationRepository, clock: { now: () => "2026-07-15T11:00:00.000Z", today: () => "2026-07-15" } });
    const result = await useCase.execute(context, "lesson-1");
    assert.equal(result.sent_count, 1);
    assert.match(queued[0].text, /Student bugun soat 10:00 dagi darsga kechikdi/);
  }
  {
    const repository = {
      async findAlertSource() { return { lesson: { status: "completed", teacherId: "teacher-1" }, records: [] }; },
    };
    const useCase = new SendAttendanceAlerts({ repository, notificationRepository: {}, clock: { today: () => "2026-07-15" } });
    await assert.rejects(
      () => useCase.execute({ ...context, role: "teacher", userId: "teacher-2" }, "lesson-1"),
      (error) => error.status === 403,
    );
  }
  {
    const repository = {
      async findLesson() { return { id: "lesson-1", teacherId: "teacher-1" }; },
      async findLessonRoster() { return [{ id: "student-1", name: "Student", debt: 100, balance: -100, telegramChatId: "secret" }]; },
    };
    const useCase = new GetAttendanceLesson({ repository });
    const result = await useCase.execute({ ...context, role: "teacher", userId: "teacher-1" }, "lesson-1");
    assert.equal(result.students[0].name, "Student");
    assert.ok(!Object.prototype.hasOwnProperty.call(result.students[0], "debt"));
    assert.ok(!Object.prototype.hasOwnProperty.call(result.students[0], "telegramChatId"));
  }
  {
    const calls = [];
    const useCase = new ListAttendanceReasons({ repository: { async listReasons(...args) { calls.push(args); return []; } } });
    await useCase.execute({ ...context, role: "teacher" });
    assert.deepEqual(calls[0], [context.tenantId, true]);
  }
  {
    const calls = [];
    const repository = {
      async createReason(command) { calls.push(command); return { id: "reason-new", ...command, version: 1 }; },
      async audit(...args) { calls.push({ audit: args }); },
    };
    const useCase = new CreateAttendanceReason({ repository, clock: { now: () => "2026-07-15T12:00:00.000Z" } });
    const result = await useCase.execute(context, {
      code: "medical_excuse", name: "Medical excuse", attendanceStatus: "excused",
      chargePercent: 0, consumePercent: 0,
    });
    assert.equal(result.version, 1);
    assert.equal(calls[0].code, "medical_excuse");
    await assert.rejects(
      () => useCase.execute({ ...context, role: "teacher" }, {}),
      (error) => error.status === 403,
    );
  }
  {
    const calls = [];
    const repository = {
      async findReason() { return { id: "reason-custom", name: "Custom", chargePercent: 100, consumePercent: 100, isActive: true, isSystem: false, version: 4 }; },
      async updateReason(command) { calls.push(command); return { ...command, id: command.reasonId, version: 5 }; },
      async audit() {},
    };
    const useCase = new UpdateAttendanceReason({ repository, clock: { now: () => "2026-07-15T12:00:00.000Z" } });
    const result = await useCase.execute(context, "reason-custom", { isActive: false });
    assert.equal(result.version, 5);
    assert.equal(calls[0].expectedVersion, 4);
  }
  console.log("PASS Clean attendance module 12/12");
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
