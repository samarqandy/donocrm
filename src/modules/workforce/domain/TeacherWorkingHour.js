"use strict";

const { fail } = require("./WorkforceError");

const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function clockTime(value, field) {
  if (value === undefined || value === null || value === "") {
    fail(field === "startTime" ? "START_TIME_REQUIRED" : "END_TIME_REQUIRED", `${field} is required`);
  }
  const normalized = String(value);
  if (!TIME_PATTERN.test(normalized)) {
    fail(field === "startTime" ? "START_TIME_INVALID" : "END_TIME_INVALID", `${field} is invalid`);
  }
  return normalized;
}

function weekday(value) {
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized < 1 || normalized > 7) {
    fail("WEEKDAY_INVALID", "weekday is invalid");
  }
  return String(normalized);
}

class TeacherWorkingHour {
  constructor(snapshot) {
    this.snapshot = Object.freeze({ ...snapshot });
    Object.freeze(this);
  }

  static create({ id, tenantId, teacherId, weekday: day, startTime, endTime, branchId, createdAt }) {
    if (!teacherId) fail("TEACHER_ID_REQUIRED", "teacherId is required");
    const normalizedStart = clockTime(startTime, "startTime");
    const normalizedEnd = clockTime(endTime, "endTime");
    if (normalizedEnd <= normalizedStart) fail("END_NOT_AFTER_START", "endTime must be after startTime");
    return new TeacherWorkingHour({
      id,
      tenantId,
      branchId: branchId || null,
      teacherId,
      weekday: weekday(day),
      startTime: normalizedStart,
      endTime: normalizedEnd,
      createdAt,
    });
  }

  overlaps(other) {
    return (
      this.snapshot.teacherId === other.teacherId &&
      this.snapshot.weekday === String(other.weekday) &&
      this.snapshot.startTime < other.endTime &&
      this.snapshot.endTime > other.startTime
    );
  }

  toSnapshot() {
    return this.snapshot;
  }
}

module.exports = { TIME_PATTERN, TeacherWorkingHour, clockTime, weekday };
