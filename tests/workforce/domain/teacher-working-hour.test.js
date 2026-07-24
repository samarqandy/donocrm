"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { TeacherWorkingHour } = require("../../../src/modules/workforce/domain/TeacherWorkingHour");

function hour(overrides = {}) {
  return TeacherWorkingHour.create({
    id: "hour_wf_a",
    tenantId: "tenant_wf_a",
    teacherId: "teacher_wf_a",
    weekday: 1,
    startTime: "09:00",
    endTime: "12:00",
    branchId: "branch_wf_a_main",
    createdAt: "2026-07-24T06:00:00.000Z",
    ...overrides,
  });
}

test("Working Hour accepts weekday boundaries and adjacent intervals", () => {
  assert.equal(hour({ weekday: 1 }).toSnapshot().weekday, "1");
  assert.equal(hour({ weekday: 7 }).toSnapshot().weekday, "7");
  assert.equal(hour().overlaps({ teacherId: "teacher_wf_a", weekday: "1", startTime: "12:00", endTime: "13:00" }), false);
});

test("Working Hour detects strict overlap only for same Teacher and weekday", () => {
  const current = hour();
  assert.equal(current.overlaps({ teacherId: "teacher_wf_a", weekday: "1", startTime: "11:59", endTime: "13:00" }), true);
  assert.equal(current.overlaps({ teacherId: "teacher_wf_b", weekday: "1", startTime: "11:59", endTime: "13:00" }), false);
  assert.equal(current.overlaps({ teacherId: "teacher_wf_a", weekday: "2", startTime: "11:59", endTime: "13:00" }), false);
});

test("Working Hour rejects missing IDs, invalid clocks, reversed ranges, and invalid weekdays", () => {
  assert.throws(() => hour({ teacherId: "" }), (error) => error.code === "TEACHER_ID_REQUIRED");
  assert.throws(() => hour({ startTime: "" }), (error) => error.code === "START_TIME_REQUIRED");
  assert.throws(() => hour({ startTime: "9:00" }), (error) => error.code === "START_TIME_INVALID");
  assert.throws(() => hour({ endTime: "24:00" }), (error) => error.code === "END_TIME_INVALID");
  assert.throws(() => hour({ endTime: "09:00" }), (error) => error.code === "END_NOT_AFTER_START");
  assert.throws(() => hour({ weekday: 0 }), (error) => error.code === "WEEKDAY_INVALID");
  assert.throws(() => hour({ weekday: 8 }), (error) => error.code === "WEEKDAY_INVALID");
});
