"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { actor, fixture } = require("../helpers/applicationFixture");

function assertSuccess(result) {
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.value));
  return result.value;
}

function assertError(result, code) {
  assert.equal(result.ok, false, JSON.stringify(result));
  assert.equal(result.error.code, code);
  return result.error;
}

test("WF-APP-01 lists ordered admin Teachers and privacy-safe Teacher self only", async () => {
  const { app } = fixture();
  const admin = assertSuccess(await app.listTeachers(actor()));
  assert.deepEqual(admin.teachers.map((item) => item.status), ["active", "inactive"]);
  assert.equal(admin.teachers[0].weeklyMinutes, 600);
  assert.equal(admin.teachers[0].workloadPercent, 25);
  const self = assertSuccess(await app.listTeachers(actor({
    actorUserId: "teacher_wf_a",
    role: "teacher",
    permissions: [],
  })));
  assert.equal(self.teachers.length, 1);
  assert.equal(self.teachers[0].id, "teacher_wf_a");
  assert.equal(Object.prototype.hasOwnProperty.call(self.teachers[0], "username"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(self.teachers[0], "accessStatus"), false);
});

test("WF-APP-02 composes profile and removes monthlyFee for Teacher self", async () => {
  const { app } = fixture();
  const admin = assertSuccess(await app.getTeacherProfile(actor(), { teacherId: "teacher_wf_a" }));
  assert.equal(admin.groups[0].monthlyFee, 500000);
  assert.equal(admin.groups[0].studentsCount, 8);
  assert.equal(admin.groups[0].occupancyPercent, 80);
  assert.equal(admin.groups[0].attendanceRate, 0);
  assert.equal(admin.workingHours[0].teacherName, "Alpha Teacher");
  const self = assertSuccess(await app.getTeacherProfile(actor({
    actorUserId: "teacher_wf_a",
    role: "teacher",
    permissions: [],
  }), { teacherId: "teacher_wf_a" }));
  assert.equal(Object.prototype.hasOwnProperty.call(self.groups[0], "monthlyFee"), false);
  assertError(await app.getTeacherProfile(actor({
    actorUserId: "teacher_wf_a",
    role: "teacher",
    permissions: [],
  }), { teacherId: "teacher_wf_a_inactive" }), "OWN_PROFILE_ONLY");
});

test("WF-APP-03 creates Teacher with canonical provider and audit ordering", async () => {
  const { app, calls } = fixture();
  const created = assertSuccess(await app.createTeacher(actor(), {
    profile: {
      name: "Created Teacher",
      phone: "",
      email: "",
      specialization: "",
      employmentType: "part_time",
      hiredAt: null,
      maxWeeklyMinutes: 1200,
      note: "",
      branchId: null,
    },
    portalAccess: { username: "created.teacher", password: "FixturePass123" },
  }));
  assert.match(created.id, /^wf-test-teacher-/);
  assert.equal(created.status, "active");
  assert.equal(created.hasAccess, true);
  const relevant = calls.map((call) => call.name);
  assert.ok(relevant.indexOf("branchResolver.resolveActive") < relevant.indexOf("teacherRepository.insert"));
  assert.ok(relevant.indexOf("teacherRepository.insert") < relevant.indexOf("portalLifecycle.provision"));
  assert.ok(relevant.indexOf("portalLifecycle.provision") < relevant.indexOf("auditAppender.append"));
  const audit = calls.find((call) => call.name === "auditAppender.append").args[0];
  assert.equal(Object.prototype.hasOwnProperty.call(audit, "password"), false);
  assertError(await app.createTeacher(actor({ role: "teacher" }), {
    profile: { name: "Forbidden" },
    portalAccess: null,
  }), "ADMIN_REQUIRED");
});

test("WF-APP-04 updates owned profile and optional portal intent", async () => {
  const { app, calls } = fixture();
  const updated = assertSuccess(await app.updateTeacher(actor(), {
    teacherId: "teacher_wf_a",
    profile: {
      name: "Updated Teacher",
      phone: "",
      email: "",
      specialization: "Physics",
      note: "",
      maxWeeklyMinutes: 1800,
    },
    portalAccessChange: { enabled: false },
  }));
  assert.equal(updated.name, "Updated Teacher");
  assert.equal(updated.maxWeeklyMinutes, 1800);
  assert.equal(updated.hasAccess, false);
  assert.ok(calls.some((call) => call.name === "portalLifecycle.applyChange"));
  assertError(await app.updateTeacher(actor(), {
    teacherId: "missing",
    profile: { name: "Missing", phone: "", email: "", specialization: "", note: "" },
    portalAccessChange: null,
  }), "TEACHER_NOT_FOUND");
});

test("WF-APP-05 archives only after both blocker decisions and disables access", async () => {
  const { app, access, calls } = fixture();
  const archived = assertSuccess(await app.archiveTeacher(actor(), { teacherId: "teacher_wf_a" }));
  assert.equal(archived.status, "inactive");
  assert.equal(access.get("teacher_wf_a").hasAccess, false);
  assert.ok(calls.some((call) => call.name === "groupArchiveBlocker.decide"));
  assert.ok(calls.some((call) => call.name === "lessonArchiveBlocker.decide"));

  const blockedFixture = fixture({
    groupArchiveBlocker: { async decide(_context, teacherId) { return { teacherId, blocked: true }; } },
  });
  assertError(await blockedFixture.app.archiveTeacher(actor(), { teacherId: "teacher_wf_a" }), "ARCHIVE_BLOCKED");
});

test("WF-APP-06 restores inactive Teacher and emits exact audit intent", async () => {
  const { app, calls } = fixture();
  const restored = assertSuccess(await app.restoreTeacher(actor(), { teacherId: "teacher_wf_a_inactive" }));
  assert.equal(restored.status, "active");
  const audit = calls.find((call) => call.name === "auditAppender.append").args[0];
  assert.deepEqual(
    { action: audit.action, entityType: audit.entityType, entityId: audit.entityId },
    { action: "restored", entityType: "teacher", entityId: "teacher_wf_a_inactive" },
  );
});

test("WF-APP-07 resets credential without exposing secret or session data", async () => {
  const { app, calls } = fixture();
  assert.deepEqual(
    assertSuccess(await app.resetTeacherPassword(actor(), {
      teacherId: "teacher_wf_a",
      newPassword: "NewFixturePass123",
    })),
    { success: true },
  );
  const audit = calls.find((call) => call.name === "auditAppender.append").args[0];
  assert.equal(Object.prototype.hasOwnProperty.call(audit, "newPassword"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(audit, "sessionId"), false);
  assertError(await app.resetTeacherPassword(actor(), {
    teacherId: "teacher_wf_a",
    newPassword: "short",
  }), "PASSWORD_TOO_SHORT");
});

test("WF-APP-08 lists tenant hours and scopes Teacher to self", async () => {
  const { app } = fixture();
  const admin = assertSuccess(await app.listTeacherWorkingHours(actor()));
  assert.deepEqual(admin.workingHours.map((item) => item.id), ["hour_wf_a"]);
  const self = assertSuccess(await app.listTeacherWorkingHours(actor({
    actorUserId: "teacher_wf_a",
    role: "teacher",
    permissions: [],
  })));
  assert.deepEqual(self.workingHours.map((item) => item.teacherId), ["teacher_wf_a"]);
});

test("WF-APP-09 accepts adjacency, rejects overlap, and requires permission", async () => {
  const { app } = fixture();
  const adjacent = assertSuccess(await app.createTeacherWorkingHour(actor(), {
    teacherId: "teacher_wf_a",
    weekday: 1,
    startTime: "12:00",
    endTime: "13:00",
    branchId: null,
  }));
  assert.equal(adjacent.teacherName, "Alpha Teacher");
  assert.equal(adjacent.startTime, "12:00");
  assertError(await app.createTeacherWorkingHour(actor(), {
    teacherId: "teacher_wf_a",
    weekday: 1,
    startTime: "11:59",
    endTime: "13:00",
  }), "WORKING_HOUR_OVERLAP");
  assertError(await app.createTeacherWorkingHour(actor({ permissions: [] }), {
    teacherId: "teacher_wf_a",
    weekday: 2,
    startTime: "09:00",
    endTime: "10:00",
  }), "PERMISSION_REQUIRED");
});

test("WF-APP-10 deletes tenant hour and preserves empty teacherName compatibility quirk", async () => {
  const { app } = fixture();
  const deleted = assertSuccess(await app.deleteTeacherWorkingHour(actor(), { workingHourId: "hour_wf_a" }));
  assert.equal(deleted.id, "hour_wf_a");
  assert.equal(deleted.teacherName, "");
  assertError(await app.deleteTeacherWorkingHour(actor(), { workingHourId: "missing" }), "WORKING_HOUR_NOT_FOUND");
});

test("WF-REF-01 exposes minimum allow-listed Teacher reference only", async () => {
  const { app } = fixture();
  const reference = assertSuccess(await app.getTeacherReference({
    tenantId: "tenant_wf_a",
    caller: "academic-groups",
    correlationId: "corr-ref-1",
  }, { teacherId: "teacher_wf_a" }));
  assert.deepEqual(Object.keys(reference).sort(), ["branchId", "displayName", "status", "teacherId", "tenantId"]);
  assertError(await app.getTeacherReference({
    tenantId: "tenant_wf_a",
    caller: "unknown-service",
    correlationId: "corr-ref-2",
  }, { teacherId: "teacher_wf_a" }), "SERVICE_CALLER_FORBIDDEN");
});

test("Application fails complete composition and maps provider availability without partial DTO", async () => {
  const missing = fixture({
    portalProjection: { async getByTeacherIds() { return []; } },
  });
  assertError(await missing.app.listTeachers(actor()), "WORKFORCE_FAILURE");
  const unavailable = fixture({
    portalProjection: {
      async getByTeacherIds() {
        const error = new Error("identity unavailable");
        error.code = "PROVIDER_UNAVAILABLE";
        throw error;
      },
    },
  });
  const error = assertError(await unavailable.app.listTeachers(actor()), "WORKFORCE_UNAVAILABLE");
  assert.equal(error.retryable, true);
});
