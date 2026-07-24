"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { Teacher, normalizeProfile } = require("../../../src/modules/workforce/domain/Teacher");

const profile = {
  name: "  Alpha Teacher  ",
  phone: " +998900000001 ",
  email: "alpha@example.test",
  specialization: " Math ",
  employmentType: "full_time",
  hiredAt: "2026-07-24",
  maxWeeklyMinutes: 2400,
  note: " Fixture ",
  branchId: "branch_wf_a_main",
};

test("Teacher creates active and preserves stable identity across lifecycle", () => {
  const created = Teacher.create({
    id: "teacher_wf_a",
    tenantId: "tenant_wf_a",
    profile,
    createdAt: "2026-07-24T06:00:00.000Z",
  }).toSnapshot();
  assert.equal(created.status, "active");
  assert.equal(created.name, "Alpha Teacher");
  assert.equal(created.phone, "+998900000001");
  const archived = Teacher.archive(created).toSnapshot();
  const restored = Teacher.restore(archived).toSnapshot();
  assert.equal(archived.status, "inactive");
  assert.equal(restored.status, "active");
  assert.equal(restored.id, created.id);
  assert.equal(restored.tenantId, created.tenantId);
});

test("Teacher validates name, email, employment, hired date, and workload ceiling", () => {
  assert.throws(() => normalizeProfile({ ...profile, name: "" }), (error) => error.code === "NAME_REQUIRED");
  assert.throws(() => normalizeProfile({ ...profile, email: "invalid" }), (error) => error.code === "EMAIL_INVALID");
  assert.throws(() => normalizeProfile({ ...profile, employmentType: "temporary" }), (error) => error.code === "EMPLOYMENT_TYPE_INVALID");
  assert.throws(() => normalizeProfile({ ...profile, hiredAt: "2026-02-30" }), (error) => error.code === "HIRED_AT_INVALID");
  assert.throws(() => normalizeProfile({ ...profile, maxWeeklyMinutes: 59 }), (error) => error.code === "MAX_WEEKLY_MINUTES_OUT_OF_RANGE");
  assert.throws(() => normalizeProfile({ ...profile, maxWeeklyMinutes: 4801 }), (error) => error.code === "MAX_WEEKLY_MINUTES_OUT_OF_RANGE");
});

test("Teacher profile replacement preserves omitted optional owned facts", () => {
  const current = Teacher.create({
    id: "teacher_wf_a",
    tenantId: "tenant_wf_a",
    profile,
    createdAt: "2026-07-24T06:00:00.000Z",
  }).toSnapshot();
  const updated = Teacher.replaceProfile(current, {
    name: "Updated",
    phone: "",
    email: "",
    specialization: "",
    note: "",
  }).toSnapshot();
  assert.equal(updated.employmentType, current.employmentType);
  assert.equal(updated.maxWeeklyMinutes, current.maxWeeklyMinutes);
  assert.equal(updated.branchId, current.branchId);
});
