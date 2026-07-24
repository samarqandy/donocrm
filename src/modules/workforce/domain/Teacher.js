"use strict";

const { fail } = require("./WorkforceError");

const EMPLOYMENT_TYPES = Object.freeze(["full_time", "part_time", "contract"]);
const STATUSES = Object.freeze(["active", "inactive"]);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function requiredName(value) {
  const name = String(value || "").trim();
  if (!name) fail("NAME_REQUIRED", "name is required");
  return name;
}

function validateEmail(value) {
  const email = String(value || "").trim();
  if (email && !EMAIL_PATTERN.test(email)) fail("EMAIL_INVALID", "email is invalid");
  return email;
}

function validateEmploymentType(value) {
  if (!EMPLOYMENT_TYPES.includes(value)) fail("EMPLOYMENT_TYPE_INVALID", "employmentType is invalid");
  return value;
}

function validateHiredAt(value) {
  if (value === null || value === "") return null;
  if (!DATE_PATTERN.test(String(value))) fail("HIRED_AT_INVALID", "hiredAt is invalid");
  const [year, month, day] = String(value).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    fail("HIRED_AT_INVALID", "hiredAt is invalid");
  }
  return String(value);
}

function validateMaxWeeklyMinutes(value) {
  const minutes = Number(value);
  if (!Number.isInteger(minutes) || minutes < 60 || minutes > 4800) {
    fail("MAX_WEEKLY_MINUTES_OUT_OF_RANGE", "maxWeeklyHours must be between 1 and 80");
  }
  return minutes;
}

function normalizeProfile(profile, current = null) {
  const source = profile || {};
  return Object.freeze({
    name: requiredName(source.name),
    phone: String(source.phone || "").trim(),
    email: validateEmail(source.email),
    specialization: String(source.specialization || "").trim(),
    employmentType: validateEmploymentType(source.employmentType ?? current?.employmentType ?? "full_time"),
    hiredAt: validateHiredAt(source.hiredAt === undefined ? current?.hiredAt ?? null : source.hiredAt),
    maxWeeklyMinutes: validateMaxWeeklyMinutes(
      source.maxWeeklyMinutes ?? current?.maxWeeklyMinutes ?? 2400,
    ),
    note: String(source.note || "").trim(),
    branchId: source.branchId === undefined ? current?.branchId ?? null : source.branchId,
  });
}

class Teacher {
  constructor(snapshot) {
    if (!snapshot?.id || !snapshot?.tenantId) throw new TypeError("Teacher identity and tenant are required");
    if (!STATUSES.includes(snapshot.status)) throw new TypeError("Teacher status is invalid");
    this.snapshot = Object.freeze({ ...snapshot });
    Object.freeze(this);
  }

  static create({ id, tenantId, profile, createdAt }) {
    return new Teacher({
      id,
      tenantId,
      ...normalizeProfile(profile),
      status: "active",
      createdAt,
    });
  }

  static restore(snapshot) {
    return new Teacher({ ...snapshot, status: "active" });
  }

  static archive(snapshot) {
    return new Teacher({ ...snapshot, status: "inactive" });
  }

  static replaceProfile(snapshot, profile) {
    return new Teacher({ ...snapshot, ...normalizeProfile(profile, snapshot) });
  }

  toSnapshot() {
    return this.snapshot;
  }
}

module.exports = {
  EMPLOYMENT_TYPES,
  STATUSES,
  Teacher,
  normalizeProfile,
  requiredName,
  validateEmail,
  validateEmploymentType,
  validateHiredAt,
  validateMaxWeeklyMinutes,
};
