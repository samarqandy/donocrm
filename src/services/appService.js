const crypto = require("node:crypto");
const { enumValue, positiveAmount, required } = require("./validation");
const {
  addDays,
  dateForWeekday,
  isoDate,
  isoWeekKey,
  isoWeekday,
  parseDateOnly,
  parseLessonTime,
  weekRange,
} = require("../utils/schedule");
const { today } = require("../utils/time");
const { getMe } = require("../integrations/telegramClient");

function attendanceCounts(records) {
  return records.reduce(
    (counts, record) => {
      counts[record.status] = (counts[record.status] || 0) + 1;
      return counts;
    },
    { present: 0, absent: 0, late: 0, excused: 0 },
  );
}

function statusForLeadStage(stage) {
  if (stage === "paid") return "converted";
  if (stage !== "new" && stage !== "lost") return "contacted";
  return "new";
}

function stageForLegacyStatus(status) {
  if (status === "converted") return "paid";
  if (status === "contacted") return "contacted";
  return "new";
}

function validationError(message) {
  const error = new Error(message);
  error.status = 422;
  return error;
}

function idempotencyKey(body) {
  const value = body.idempotencyKey || body.idempotency_key || "";
  const key = String(value || "").trim();
  if (!key) return "";
  if (key.length > 120) throw validationError("idempotencyKey is invalid");
  return key;
}

function requestFingerprint(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function scheduleChangeRequestFingerprint(scheduleId, body) {
  const patch = body.patch && typeof body.patch === "object" && !Array.isArray(body.patch) ? body.patch : body;
  return requestFingerprint({
    scheduleId: String(scheduleId),
    scope: String(body.scope || ""),
    occurrenceDate: String(body.occurrenceDate ?? body.occurrence_date ?? ""),
    version: body.version === undefined ? null : Number(body.version),
    reason: String(body.reason || "").trim(),
    patch: {
      weekday: patch.weekday ?? null,
      startTime: patch.startTime ?? patch.start_time ?? null,
      endTime: patch.endTime ?? patch.end_time ?? null,
      teacherId: patch.teacherId ?? patch.teacher_id ?? null,
      roomId: patch.roomId ?? patch.room_id ?? null,
      lessonLink: patch.lessonLink ?? patch.lesson_link ?? null,
      validUntil: patch.validUntil ?? patch.valid_until ?? null,
      status: patch.status ?? null,
    },
  });
}

function percentage(value, field, fallback = 0) {
  const number = nonNegativeNumber(value, field, fallback);
  if (number > 100) throw validationError(`${field} must be between 0 and 100`);
  return number;
}

function teacherStudentDto(student) {
  const { debt, balance, telegramChatId, ...safeStudent } = student;
  return safeStudent;
}

function teacherGroupDto(group) {
  return teacherGroupProfileDto(group);
}

const TEACHER_GROUP_PRIVATE_KEYS = new Set([
  "balance",
  "charged",
  "collectedAmount",
  "debt",
  "debtors",
  "expectedRevenue",
  "finance",
  "ledger",
  "monthlyFee",
  "monthlyPotential",
  "outstandingAmount",
  "outstanding",
  "paid",
  "payments",
  "recentPayments",
  "revenue",
  "subscriptions",
  "telegramChatId",
  "totalRevenue",
]);

function teacherGroupProfileDto(value) {
  if (Array.isArray(value)) return value.map(teacherGroupProfileDto);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !TEACHER_GROUP_PRIVATE_KEYS.has(key))
      .map(([key, nested]) => [key, teacherGroupProfileDto(nested)]),
  );
}

function limitedText(value, field, maxLength, fallback = "") {
  const text = textValue(value, fallback);
  if (text.length > maxLength) throw validationError(`${field} is too long`);
  return text;
}

function requiredLimitedText(value, field, maxLength, fallback) {
  const text = required(value === undefined ? fallback : value, field);
  if (text.length > maxLength) throw validationError(`${field} is too long`);
  return text;
}

function nonNegativeNumber(value, field, fallback = 0) {
  const raw = value === undefined || value === null || value === "" ? fallback : value;
  const number = Number(raw);
  if (!Number.isFinite(number) || number < 0 || number > Number.MAX_SAFE_INTEGER) {
    throw validationError(`${field} must be a non-negative number`);
  }
  return number;
}

function groupCapacity(value, fallback = 0) {
  const raw = value === undefined || value === null || value === "" ? fallback : value;
  const capacity = Number(raw);
  if (!Number.isInteger(capacity) || capacity < 0 || capacity > 10000) {
    throw validationError("capacity must be an integer between 0 and 10000");
  }
  return capacity;
}

function optionalGroupDate(value, field, fallback = "") {
  if (value === undefined) return fallback || "";
  if (value === null || String(value).trim() === "") return "";
  return normalizeDateField(value, field);
}

function optionalColor(value, fallback = "") {
  const color = textValue(value, fallback);
  if (color && !/^#[0-9a-fA-F]{6}$/.test(color)) throw validationError("color is invalid");
  return color;
}

function optionalLessonLink(value, fallback = "") {
  const lessonLink = limitedText(value, "lessonLink", 500, fallback);
  if (!lessonLink) return "";
  let parsed;
  try {
    parsed = new URL(lessonLink);
  } catch (_error) {
    throw validationError("lessonLink is invalid");
  }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw validationError("lessonLink is invalid");
  }
  return lessonLink;
}

function isArchivedGroup(group) {
  return group?.status === "archived" || Boolean(group?.archivedAt);
}

function normalizeLessonDate(value) {
  if (value === undefined || value === null || String(value).trim() === "") return today();
  const date = parseDateOnly(value);
  if (!date) throw validationError("date is invalid");
  return isoDate(date);
}

function normalizeLessonTime(value) {
  const raw = required(value, "time");
  const parsed = parseLessonTime(raw);
  if (!parsed) throw validationError("time is invalid");
  return `${parsed.startTime} - ${parsed.endTime}`;
}

function normalizeClockTime(value, field) {
  const raw = required(value, field);
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(raw)) throw validationError(`${field} is invalid`);
  return raw;
}

function normalizeDateField(value, field, fallback = "") {
  if ((value === undefined || value === null || String(value).trim() === "") && fallback) return fallback;
  const raw = required(value, field);
  const parsed = parseDateOnly(raw);
  if (!parsed) throw validationError(`${field} is invalid`);
  return isoDate(parsed);
}

function optionalEmail(value, field = "email") {
  const email = String(value || "").trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw validationError(`${field} is invalid`);
  return email;
}

function optionalDateField(value, field, fallback = "") {
  if (value === undefined) return fallback;
  if (value === null || String(value).trim() === "") return "";
  return normalizeDateField(value, field);
}

function textValue(value, fallback = "") {
  return String(value === undefined || value === null ? fallback : value).trim();
}

function teacherStudentProfileDto(profile) {
  const { ledger, balance, recentPayments, subscriptions, ...safeProfile } = profile;
  return {
    ...safeProfile,
    student: teacherStudentDto(profile.student),
    guardians: (profile.guardians || []).map(({ telegramChatId, ...guardian }) => guardian),
  };
}

function teacherAccessEnabled(body, fallback = false) {
  if (body.accessEnabled !== undefined) return Boolean(body.accessEnabled);
  if (body.access_enabled !== undefined) return Boolean(body.access_enabled);
  return fallback;
}

class AppService {
  constructor(repository) {
    this.repository = repository;
  }

  assertFinancialDateOpen(context, date, branchId = "") {
    const period = this.repository.closedFinancePeriod(context.tenantId, branchId, date);
    if (!period) return;
    const error = new Error(`Finance period is closed: ${period.label}`);
    error.status = 409;
    throw error;
  }

  validateFinanceReferences(context, payload) {
    const branchId = textValue(payload.branchId || payload.branch_id);
    if (branchId && !this.repository.branch(context.tenantId, branchId)) throw validationError("branchId is invalid");
    const accountId = textValue(payload.accountId || payload.account_id);
    if (accountId && !this.repository.financeAccounts(context.tenantId).some((account) => account.id === accountId)) {
      throw validationError("accountId is invalid");
    }
    const categoryId = textValue(payload.categoryId || payload.category_id);
    if (categoryId && !this.repository.financeCategories(context.tenantId).some((category) => category.id === categoryId)) {
      throw validationError("categoryId is invalid");
    }
    return { branchId, accountId, categoryId };
  }

  bootstrap(context) {
	    if (context.realRole === "superadmin" && !context.tenantId) {
      return {
        platform: {
          tenants: this.repository.platformTenants(),
          auditLogs: this.repository.platformAuditLogs(25),
        },
        dashboard: null,
        students: [],
        groups: [],
        teachers: [],
        lessons: [],
        attendanceRecords: [],
        payments: [],
        messages: [],
        leads: [],
        auditLogs: [],
      };
	    }

    if (context.realRole !== "superadmin" && ["suspended", "blocked"].includes(context.tenantStatus)) {
      const error = new Error("Tenant is suspended");
      error.status = 403;
      throw error;
    }

	    const tenant = this.repository.tenant(context.tenantId);
    if (!tenant) {
      const error = new Error("Tenant not found");
      error.status = 404;
      throw error;
    }

    const dashboardData =
      context.role === "teacher"
        ? this.repository.teacherDashboard(context.tenantId, context.userId)
        : this.repository.adminDashboard(context.tenantId);
    const dashboard = {
      tenant,
      ...dashboardData,
    };

    return {
      dashboard,
      students: [],
      groups: [],
      teachers: [],
      lessons: [],
      attendanceRecords: [],
      payments: [],
      messages: [],
      leads: [],
      auditLogs: context.role === "teacher" ? [] : this.repository.auditLogs(context.tenantId),
    };
  }

  platformTenants() {
    return this.repository.platformTenants();
  }

  createPlatformTenant(context, body) {
    const row = this.repository.createPlatformTenant({
      name: required(body.name, "name"),
      domain: body.domain || "",
      status: body.status ? enumValue(body.status, ["trial", "active", "suspended", "blocked"], "status") : "active",
      plan: body.plan ? enumValue(body.plan, ["starter", "standard", "pro", "enterprise"], "plan") : "standard",
    });
    this.recordPlatformAudit(context, "created", "tenant", row.id, row.id, { name: row.name, plan: row.plan });
    return row;
  }

  createPlatformTenantAdmin(context, tenantId, body) {
    const row = this.repository.createPlatformTenantAdmin(required(tenantId, "tenantId"), {
      name: required(body.name, "name"),
      username: required(body.username, "username"),
      password: required(body.password, "password"),
    });
    this.recordPlatformAudit(context, "created", "tenant_admin", row.id, row.tenantId, { username: row.username });
    return row;
  }

  updatePlatformTenant(context, tenantId, body) {
    const row = this.repository.updatePlatformTenant(required(tenantId, "tenantId"), {
      name: body.name ? required(body.name, "name") : "",
      status: body.status ? enumValue(body.status, ["trial", "active", "suspended", "blocked"], "status") : "",
      plan: body.plan ? enumValue(body.plan, ["starter", "standard", "pro", "enterprise"], "plan") : "",
      suspendedReason: body.suspendedReason || body.suspended_reason || "",
    });
    if (!row) {
      const error = new Error("Tenant not found");
      error.status = 404;
      throw error;
    }
    this.recordPlatformAudit(context, "updated", "tenant", row.id, row.id, { status: row.status, plan: row.plan });
    return row;
  }

  recordPlatformAudit(context, action, entity, entityId, tenantId = null, metadata = {}) {
    return this.repository.platformAudit(context.userId || "system", action, entity, entityId, tenantId, metadata);
  }

  platformAuditLogs() {
    return this.repository.platformAuditLogs(50);
  }

  myPermissions(context) {
    return {
      role: context.role,
      realRole: context.realRole,
      permissions: context.tenantId ? this.repository.userPermissions(context.tenantId, context.userId, context.role) : [],
    };
  }

  listRoles(context) {
    return this.repository.roles(context.tenantId);
  }

  listBranches(context) {
    return this.repository.branches(context.tenantId);
  }

  createBranch(context, body) {
    const row = this.repository.createBranch(context.tenantId, {
      name: required(body.name, "name"),
      status: body.status ? enumValue(body.status, ["active", "inactive"], "status") : "active",
      isMain: Boolean(body.isMain || body.is_main),
    });
    this.repository.audit(context, "created", "branch", row.id);
    return row;
  }

  listStudents(context, search = "", includeArchived = false) {
    const query = String(search || "").trim();
    const canIncludeArchived = context.role === "admin" && Boolean(includeArchived);
    const students =
      context.role === "teacher"
        ? query
          ? this.repository.searchStudentsForTeacher(context.tenantId, context.userId, query)
          : this.repository.studentsForTeacher(context.tenantId, context.userId)
        : query
          ? this.repository.searchStudents(context.tenantId, query, canIncludeArchived)
          : this.repository.students(context.tenantId, canIncludeArchived);
    if (context.role !== "teacher") return students;
    return students.map(teacherStudentDto);
  }

  updateCenterSettings(context, body) {
    const tenant = this.repository.updateTenantName(context.tenantId, required(body.name, "name"));
    if (!tenant) {
      const error = new Error("Tenant not found");
      error.status = 404;
      throw error;
    }
    this.repository.audit(context, "updated", "center_settings", tenant.id);
    return { name: tenant.name };
  }

  changePassword(context, body) {
    const result = this.repository.changeUserPassword(
      context.userId,
      required(body.currentPassword, "currentPassword"),
      required(body.newPassword, "newPassword"),
    );
    this.repository.audit(context, "updated", "password", context.userId);
    return result;
  }

  listGroups(context, includeArchived = false) {
    const canIncludeArchived = context.role === "admin" && Boolean(includeArchived);
    const groups =
      context.role === "teacher"
        ? this.repository.groupsForTeacher(context.tenantId, context.userId)
        : this.repository.groups(context.tenantId, canIncludeArchived);
    return context.role === "teacher"
      ? groups.filter((group) => group.teacherId === context.userId && !isArchivedGroup(group)).map(teacherGroupDto)
      : groups;
  }

  listTeachers(context) {
    if (context.role !== "teacher") return this.repository.teachers(context.tenantId);
    return [this.repository.teacher(context.tenantId, context.userId)].filter(Boolean).map((teacher) => {
      const { username, accessStatus, ...safeTeacher } = teacher;
      return safeTeacher;
    });
  }

  getTeacher(context, teacherId) {
    const id = required(teacherId, "teacherId");
    if (context.role === "teacher" && id !== context.userId) {
      const error = new Error("Only own teacher profile is available");
      error.status = 403;
      throw error;
    }
    const details = this.repository.teacherDetails(context.tenantId, id);
    if (!details) {
      const error = new Error("Teacher not found");
      error.status = 404;
      throw error;
    }
    if (context.role === "teacher") {
      const { username, accessStatus, ...safeTeacher } = details.teacher;
      return { ...details, teacher: safeTeacher };
    }
    return details;
  }

  validateTeacherBranch(context, branchId) {
    if (!branchId) return "";
    if (!this.repository.branch(context.tenantId, branchId)) throw validationError("branchId is invalid");
    return branchId;
  }

  teacherPayload(context, body, existing = null) {
    const accessEnabled = teacherAccessEnabled(body, existing?.hasAccess && existing?.accessStatus === "active");
    if (accessEnabled && existing?.status === "inactive") throw validationError("Restore teacher before enabling portal access");
    const username = String(body.username ?? existing?.username ?? "").trim();
    const password = String(body.password || "");
    if (accessEnabled && !/^[A-Za-z0-9._@+-]{3,80}$/.test(username)) throw validationError("username is invalid");
    if (accessEnabled && !existing?.hasAccess && password.length < 8) throw validationError("password must contain at least 8 characters");
    if (password && password.length < 8) throw validationError("password must contain at least 8 characters");
    const maxWeeklyHours = Number(body.maxWeeklyHours ?? body.max_weekly_hours ?? (existing ? existing.maxWeeklyMinutes / 60 : 40));
    if (!Number.isFinite(maxWeeklyHours) || maxWeeklyHours < 1 || maxWeeklyHours > 80) throw validationError("maxWeeklyHours must be between 1 and 80");
    const hiredAtRaw = body.hiredAt ?? body.hired_at ?? existing?.hiredAt ?? "";
    return {
      name: required(body.name, "name"),
      phone: String(body.phone || "").trim(),
      email: optionalEmail(body.email),
      specialization: String(body.specialization || "").trim(),
      employmentType: enumValue(body.employmentType || body.employment_type || existing?.employmentType || "full_time", ["full_time", "part_time", "contract"], "employmentType"),
      hiredAt: hiredAtRaw ? normalizeDateField(hiredAtRaw, "hiredAt") : "",
      maxWeeklyMinutes: Math.round(maxWeeklyHours * 60),
      note: String(body.note || "").trim(),
      branchId: this.validateTeacherBranch(context, body.branchId || body.branch_id || existing?.branchId || ""),
      accessEnabled,
      username,
      password,
    };
  }

  createTeacher(context, body) {
    const row = this.repository.createTeacher(context.tenantId, this.teacherPayload(context, body));
    this.repository.audit(context, "created", "teacher", row.id);
    return row;
  }

  updateTeacher(context, teacherId, body) {
    const existing = this.repository.teacher(context.tenantId, required(teacherId, "teacherId"));
    if (!existing) {
      const error = new Error("Teacher not found");
      error.status = 404;
      throw error;
    }
    const row = this.repository.updateTeacher(context.tenantId, existing.id, this.teacherPayload(context, body, existing));
    this.repository.audit(context, "updated", "teacher", row.id);
    return row;
  }

  archiveTeacher(context, teacherId) {
    const existing = this.repository.teacher(context.tenantId, required(teacherId, "teacherId"));
    if (!existing) {
      const error = new Error("Teacher not found");
      error.status = 404;
      throw error;
    }
    const details = this.repository.teacherDetails(context.tenantId, existing.id);
    if (existing.groupsCount > 0 || details.upcomingLessons.length > 0) {
      const error = new Error("Teacher has active groups or upcoming lessons; reassign them before archiving");
      error.status = 409;
      throw error;
    }
    const row = this.repository.archiveTeacher(context.tenantId, existing.id);
    this.repository.audit(context, "archived", "teacher", row.id);
    return row;
  }

  restoreTeacher(context, teacherId) {
    const existing = this.repository.teacher(context.tenantId, required(teacherId, "teacherId"));
    if (!existing) {
      const error = new Error("Teacher not found");
      error.status = 404;
      throw error;
    }
    const row = this.repository.restoreTeacher(context.tenantId, existing.id);
    this.repository.audit(context, "restored", "teacher", row.id);
    return row;
  }

  resetTeacherPassword(context, teacherId, body) {
    const password = required(body.newPassword || body.new_password, "newPassword");
    if (password.length < 8) throw validationError("password must contain at least 8 characters");
    const result = this.repository.resetTeacherPassword(context.tenantId, required(teacherId, "teacherId"), password);
    if (!result) {
      const error = new Error("Teacher portal access is not configured");
      error.status = 404;
      throw error;
    }
    this.repository.audit(context, "reset_password", "teacher", teacherId);
    return result;
  }

  listSubscriptions(context) {
    return context.role === "teacher" ? [] : this.repository.subscriptions(context.tenantId);
  }

  createSubscription(context, body) {
    const student = this.repository.student(context.tenantId, required(body.studentId, "studentId"));
    if (!student) {
      const error = new Error("Student not found");
      error.status = 404;
      throw error;
    }
    const groupId = body.groupId || student.groupId || "";
    if (groupId && !this.repository.group(context.tenantId, groupId)) {
      const error = new Error("Group not found");
      error.status = 404;
      throw error;
    }
    const lessonsTotal = nonNegativeNumber(body.lessonsTotal ?? body.lessons_total, "lessonsTotal");
    const lessonsUsed = nonNegativeNumber(body.lessonsUsed ?? body.lessons_used, "lessonsUsed");
    const amount = nonNegativeNumber(body.amount, "amount");
    if (!Number.isSafeInteger(lessonsTotal) || !Number.isSafeInteger(lessonsUsed)) {
      throw validationError("lesson counts must be integers");
    }
    if ((lessonsTotal === 0 && lessonsUsed !== 0) || (lessonsTotal > 0 && lessonsUsed > lessonsTotal)) {
      throw validationError("lessonsUsed cannot exceed lessonsTotal");
    }
    if (!Number.isSafeInteger(amount)) throw validationError("amount must be an integer amount in UZS");
    const row = this.repository.createSubscription(context.tenantId, {
      studentId: student.id,
      groupId,
      name: required(body.name || "Abonement", "name"),
      status: body.status ? enumValue(body.status, ["active", "paused", "completed", "cancelled"], "status") : "active",
      startDate: normalizeDateField(body.startDate || body.start_date, "startDate", today()),
      endDate: body.endDate || body.end_date ? normalizeDateField(body.endDate || body.end_date, "endDate") : "",
      lessonsTotal,
      lessonsUsed,
      amount,
      branchId: body.branchId || body.branch_id || "",
    });
    this.repository.audit(context, "created", "subscription", row.id);
    return row;
  }

  listAttendanceReasons(context) {
    return this.repository.attendanceReasons(context.tenantId, context.role !== "admin");
  }

  createAttendanceReason(context, body) {
    const code = textValue(body.code).toLowerCase();
    if (!/^[a-z][a-z0-9_]{1,39}$/.test(code)) throw validationError("code is invalid");
    const row = this.repository.createAttendanceReason(context.tenantId, {
      code,
      name: requiredLimitedText(body.name, "name", 120),
      attendanceStatus: enumValue(body.attendanceStatus || body.attendance_status, ["present", "absent", "late", "excused"], "attendanceStatus"),
      chargePercent: percentage(required(body.chargePercent ?? body.charge_percent, "chargePercent"), "chargePercent"),
      consumePercent: percentage(required(body.consumePercent ?? body.consume_percent, "consumePercent"), "consumePercent"),
      actorUserId: context.userId,
    });
    this.repository.audit(context, "created", "attendance_reason", row.id);
    return row;
  }

  updateAttendanceReason(context, reasonId, body) {
    const existing = this.repository.attendanceReason(context.tenantId, required(reasonId, "reasonId"));
    if (!existing) {
      const error = new Error("Attendance reason not found");
      error.status = 404;
      throw error;
    }
    if (existing.isSystem && body.isActive === false) throw validationError("System attendance reason cannot be disabled");
    const row = this.repository.updateAttendanceReason(context.tenantId, existing.id, {
      name: body.name === undefined ? existing.name : requiredLimitedText(body.name, "name", 120),
      chargePercent: body.chargePercent === undefined && body.charge_percent === undefined
        ? existing.chargePercent
        : percentage(body.chargePercent ?? body.charge_percent, "chargePercent"),
      consumePercent: body.consumePercent === undefined && body.consume_percent === undefined
        ? existing.consumePercent
        : percentage(body.consumePercent ?? body.consume_percent, "consumePercent"),
      isActive: body.isActive === undefined && body.is_active === undefined ? existing.isActive : Boolean(body.isActive ?? body.is_active),
    });
    this.repository.audit(context, "updated", "attendance_reason", row.id);
    return row;
  }

  listLessonBillingPolicies(context) {
    return this.repository.lessonBillingPolicies(context.tenantId);
  }

  createLessonBillingPolicy(context, body) {
    const branchId = textValue(body.branchId || body.branch_id);
    if (branchId && !this.repository.branch(context.tenantId, branchId)) throw validationError("branchId is invalid");
    const groupId = textValue(body.groupId || body.group_id);
    const group = groupId ? this.repository.group(context.tenantId, groupId) : null;
    if (groupId && !group) throw validationError("groupId is invalid");
    if (branchId && group?.branchId && group.branchId !== branchId) throw validationError("groupId does not belong to branchId");
    const baseAmount = nonNegativeNumber(required(body.baseAmount ?? body.base_amount, "baseAmount"), "baseAmount");
    if (!Number.isSafeInteger(baseAmount)) throw validationError("baseAmount must be an integer amount in UZS");
    const validFrom = normalizeDateField(body.validFrom || body.valid_from, "validFrom", today());
    const validUntil = optionalDateField(body.validUntil ?? body.valid_until, "validUntil");
    if (validUntil && validUntil < validFrom) throw validationError("validUntil cannot be before validFrom");
    const row = this.repository.createLessonBillingPolicy(context.tenantId, {
      branchId,
      groupId,
      name: requiredLimitedText(body.name, "name", 120, group?.name ? `${group.name} tarifi` : "Standart dars tarifi"),
      baseAmount,
      currency: enumValue(body.currency || "UZS", ["UZS"], "currency"),
      validFrom,
      validUntil,
      actorUserId: context.userId,
    });
    this.repository.audit(context, "created", "lesson_billing_policy", row.id);
    return row;
  }

  listTeacherRateRules(context) {
    const teacherId = context.role === "teacher" ? context.userId : null;
    return this.repository.teacherRateRules(context.tenantId, teacherId);
  }

  createTeacherRateRule(context, body) {
    const teacherId = required(body.teacherId || body.teacher_id, "teacherId");
    const teacher = this.repository.teacher(context.tenantId, teacherId);
    if (!teacher || teacher.status !== "active") throw validationError("teacherId is invalid or inactive");
    const groupId = textValue(body.groupId || body.group_id);
    const group = groupId ? this.repository.group(context.tenantId, groupId) : null;
    if (groupId && !group) throw validationError("groupId is invalid");
    const branchId = textValue(body.branchId || body.branch_id);
    if (branchId && !this.repository.branch(context.tenantId, branchId)) throw validationError("branchId is invalid");
    if (branchId && group?.branchId && group.branchId !== branchId) throw validationError("groupId does not belong to branchId");
    const effectiveFrom = normalizeDateField(body.effectiveFrom || body.effective_from, "effectiveFrom", today());
    const effectiveUntil = optionalDateField(body.effectiveUntil ?? body.effective_until, "effectiveUntil");
    if (effectiveUntil && effectiveUntil < effectiveFrom) throw validationError("effectiveUntil cannot be before effectiveFrom");
    const row = this.repository.createTeacherRateRule(context.tenantId, {
      teacherId,
      branchId,
      groupId,
      lessonType: body.lessonType || body.lesson_type
        ? enumValue(body.lessonType || body.lesson_type, ["group", "individual", "trial", "makeup"], "lessonType")
        : "",
      rateType: enumValue(body.rateType || body.rate_type, ["flat", "per_student", "hourly"], "rateType"),
      amount: nonNegativeNumber(required(body.amount, "amount"), "amount"),
      currency: enumValue(body.currency || "UZS", ["UZS"], "currency"),
      effectiveFrom,
      effectiveUntil,
      actorUserId: context.userId,
    });
    this.repository.audit(context, "created", "teacher_rate_rule", row.id);
    return row;
  }

  archiveTeacherRateRule(context, ruleId, body) {
    const reason = requiredLimitedText(body.reason, "reason", 500);
    const row = this.repository.archiveTeacherRateRule(context.tenantId, required(ruleId, "ruleId"), {
      reason,
      actorUserId: context.userId,
    });
    if (!row) {
      const error = new Error("Teacher rate rule not found");
      error.status = 404;
      throw error;
    }
    this.repository.audit(context, "archived", "teacher_rate_rule", row.id);
    return row;
  }

  listFinancePeriods(context) {
    return this.repository.financePeriods(context.tenantId);
  }

  createFinancePeriod(context, body) {
    const branchId = textValue(body.branchId || body.branch_id);
    if (branchId && !this.repository.branch(context.tenantId, branchId)) throw validationError("branchId is invalid");
    const startDate = normalizeDateField(body.startDate || body.start_date, "startDate");
    const endDate = normalizeDateField(body.endDate || body.end_date, "endDate");
    if (endDate < startDate) throw validationError("endDate cannot be before startDate");
    const row = this.repository.createFinancePeriod(context.tenantId, {
      label: requiredLimitedText(body.label, "label", 120, `${startDate} — ${endDate}`),
      branchId,
      startDate,
      endDate,
      actorUserId: context.userId,
    });
    this.repository.audit(context, "created", "finance_period", row.id);
    return row;
  }

  closeFinancePeriod(context, periodId, body) {
    const row = this.repository.closeFinancePeriod(context.tenantId, required(periodId, "periodId"), {
      reason: requiredLimitedText(body.reason, "reason", 500),
      actorUserId: context.userId,
    });
    if (!row) {
      const error = new Error("Finance period not found");
      error.status = 404;
      throw error;
    }
    this.repository.audit(context, "closed", "finance_period", row.id);
    return row;
  }

  reopenFinancePeriod(context, periodId, body) {
    const row = this.repository.reopenFinancePeriod(context.tenantId, required(periodId, "periodId"), {
      reason: requiredLimitedText(body.reason, "reason", 500),
      actorUserId: context.userId,
    });
    if (!row) {
      const error = new Error("Finance period not found");
      error.status = 404;
      throw error;
    }
    this.repository.audit(context, "reopened", "finance_period", row.id);
    return row;
  }

  listTeacherWorkingHours(context) {
    const teacherId = context.role === "teacher" ? context.userId : null;
    return this.repository.teacherWorkingHours(context.tenantId, teacherId);
  }

  createTeacherWorkingHour(context, body) {
    const teacherId = required(body.teacherId || body.teacher_id, "teacherId");
    const teacher = this.repository.teacher(context.tenantId, teacherId);
    if (!teacher) {
      const error = new Error("Teacher not found");
      error.status = 404;
      throw error;
    }
    if (teacher.status !== "active") throw validationError("Teacher is inactive");
    const startTime = normalizeClockTime(body.startTime || body.start_time, "startTime");
    const endTime = normalizeClockTime(body.endTime || body.end_time, "endTime");
    if (endTime <= startTime) throw validationError("endTime must be after startTime");
    const weekday = enumValue(String(body.weekday || ""), ["1", "2", "3", "4", "5", "6", "7"], "weekday");
    if (this.repository.overlappingTeacherWorkingHour(context.tenantId, teacherId, weekday, startTime, endTime)) {
      const error = new Error("Working hours overlap with an existing interval");
      error.status = 409;
      throw error;
    }
    const row = this.repository.createTeacherWorkingHour(context.tenantId, {
      teacherId,
      weekday,
      startTime,
      endTime,
      branchId: body.branchId || body.branch_id || "",
    });
    this.repository.audit(context, "created", "teacher_working_hour", row.id);
    return row;
  }

  deleteTeacherWorkingHour(context, workingHourId) {
    const row = this.repository.deleteTeacherWorkingHour(context.tenantId, required(workingHourId, "workingHourId"));
    if (!row) {
      const error = new Error("Working hour not found");
      error.status = 404;
      throw error;
    }
    this.repository.audit(context, "deleted", "teacher_working_hour", row.id);
    return row;
  }

  listFinanceAccounts(context) {
    return context.role === "teacher" ? [] : this.repository.financeAccounts(context.tenantId);
  }

  createFinanceAccount(context, body) {
    const row = this.repository.createFinanceAccount(context.tenantId, {
      name: required(body.name, "name"),
      type: enumValue(body.type || "cash", ["cash", "bank", "card", "online"], "type"),
    });
    this.repository.audit(context, "created", "finance_account", row.id);
    return row;
  }

  listFinanceCategories(context) {
    return context.role === "teacher" ? [] : this.repository.financeCategories(context.tenantId);
  }

  createFinanceCategory(context, body) {
    const row = this.repository.createFinanceCategory(context.tenantId, {
      name: required(body.name, "name"),
      kind: enumValue(body.kind || "income", ["income", "expense", "adjustment"], "kind"),
    });
    this.repository.audit(context, "created", "finance_category", row.id);
    return row;
  }

  listLessons(context) {
    return context.role === "teacher"
      ? this.repository.lessonsForTeacher(context.tenantId, context.userId)
      : this.repository.lessons(context.tenantId);
  }

  listLessonStudents(context, lessonId) {
    const id = required(lessonId, "lessonId");
    const lesson = this.repository.lesson(context.tenantId, id);
    if (!lesson) {
      const error = new Error("Lesson not found");
      error.status = 404;
      throw error;
    }
    if (context.role === "teacher" && lesson.teacherId !== context.userId) {
      const error = new Error("Only assigned teacher can view this lesson roster");
      error.status = 403;
      throw error;
    }
    const students = this.repository.studentsForLesson(context.tenantId, id);
    return context.role === "teacher" ? students.map(teacherStudentDto) : students;
  }

  listTasks(context) {
    return this.repository.tasks(context.tenantId, context.userId, context.role);
  }

  createTask(context, body) {
    const row = this.repository.createTask(context.tenantId, {
      title: required(body.title, "title"),
      priority: body.priority ? enumValue(body.priority, ["low", "normal", "high"], "priority") : "normal",
      dueAt: body.dueAt || body.due_at || "",
      assigneeUserId: body.assigneeUserId || body.assignee_user_id || "",
      authorUserId: context.userId,
      relatedType: body.relatedType || body.related_type || "",
      relatedId: body.relatedId || body.related_id || "",
      note: body.note || "",
    });
    this.repository.audit(context, "created", "task", row.id);
    return row;
  }

  updateTask(context, taskId, body) {
    const existing = this.repository.task(context.tenantId, required(taskId, "taskId"));
    if (!existing) {
      const error = new Error("Task not found");
      error.status = 404;
      throw error;
    }
    if (context.role === "teacher" && existing.assigneeUserId && existing.assigneeUserId !== context.userId) {
      const error = new Error("Only assigned user can update this task");
      error.status = 403;
      throw error;
    }
    if (context.role === "teacher") {
      const forbiddenFields = ["title", "priority", "dueAt", "due_at", "assigneeUserId", "assignee_user_id", "relatedType", "related_type", "relatedId", "related_id", "note"];
      if (forbiddenFields.some((field) => body[field] !== undefined)) {
        const error = new Error("Teacher can only update task status");
        error.status = 403;
        throw error;
      }
      if (body.status && !["open", "completed"].includes(body.status)) {
        const error = new Error("Teacher can only open or complete a task");
        error.status = 403;
        throw error;
      }
    }
    const row = this.repository.updateTask(context.tenantId, existing.id, {
      title: body.title || existing.title,
      status: body.status ? enumValue(body.status, ["open", "completed", "archived"], "status") : existing.status,
      priority: body.priority ? enumValue(body.priority, ["low", "normal", "high"], "priority") : existing.priority,
      dueAt: body.dueAt ?? body.due_at,
      assigneeUserId: body.assigneeUserId ?? body.assignee_user_id,
      relatedType: body.relatedType ?? body.related_type,
      relatedId: body.relatedId ?? body.related_id,
      note: body.note,
    });
    this.repository.audit(context, "updated", "task", row.id);
    return row;
  }

  listAttendanceRecords(context) {
    return context.role === "teacher"
      ? this.repository.attendanceRecordsForTeacher(context.tenantId, context.userId)
      : this.repository.attendanceRecords(context.tenantId);
  }

  listPayments(context) {
    return context.role === "teacher" ? [] : this.repository.payments(context.tenantId);
  }

  listMessages(context) {
    return context.role === "teacher" ? [] : this.repository.messages(context.tenantId);
  }

  studentPayload(context, body, existing = null) {
    const groupId = required(body.groupId ?? body.group_id ?? existing?.groupId, "groupId");
    if (!this.repository.group(context.tenantId, groupId)) {
      const error = new Error("Group not found");
      error.status = 404;
      throw error;
    }

    const birthDate = optionalDateField(body.birthDate ?? body.birth_date, "birthDate", existing?.birthDate || "");
    if (birthDate && birthDate > today()) throw validationError("birthDate cannot be in the future");
    const enrollmentDate = optionalDateField(
      body.enrollmentDate ?? body.enrollment_date,
      "enrollmentDate",
      existing?.enrollmentDate || today(),
    );
    const gender = textValue(body.gender, existing?.gender || "");
    if (gender) enumValue(gender, ["male", "female", "other"], "gender");
    const relationship = enumValue(
      textValue(body.parentRelationship ?? body.parent_relationship, existing?.parentRelationship || "guardian"),
      ["mother", "father", "guardian", "grandparent", "other"],
      "parentRelationship",
    );
    const status = enumValue(
      textValue(body.status, existing?.status || "active"),
      ["active", "frozen", "left"],
      "status",
    );
    const rawDebt = existing ? 0 : Number(body.debt || 0);
    if (!Number.isFinite(rawDebt) || rawDebt < 0) throw validationError("debt is invalid");

    return {
      name: required(body.name ?? existing?.name, "name"),
      groupId,
      parentName: required(body.parentName ?? body.parent_name ?? existing?.parentName, "parentName"),
      parentRelationship: relationship,
      parentEmail: optionalEmail(body.parentEmail ?? body.parent_email, "parentEmail"),
      phone: textValue(body.phone, existing?.phone || ""),
      studentPhone: textValue(body.studentPhone ?? body.student_phone, existing?.studentPhone || ""),
      email: optionalEmail(body.email === undefined ? existing?.email : body.email, "email"),
      birthDate,
      gender,
      address: textValue(body.address, existing?.address || ""),
      source: textValue(body.source, existing?.source || ""),
      enrollmentDate,
      note: textValue(body.note, existing?.note || ""),
      telegramChatId: textValue(body.telegramChatId ?? body.telegram_chat_id, existing?.telegramChatId || ""),
      status,
      debt: Math.round(rawDebt),
      branchId: textValue(body.branchId ?? body.branch_id, existing?.branchId || ""),
      archiveReason: textValue(body.archiveReason ?? body.archive_reason, existing?.archiveReason || ""),
      transferReason: textValue(body.transferReason ?? body.transfer_reason, ""),
      actorUserId: context.userId,
    };
  }

  createStudent(context, body) {
    const row = this.repository.createStudent(context.tenantId, this.studentPayload(context, body));
    this.repository.audit(context, "created", "student", row.id);
    return row;
  }

  getStudentProfile(context, studentId) {
    const id = required(studentId, "studentId");
    const student = this.repository.student(context.tenantId, id);
    if (!student) {
      const error = new Error("Student not found");
      error.status = 404;
      throw error;
    }
    if (context.role === "teacher") {
      const assigned = this.repository.studentsForTeacher(context.tenantId, context.userId).some((row) => row.id === id);
      if (!assigned) {
        const error = new Error("Only assigned students are available");
        error.status = 403;
        throw error;
      }
    }
    const profile = this.repository.studentProfile(context.tenantId, id);
    if (!profile) {
      const error = new Error("Student not found");
      error.status = 404;
      throw error;
    }
    return context.role === "teacher" ? teacherStudentProfileDto(profile) : profile;
  }

  updateStudent(context, studentId, body) {
    const existing = this.repository.student(context.tenantId, required(studentId, "studentId"));
    if (!existing) {
      const error = new Error("Student not found");
      error.status = 404;
      throw error;
    }
    const payload = this.studentPayload(context, body, existing);
    const row = this.repository.updateStudent(context.tenantId, existing.id, payload);
    const action =
      existing.status !== "left" && row.status === "left"
        ? "archived"
        : existing.status === "left" && row.status !== "left"
          ? "restored"
          : "updated";
    this.repository.audit(context, action, "student", row.id);
    return row;
  }

  deleteStudent(context, studentId, body = {}) {
    const existing = this.repository.student(context.tenantId, required(studentId, "studentId"));
    if (!existing) {
      const error = new Error("Student not found");
      error.status = 404;
      throw error;
    }
    const row = this.repository.deleteStudent(context.tenantId, existing.id, {
      reason: textValue(body.reason ?? body.archiveReason ?? body.archive_reason),
      actorUserId: context.userId,
    });
    this.repository.audit(context, "archived", "student", existing.id);
    return row;
  }

  restoreStudent(context, studentId) {
    const existing = this.repository.student(context.tenantId, required(studentId, "studentId"));
    if (!existing) {
      const error = new Error("Student not found");
      error.status = 404;
      throw error;
    }
    if (existing.status !== "left") {
      const error = new Error("Student is not archived");
      error.status = 409;
      throw error;
    }
    const row = this.repository.restoreStudent(context.tenantId, existing.id, context.userId);
    this.repository.audit(context, "restored", "student", existing.id);
    return row;
  }

  groupPayload(context, body, existing = null) {
    const teacherId = required(body.teacherId ?? body.teacher_id ?? existing?.teacherId, "teacherId");
    const teacher = this.repository.teacher(context.tenantId, teacherId);
    if (!teacher) {
      const error = new Error("Teacher not found");
      error.status = 404;
      throw error;
    }
    if (teacher.status !== "active") throw validationError("Teacher is inactive");

    let legacyStatus;
    if (body.active !== undefined) {
      const active = body.active === true || body.active === 1 || String(body.active).toLowerCase() === "true";
      legacyStatus = active ? "active" : "completed";
    }
    const status = enumValue(
      textValue(body.status, legacyStatus || existing?.status || (existing?.active === false ? "completed" : "active")),
      ["draft", "active", "completed", "cancelled"],
      "status",
    );
    const startDate = optionalGroupDate(body.startDate ?? body.start_date, "startDate", existing?.startDate || "");
    const endDate = optionalGroupDate(body.endDate ?? body.end_date, "endDate", existing?.endDate || "");
    if (startDate && endDate && endDate < startDate) throw validationError("endDate must be on or after startDate");

    return {
      name: requiredLimitedText(body.name, "name", 160, existing?.name),
      subject: requiredLimitedText(body.subject, "subject", 160, existing?.subject),
      teacherId,
      description: limitedText(body.description, "description", 2000, existing?.description || ""),
      level: limitedText(body.level, "level", 120, existing?.level || ""),
      capacity: groupCapacity(body.capacity, existing?.capacity || 0),
      startDate,
      endDate,
      status,
      color: optionalColor(body.color, existing?.color || "#2563EB"),
      note: limitedText(body.note, "note", 4000, existing?.note || ""),
      room: limitedText(body.room, "room", 160, existing?.room || ""),
      monthlyFee: nonNegativeNumber(body.monthlyFee ?? body.monthly_fee, "monthlyFee", existing?.monthlyFee || 0),
      active: status === "active",
      actorUserId: context.userId,
    };
  }

  createGroup(context, body) {
    const row = this.repository.createGroup(context.tenantId, this.groupPayload(context, body));
    this.repository.audit(context, "created", "group", row.id);
    return row;
  }

  updateGroup(context, groupId, body) {
    const existing = this.repository.group(context.tenantId, required(groupId, "groupId"));
    if (!existing) {
      const error = new Error("Group not found");
      error.status = 404;
      throw error;
    }
    if (isArchivedGroup(existing)) {
      const error = new Error("Archived group must be restored before editing");
      error.status = 409;
      throw error;
    }
    const payload = this.groupPayload(context, body, existing);
    if (payload.teacherId !== existing.teacherId) {
      const schedulesToChange = this.repository
        .groupSchedules(context.tenantId, existing.id, false)
        .filter((schedule) => schedule.teacherId !== payload.teacherId);
      if (schedulesToChange.length) {
        const error = new Error(
          "Change each active schedule with the this_and_future workflow before reassigning the group teacher",
        );
        error.status = 409;
        error.details = { scheduleIds: schedulesToChange.map((schedule) => schedule.id) };
        throw error;
      }
    }
    const row = this.repository.updateGroup(context.tenantId, existing.id, payload);
    this.repository.audit(context, "updated", "group", row.id);
    return row;
  }

  getGroupProfile(context, groupId) {
    const existing = this.repository.group(context.tenantId, required(groupId, "groupId"));
    if (!existing) {
      const error = new Error("Group not found");
      error.status = 404;
      throw error;
    }
    if (context.role === "teacher" && (existing.teacherId !== context.userId || isArchivedGroup(existing))) {
      const error = new Error("Only assigned group profile is available");
      error.status = 403;
      throw error;
    }
    const profile = this.repository.groupProfile(context.tenantId, existing.id);
    if (!profile) {
      const error = new Error("Group not found");
      error.status = 404;
      throw error;
    }
    return context.role === "teacher" ? teacherGroupProfileDto(profile) : profile;
  }

  listGroupSchedules(context, groupId, includeInactive = true) {
    const existing = this.repository.group(context.tenantId, required(groupId, "groupId"));
    if (!existing) {
      const error = new Error("Group not found");
      error.status = 404;
      throw error;
    }
    if (context.role === "teacher" && (existing.teacherId !== context.userId || isArchivedGroup(existing))) {
      const error = new Error("Only assigned group schedule is available");
      error.status = 403;
      throw error;
    }
    return this.repository.groupSchedules(context.tenantId, existing.id, context.role === "admin" && Boolean(includeInactive));
  }

  archiveGroup(context, groupId, body = {}) {
    const existing = this.repository.group(context.tenantId, required(groupId, "groupId"));
    if (!existing) {
      const error = new Error("Group not found");
      error.status = 404;
      throw error;
    }
    if (isArchivedGroup(existing)) {
      const error = new Error("Group is already archived");
      error.status = 409;
      throw error;
    }
    const blockers = this.repository.groupArchiveBlockers(context.tenantId, existing.id) || {};
    const activeMembers = Number(blockers.activeMembers ?? blockers.activeStudents ?? blockers.members ?? 0);
    const futureLessons = Number(blockers.futureLessons ?? blockers.upcomingLessons ?? blockers.plannedLessons ?? blockers.lessons ?? 0);
    const activeSchedules = Number(blockers.activeSchedules ?? blockers.schedules ?? 0);
    if (activeMembers > 0 || futureLessons > 0 || activeSchedules > 0) {
      const error = new Error("Group has active members or upcoming lessons");
      error.status = 409;
      error.details = { activeMembers, futureLessons, activeSchedules };
      throw error;
    }
    const row = this.repository.archiveGroup(context.tenantId, existing.id, {
      reason: limitedText(body.reason ?? body.archiveReason ?? body.archive_reason, "reason", 500),
      actorUserId: context.userId,
    });
    this.repository.audit(context, "archived", "group", existing.id);
    return row;
  }

  deleteGroup(context, groupId, body = {}) {
    return this.archiveGroup(context, groupId, body);
  }

  restoreGroup(context, groupId) {
    const existing = this.repository.group(context.tenantId, required(groupId, "groupId"));
    if (!existing) {
      const error = new Error("Group not found");
      error.status = 404;
      throw error;
    }
    if (!isArchivedGroup(existing)) {
      const error = new Error("Group is not archived");
      error.status = 409;
      throw error;
    }
    const row = this.repository.restoreGroup(context.tenantId, existing.id, context.userId);
    this.repository.audit(context, "restored", "group", existing.id);
    return row;
  }

  groupSchedulePayload(context, group, body, existing = null) {
    const weekday = Number(body.weekday ?? existing?.weekday);
    if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) {
      throw validationError("weekday must be an integer between 1 and 7");
    }
    const startTime = normalizeClockTime(body.startTime ?? body.start_time ?? existing?.startTime, "startTime");
    const endTime = normalizeClockTime(body.endTime ?? body.end_time ?? existing?.endTime, "endTime");
    if (endTime <= startTime) throw validationError("endTime must be after startTime");

    const teacherId = required(body.teacherId ?? body.teacher_id ?? existing?.teacherId ?? group.teacherId, "teacherId");
    const teacher = this.repository.teacher(context.tenantId, teacherId);
    if (!teacher) {
      const error = new Error("Teacher not found");
      error.status = 404;
      throw error;
    }
    if (teacher.status !== "active") throw validationError("Teacher is inactive");

    const roomId = textValue(body.roomId ?? body.room_id, existing?.roomId || "");
    if (roomId && !this.repository.room(context.tenantId, roomId)) throw validationError("roomId is invalid");
    const validFrom = optionalGroupDate(body.validFrom ?? body.valid_from, "validFrom", existing?.validFrom || "");
    const validUntil = optionalGroupDate(body.validUntil ?? body.valid_until, "validUntil", existing?.validUntil || "");
    if (validFrom && validUntil && validUntil < validFrom) throw validationError("validUntil must be on or after validFrom");
    if (group.startDate && validFrom && validFrom < group.startDate) {
      throw validationError("validFrom cannot be before group startDate");
    }
    if (group.endDate && validUntil && validUntil > group.endDate) {
      throw validationError("validUntil cannot be after group endDate");
    }

    const status = enumValue(textValue(body.status, existing?.status || "active"), ["active", "inactive"], "status");
    if (status === "active" && ["completed", "cancelled", "archived"].includes(group.status)) {
      const error = new Error("Active schedule cannot be added to a closed group");
      error.status = 409;
      throw error;
    }
    return {
      groupId: group.id,
      teacherId,
      roomId,
      weekday,
      startTime,
      endTime,
      validFrom,
      validUntil,
      status,
      lessonLink: optionalLessonLink(body.lessonLink ?? body.lesson_link, existing?.lessonLink || ""),
      actorUserId: context.userId,
    };
  }

  assertNoGroupScheduleConflict(context, payload, excludeScheduleId = "") {
    if (payload.status !== "active") return;
    const availability = this.repository.teacherAvailability(
      context.tenantId,
      payload.teacherId,
      payload.weekday,
      payload.startTime,
      payload.endTime,
    );
    if (!availability.available) {
      const error = new Error("Lesson is outside the teacher's configured working hours");
      error.status = 409;
      error.details = { teacherId: payload.teacherId, weekday: payload.weekday, startTime: payload.startTime, endTime: payload.endTime };
      throw error;
    }
    const conflicts = this.repository.scheduleConflict(context.tenantId, payload, excludeScheduleId || null);
    const conflict = Array.isArray(conflicts) ? conflicts[0] : conflicts;
    if (!conflict) return;
    const error = new Error("Schedule conflicts with an existing group, teacher, or room interval");
    error.status = 409;
    error.details = conflict;
    throw error;
  }

  assertNoLessonConflict(context, payload, excludeLessonId = null, excludeScheduleId = null) {
    const weekday = isoWeekday(payload.date);
    const availability = this.repository.teacherAvailability(
      context.tenantId,
      payload.teacherId,
      weekday,
      payload.startTime,
      payload.endTime,
    );
    if (!availability.available) {
      const error = new Error("Lesson is outside the teacher's configured working hours");
      error.status = 409;
      error.details = { teacherId: payload.teacherId, weekday, startTime: payload.startTime, endTime: payload.endTime };
      throw error;
    }
    const conflicts = this.repository.lessonConflicts(
      context.tenantId,
      payload,
      excludeLessonId,
      excludeScheduleId,
    );
    if (!conflicts.length) return;
    const error = new Error("Lesson conflicts with an existing group, teacher, room, or student interval");
    error.status = 409;
    error.details = conflicts;
    throw error;
  }

  createGroupSchedule(context, groupId, body) {
    const group = this.repository.group(context.tenantId, required(groupId, "groupId"));
    if (!group) {
      const error = new Error("Group not found");
      error.status = 404;
      throw error;
    }
    if (isArchivedGroup(group)) {
      const error = new Error("Archived group must be restored before scheduling");
      error.status = 409;
      throw error;
    }
    const payload = this.groupSchedulePayload(context, group, body);
    this.assertNoGroupScheduleConflict(context, payload);
    const row = this.repository.createGroupSchedule(context.tenantId, group.id, payload);
    this.repository.audit(context, "created", "group_schedule", String(row.id));
    return row;
  }

  updateGroupSchedule(context, scheduleId, body) {
    throw validationError(
      "Direct schedule updates are disabled; use preview and an explicit this_occurrence or this_and_future change",
    );
  }

  disableGroupSchedule(_context, _scheduleId) {
    throw validationError(
      "Direct schedule disable is disabled; use a this_and_future change with status inactive",
    );
  }

  scheduleChangePlan(context, scheduleId, body, requireIdempotency = false) {
    const existing = this.repository.groupSchedule(context.tenantId, required(scheduleId, "scheduleId"));
    if (!existing) {
      const error = new Error("Group schedule not found");
      error.status = 404;
      throw error;
    }
    if (!existing.seriesId) throw validationError("Schedule lineage is not initialized");
    if (body.version === undefined) throw validationError("version is required");
    if (body.version !== undefined && Number(body.version) !== existing.seriesVersion) {
      const error = new Error("Schedule version changed; refresh the preview and retry");
      error.status = 409;
      error.details = { expectedVersion: existing.seriesVersion, receivedVersion: Number(body.version) };
      throw error;
    }
    const group = this.repository.group(context.tenantId, existing.groupId);
    if (!group) {
      const error = new Error("Group not found");
      error.status = 404;
      throw error;
    }
    if (isArchivedGroup(group)) {
      const error = new Error("Archived group must be restored before scheduling");
      error.status = 409;
      throw error;
    }

    const scope = enumValue(body.scope, ["this_occurrence", "this_and_future"], "scope");
    const occurrenceDate = normalizeLessonDate(body.occurrenceDate ?? body.occurrence_date);
    if (Number(existing.weekday) !== Number(isoWeekday(occurrenceDate))) {
      throw validationError("occurrenceDate is not an occurrence of this schedule version");
    }
    if (existing.validFrom && occurrenceDate < existing.validFrom) {
      throw validationError("occurrenceDate is before schedule validity");
    }
    if (existing.validUntil && occurrenceDate > existing.validUntil) {
      throw validationError("occurrenceDate is after schedule validity");
    }
    if (scope === "this_and_future" && existing.status !== "active") {
      throw validationError("Only the active series version can change this and future occurrences");
    }
    if (scope === "this_and_future" && occurrenceDate < today()) {
      throw validationError("this_and_future cannot start from a past occurrence");
    }

    const reason = requiredLimitedText(body.reason, "reason", 500);
    const patch = body.patch && typeof body.patch === "object" && !Array.isArray(body.patch) ? body.patch : body;
    if (body.patch !== undefined && (body.patch === null || typeof body.patch !== "object" || Array.isArray(body.patch))) {
      throw validationError("patch must be an object");
    }
    if (body.patch !== undefined) {
      const allowedPatchFields = new Set([
        "weekday", "startTime", "start_time", "endTime", "end_time", "teacherId", "teacher_id",
        "roomId", "room_id", "lessonLink", "lesson_link", "validUntil", "valid_until", "status",
      ]);
      const unknownField = Object.keys(patch).find((field) => !allowedPatchFields.has(field));
      if (unknownField) throw validationError(`patch.${unknownField} is not supported`);
    }
    const requestedStatus = patch.status === undefined ? existing.status : patch.status;
    if (scope === "this_occurrence" && requestedStatus !== existing.status) {
      throw validationError("Occurrence status is managed through the lesson cancel/restore workflow");
    }
    const candidate = this.groupSchedulePayload(
      context,
      group,
      {
        weekday: patch.weekday ?? existing.weekday,
        startTime: patch.startTime ?? patch.start_time ?? existing.startTime,
        endTime: patch.endTime ?? patch.end_time ?? existing.endTime,
        teacherId: patch.teacherId ?? patch.teacher_id ?? existing.teacherId,
        roomId: patch.roomId ?? patch.room_id ?? existing.roomId,
        lessonLink: scope === "this_occurrence"
          ? existing.lessonLink
          : patch.lessonLink ?? patch.lesson_link ?? existing.lessonLink,
        validFrom: existing.validFrom,
        validUntil: scope === "this_and_future"
          ? patch.validUntil ?? patch.valid_until ?? existing.validUntil
          : existing.validUntil,
        status: requestedStatus,
      },
      existing,
    );
    const occurrenceKey = isoWeekKey(occurrenceDate);
    const targetDate = dateForWeekday(occurrenceDate, candidate.weekday);
    let firstOccurrenceDate = targetDate;
    if (scope === "this_and_future" && firstOccurrenceDate < occurrenceDate) {
      firstOccurrenceDate = isoDate(addDays(parseDateOnly(firstOccurrenceDate), 7));
    }
    const room = candidate.roomId ? this.repository.room(context.tenantId, candidate.roomId) : null;
    const after = {
      date: scope === "this_occurrence" ? targetDate : firstOccurrenceDate,
      weekday: candidate.weekday,
      startTime: candidate.startTime,
      endTime: candidate.endTime,
      teacherId: candidate.teacherId,
      teacherName: this.repository.teacher(context.tenantId, candidate.teacherId)?.name || "",
      roomId: candidate.roomId,
      roomName: room?.name || group.room || "",
      lessonLink: candidate.lessonLink,
      validUntil: candidate.validUntil,
      status: candidate.status,
    };
    const before = {
      scheduleId: existing.id,
      seriesId: existing.seriesId,
      seriesVersion: existing.seriesVersion,
      date: occurrenceDate,
      weekday: existing.weekday,
      startTime: existing.startTime,
      endTime: existing.endTime,
      teacherId: existing.teacherId,
      teacherName: existing.teacherName,
      roomId: existing.roomId,
      roomName: existing.roomName || group.room || "",
      lessonLink: existing.lessonLink,
      validUntil: existing.validUntil,
      status: existing.status,
    };
    const changed =
      after.date !== occurrenceDate
      || after.startTime !== existing.startTime
      || after.endTime !== existing.endTime
      || after.teacherId !== existing.teacherId
      || after.roomId !== existing.roomId
      || (scope === "this_and_future" && (
        after.weekday !== existing.weekday
        || after.lessonLink !== existing.lessonLink
        || after.validUntil !== existing.validUntil
        || after.status !== existing.status
      ));
    if (!changed) throw validationError("Schedule change patch has no effect");

    const existingLesson = this.repository.lessonBySeriesOccurrence(
      context.tenantId,
      existing.seriesId,
      occurrenceKey,
    );
    if (scope === "this_occurrence" && existingLesson) {
      const error = new Error("This occurrence is already materialized; edit the lesson directly");
      error.status = 409;
      error.details = { lessonId: existingLesson.id, occurrenceKey };
      throw error;
    }
    if (scope === "this_occurrence") {
      this.assertNoLessonConflict(
        context,
        {
          groupId: group.id,
          date: after.date,
          startTime: after.startTime,
          endTime: after.endTime,
          teacherId: after.teacherId,
          roomId: after.roomId,
          roomName: after.roomName,
          occurrenceKey,
        },
        null,
        after.date === occurrenceDate ? existing.id : null,
      );
    } else if (candidate.status === "active") {
      this.assertNoGroupScheduleConflict(
        context,
        { ...candidate, validFrom: occurrenceDate, validUntil: existing.validUntil },
        existing.id,
      );
    }

    const materializedLessonsPreserved = scope === "this_and_future"
      ? this.repository.materializedSeriesCount(context.tenantId, existing.seriesId, occurrenceKey)
      : 0;
    const overrideMask =
      (after.date !== occurrenceDate ? 1 : 0) |
      (after.startTime !== existing.startTime || after.endTime !== existing.endTime ? 2 : 0) |
      (after.teacherId !== existing.teacherId ? 4 : 0) |
      (after.roomId !== existing.roomId ? 8 : 0);
    const normalized = {
      scheduleId: existing.id,
      seriesId: existing.seriesId,
      expectedScheduleVersion: existing.seriesVersion,
      scope,
      occurrenceDate,
      occurrenceKey,
      reason,
      after,
    };
    const key = idempotencyKey(body);
    if (requireIdempotency && !key) throw validationError("idempotencyKey is required");
    const plan = {
      ...normalized,
      operation: scope === "this_occurrence" ? "override_occurrence" : "version_series",
      requestFingerprint: scheduleChangeRequestFingerprint(existing.id, body),
      idempotencyKey: key,
      groupId: group.id,
      branchId: existing.branchId || group.branchId || "",
      lessonType: existing.lessonType || "group",
      actorUserId: context.userId,
      actorRole: context.role,
      before,
      overrideMask,
      previousValidUntil: isoDate(addDays(parseDateOnly(occurrenceDate), -1)),
      materializedLessonsPreserved,
    };
    return {
      plan,
      preview: {
        canApply: true,
        scheduleId: existing.id,
        seriesId: existing.seriesId,
        version: existing.seriesVersion,
        scope,
        occurrenceDate,
        occurrenceKey,
        before,
        after: candidate.status === "inactive" && scope === "this_and_future" ? null : after,
        impact: {
          createsOccurrenceException: scope === "this_occurrence",
          closesSeriesVersion: scope === "this_and_future",
          createsSeriesVersion: scope === "this_and_future" && candidate.status === "active",
          nextSeriesVersion: scope === "this_and_future" && candidate.status === "active"
            ? existing.seriesVersion + 1
            : null,
          firstOccurrenceDate: candidate.status === "active" ? firstOccurrenceDate : null,
          materializedLessonsPreserved,
        },
        warnings: materializedLessonsPreserved
          ? ["Existing materialized lessons are preserved as historical snapshots"]
          : [],
      },
    };
  }

  previewGroupScheduleChange(context, scheduleId, body) {
    return this.scheduleChangePlan(context, scheduleId, body, false).preview;
  }

  applyGroupScheduleChange(context, scheduleId, body) {
    const key = idempotencyKey(body);
    if (!key) throw validationError("idempotencyKey is required");
    const reusedRun = this.repository.scheduleChangeRunByKey(context.tenantId, key);
    if (reusedRun) {
      const operation = body.scope === "this_occurrence" ? "override_occurrence" : "version_series";
      const fingerprint = scheduleChangeRequestFingerprint(scheduleId, body);
      if (
        Number(reusedRun.schedule_id) !== Number(scheduleId)
        || reusedRun.operation !== operation
        || reusedRun.request_fingerprint !== fingerprint
      ) {
        const error = new Error("idempotencyKey was already used with a different schedule change");
        error.status = 409;
        throw error;
      }
      if (reusedRun.status !== "succeeded") {
        const error = new Error("Schedule change is already being processed");
        error.status = 409;
        throw error;
      }
      let saved = {};
      try {
        saved = JSON.parse(reusedRun.result_json || "{}");
      } catch (_error) {
        saved = {};
      }
      return { ...saved, reused: true };
    }
    const { plan, preview } = this.scheduleChangePlan(context, scheduleId, body, true);
    const result = this.repository.applyScheduleChange(context.tenantId, plan);
    this.repository.audit(
      context,
      plan.scope === "this_occurrence" ? "occurrence_overridden" : "series_versioned",
      "group_schedule",
      String(scheduleId),
    );
    return { ...result, preview };
  }

  createLesson(context, body) {
    const groupId = required(body.groupId, "groupId");
    const group = this.repository.group(context.tenantId, groupId);
    if (!group) {
      const error = new Error("Group not found");
      error.status = 404;
      throw error;
    }
    if ((group.status && group.status !== "active") || (!group.status && group.active === false)) {
      const error = new Error("Group is not active");
      error.status = 409;
      throw error;
    }
    if (Boolean(body.isRecurring ?? body.is_recurring)) {
      throw validationError("Recurring lessons must be created as a group schedule rule");
    }
    const date = normalizeLessonDate(body.date);
    if (group.startDate && date < group.startDate) throw validationError("date cannot be before group startDate");
    if (group.endDate && date > group.endDate) throw validationError("date cannot be after group endDate");

    const scheduleRaw = body.scheduleId ?? body.schedule_id;
    let schedule = null;
    if (scheduleRaw !== undefined && scheduleRaw !== null && scheduleRaw !== "") {
      const scheduleId = Number(scheduleRaw);
      if (!Number.isSafeInteger(scheduleId) || scheduleId <= 0) throw validationError("scheduleId is invalid");
      schedule = this.repository.groupSchedule(context.tenantId, scheduleId);
      if (!schedule) {
        const error = new Error("Group schedule not found");
        error.status = 404;
        throw error;
      }
      if (schedule.groupId !== groupId) throw validationError("scheduleId does not belong to groupId");
      const validHistoricalVersion = schedule.status === "active"
        || (schedule.status === "inactive" && schedule.validUntil && date <= schedule.validUntil);
      if (!validHistoricalVersion || !schedule.isRecurring) {
        throw validationError("scheduleId is not valid for this recurring occurrence");
      }
      if (Number(schedule.weekday) !== Number(isoWeekday(date))) throw validationError("date is not an occurrence of scheduleId");
      if (schedule.validFrom && date < schedule.validFrom) throw validationError("date is before schedule validity");
      if (schedule.validUntil && date > schedule.validUntil) throw validationError("date is after schedule validity");
    }

    const normalizedTime = schedule
      ? `${schedule.startTime} - ${schedule.endTime}`
      : normalizeLessonTime(body.time);
    const parsedTime = parseLessonTime(normalizedTime);
    const teacherId = required(
      schedule?.teacherId || body.teacherId || body.teacher_id || group.teacherId,
      "teacherId",
    );
    const teacher = this.repository.teacher(context.tenantId, teacherId);
    if (!teacher) {
      const error = new Error("Teacher not found");
      error.status = 404;
      throw error;
    }
    if (teacher.status !== "active") throw validationError("Teacher is inactive");

    const roomId = schedule?.roomId || textValue(body.roomId ?? body.room_id, "");
    const room = roomId ? this.repository.room(context.tenantId, roomId) : null;
    if (roomId && !room) throw validationError("roomId is invalid");
    const roomName = schedule?.roomName || room?.name || limitedText(body.roomName ?? body.room_name, "roomName", 120) || group.room || "";
    const payload = {
      groupId,
      scheduleId: schedule?.id || null,
      occurrenceDate: schedule ? date : null,
      scheduleSeriesId: schedule?.seriesId || null,
      occurrenceKey: schedule ? isoWeekKey(date) : null,
      overrideMask: 0,
      baseScheduleId: schedule?.id || null,
      baseScheduleVersion: schedule?.seriesVersion || null,
      teacherId,
      roomId,
      roomName,
      startTime: parsedTime.startTime,
      endTime: parsedTime.endTime,
      date,
      status: "planned",
      lessonType: body.lessonType || body.lesson_type
        ? enumValue(body.lessonType || body.lesson_type, ["group", "individual", "trial", "makeup"], "lessonType")
        : "group",
      isTrial: Boolean(body.isTrial || body.is_trial || body.lessonType === "trial" || body.lesson_type === "trial"),
      branchId: body.branchId || body.branch_id || group.branchId || "",
      topic: limitedText(body.topic, "topic", 500),
      homework: limitedText(body.homework, "homework", 2000),
      note: limitedText(body.note, "note", 2000),
      actorUserId: context.userId,
      actorRole: context.role,
    };
    this.assertNoLessonConflict(context, payload, null, schedule?.id || null);
    const row = this.repository.createLesson(context.tenantId, payload);
    this.repository.audit(context, "created", "lesson", row.id);
    return row;
  }

  materializeLesson(context, body) {
    const scheduleRaw = body.scheduleId ?? body.schedule_id;
    const scheduleId = Number(scheduleRaw);
    if (!Number.isSafeInteger(scheduleId) || scheduleId <= 0) throw validationError("scheduleId is required");
    const schedule = this.repository.groupSchedule(context.tenantId, scheduleId);
    if (!schedule) {
      const error = new Error("Group schedule not found");
      error.status = 404;
      throw error;
    }
    if (context.role === "teacher" && schedule.teacherId !== context.userId) {
      const error = new Error("Only the assigned teacher can open this scheduled lesson");
      error.status = 403;
      throw error;
    }
    if (!['admin', 'teacher'].includes(context.role)) {
      const error = new Error("Lesson access is required");
      error.status = 403;
      throw error;
    }
    return this.createLesson(context, {
      ...body,
      groupId: schedule.groupId,
      scheduleId: schedule.id,
      lessonType: schedule.lessonType || "group",
      isTrial: schedule.lessonType === "trial",
      isRecurring: false,
    });
  }

  getLesson(context, lessonId) {
    const profile = this.repository.lessonProfile(context.tenantId, required(lessonId, "lessonId"));
    if (!profile) {
      const error = new Error("Lesson not found");
      error.status = 404;
      throw error;
    }
    if (context.role === "teacher" && profile.lesson.teacherId !== context.userId) {
      const error = new Error("Only assigned teacher can view this lesson");
      error.status = 403;
      throw error;
    }
    return profile;
  }

  updateLesson(context, lessonId, body) {
    const existing = this.repository.lesson(context.tenantId, required(lessonId, "lessonId"));
    if (!existing) {
      const error = new Error("Lesson not found");
      error.status = 404;
      throw error;
    }
    if (existing.status === "completed") {
      const error = new Error("Completed lesson scheduling is immutable; use attendance correction or reversal workflow");
      error.status = 409;
      throw error;
    }
    if (existing.status === "cancelled") {
      const error = new Error("Cancelled lesson must be restored before editing");
      error.status = 409;
      throw error;
    }
    if (body.version !== undefined && Number(body.version) !== Number(existing.version)) {
      const error = new Error("Lesson was changed by another user; refresh and retry");
      error.status = 409;
      throw error;
    }

    const group = this.repository.group(context.tenantId, existing.groupId);
    const date = body.date === undefined ? existing.date : normalizeLessonDate(body.date);
    if (group.startDate && date < group.startDate) throw validationError("date cannot be before group startDate");
    if (group.endDate && date > group.endDate) throw validationError("date cannot be after group endDate");
    const normalizedTime = body.time === undefined
      ? `${existing.startTime} - ${existing.endTime}`
      : normalizeLessonTime(body.time);
    const parsedTime = parseLessonTime(normalizedTime);
    const teacherId = required(body.teacherId ?? body.teacher_id ?? existing.teacherId, "teacherId");
    const teacher = this.repository.teacher(context.tenantId, teacherId);
    if (!teacher) {
      const error = new Error("Teacher not found");
      error.status = 404;
      throw error;
    }
    if (teacher.status !== "active") throw validationError("Teacher is inactive");
    const roomId = body.roomId === undefined && body.room_id === undefined
      ? existing.roomId || ""
      : textValue(body.roomId ?? body.room_id, "");
    const room = roomId ? this.repository.room(context.tenantId, roomId) : null;
    if (roomId && !room) throw validationError("roomId is invalid");
    const roomName = room?.name || limitedText(body.roomName ?? body.room_name, "roomName", 120) || existing.room || group.room || "";
    const schedulingChanged =
      date !== existing.date ||
      parsedTime.startTime !== existing.startTime ||
      parsedTime.endTime !== existing.endTime ||
      teacherId !== existing.teacherId ||
      roomId !== (existing.roomId || "") ||
      roomName !== (existing.room || "");
    const reason = limitedText(body.reason ?? body.rescheduleReason ?? body.reschedule_reason, "reason", 500);
    if (schedulingChanged && !reason) throw validationError("reason is required when rescheduling a lesson");
    const payload = {
      date,
      startTime: parsedTime.startTime,
      endTime: parsedTime.endTime,
      groupId: existing.groupId,
      teacherId,
      roomId,
      roomName,
      topic: limitedText(body.topic, "topic", 500, existing.topic || ""),
      homework: limitedText(body.homework, "homework", 2000, existing.homework || ""),
      note: limitedText(body.note, "note", 2000, existing.note || ""),
      reason,
      schedulingChanged,
      overrideMask: existing.scheduleSeriesId
        ? (date !== existing.date ? 1 : 0)
          | (parsedTime.startTime !== existing.startTime || parsedTime.endTime !== existing.endTime ? 2 : 0)
          | (teacherId !== existing.teacherId ? 4 : 0)
          | (roomId !== (existing.roomId || "") ? 8 : 0)
        : 0,
      actorUserId: context.userId,
      actorRole: context.role,
    };
    const ownOccurrenceDate = existing.occurrenceDate || existing.date;
    const excludeScheduleId = existing.scheduleId && date === ownOccurrenceDate ? existing.scheduleId : null;
    this.assertNoLessonConflict(context, payload, existing.id, excludeScheduleId);
    const row = this.repository.updateLesson(context.tenantId, existing.id, payload);
    this.repository.audit(context, schedulingChanged ? "rescheduled" : "updated", "lesson", row.id);
    return row;
  }

  cancelLesson(context, lessonId, body) {
    const existing = this.repository.lesson(context.tenantId, required(lessonId, "lessonId"));
    if (!existing) {
      const error = new Error("Lesson not found");
      error.status = 404;
      throw error;
    }
    if (existing.status === "completed") {
      const error = new Error("Completed lesson cannot be cancelled; use a controlled reversal workflow");
      error.status = 409;
      throw error;
    }
    if (existing.status === "cancelled") return existing;
    const reason = requiredLimitedText(body.reason, "reason", 500);
    const row = this.repository.cancelLesson(context.tenantId, existing.id, {
      reason,
      actorUserId: context.userId,
      actorRole: context.role,
    });
    this.repository.audit(context, "cancelled", "lesson", row.id);
    return row;
  }

  restoreLesson(context, lessonId, body = {}) {
    const existing = this.repository.lesson(context.tenantId, required(lessonId, "lessonId"));
    if (!existing) {
      const error = new Error("Lesson not found");
      error.status = 404;
      throw error;
    }
    if (existing.status !== "cancelled") {
      const error = new Error("Only a cancelled lesson can be restored");
      error.status = 409;
      throw error;
    }
    const payload = {
      groupId: existing.groupId,
      date: existing.date,
      startTime: existing.startTime,
      endTime: existing.endTime,
      teacherId: existing.teacherId,
      roomId: existing.roomId || "",
      roomName: existing.room || "",
    };
    const ownOccurrenceDate = existing.occurrenceDate || existing.date;
    const excludeScheduleId = existing.scheduleId && existing.date === ownOccurrenceDate ? existing.scheduleId : null;
    this.assertNoLessonConflict(context, payload, existing.id, excludeScheduleId);
    const row = this.repository.restoreLesson(context.tenantId, existing.id, {
      reason: limitedText(body.reason, "reason", 500),
      actorUserId: context.userId,
      actorRole: context.role,
    });
    this.repository.audit(context, "restored", "lesson", row.id);
    return row;
  }

  reopenCompletedLesson(context, lessonId, body) {
    const existing = this.repository.lesson(context.tenantId, required(lessonId, "lessonId"));
    if (!existing) {
      const error = new Error("Lesson not found");
      error.status = 404;
      throw error;
    }
    if (existing.status !== "completed") {
      const error = new Error("Only a completed lesson can be reopened");
      error.status = 409;
      throw error;
    }
    if (existing.financialStatus === "posted" || this.repository.activeLessonSettlement(context.tenantId, existing.id)) {
      const error = new Error("Reverse the active financial settlement before reopening the lesson");
      error.status = 409;
      throw error;
    }
    const reason = requiredLimitedText(body.reason, "reason", 500);
    this.assertFinancialDateOpen(context, existing.date, existing.branchId || "");
    const row = this.repository.reopenCompletedLesson(context.tenantId, existing.id, {
      reason,
      actorUserId: context.userId,
      actorRole: context.role,
    });
    this.repository.audit(context, "reopened", "lesson_completion", existing.id);
    return row;
  }

  weeklySchedule(context, date) {
    let range;
    try {
      range = weekRange(normalizeLessonDate(date));
    } catch (_error) {
      const error = new Error("date is invalid");
      error.status = 422;
      throw error;
    }
    const teacherId = context.role === "teacher" ? context.userId : null;
    return this.repository.weeklySchedule(
      context.tenantId,
      range.startDate,
      range.endDate,
      teacherId,
      isoWeekKey(range.startDate),
    );
  }

  saveAttendance(context, body) {
    const lessonId = required(body.lessonId, "lessonId");
    const lesson = this.repository.lesson(context.tenantId, lessonId);
    if (!lesson) {
      const error = new Error("Lesson not found");
      error.status = 404;
      throw error;
    }
    if (context.role === "teacher" && lesson.teacherId !== context.userId) {
      const error = new Error("Only assigned teacher can save attendance");
      error.status = 403;
      throw error;
    }
    if (lesson.status === "cancelled") {
      const error = new Error("Cancelled lesson cannot be completed");
      error.status = 409;
      throw error;
    }
    if (lesson.date > today()) {
      const error = new Error("Future lesson cannot be completed");
      error.status = 409;
      throw error;
    }
    const students =
      typeof this.repository.studentsForLesson === "function"
        ? this.repository.studentsForLesson(context.tenantId, lessonId)
        : this.repository.studentsByGroup(context.tenantId, lesson.groupId);
    const allowedStudentIds = new Set(students.map((student) => student.id));
    if (!Array.isArray(body.records)) throw validationError("records must be an array");
    const currentRecords = this.repository.attendanceForLesson(context.tenantId, lessonId);
    const currentRecordsByStudent = new Map(currentRecords.map((record) => [record.studentId, record]));
    const reasons = this.repository.attendanceReasons(context.tenantId, false);
    const reasonsById = new Map(reasons.map((reason) => [reason.id, reason]));
    const defaultReasonCode = {
      present: "present",
      absent: "absent_unexcused",
      late: "late",
      excused: "excused",
    };
    const records = body.records.map((record) => ({
      studentId: required(record.studentId, "studentId"),
      status: enumValue(record.status, ["present", "absent", "late", "excused"], "status"),
      reasonId: textValue(record.reasonId || record.reason_id),
      note: limitedText(record.note, "note", 500),
    })).map((record) => {
      const reason = record.reasonId
        ? reasonsById.get(record.reasonId)
        : reasons.find((candidate) => candidate.code === defaultReasonCode[record.status]);
      const currentRecord = currentRecordsByStudent.get(record.studentId);
      const preservesHistoricalReason = lesson.status === "completed"
        && currentRecord?.reasonId === reason?.id
        && currentRecord?.status === record.status;
      if (!reason || (!reason.isActive && !preservesHistoricalReason)) throw validationError("attendance reason is invalid or inactive");
      if (reason.attendanceStatus !== record.status) throw validationError("attendance reason does not match status");
      return {
        ...record,
        reasonId: reason.id,
        reasonCode: preservesHistoricalReason ? currentRecord.reasonCode : reason.code,
        reasonName: preservesHistoricalReason ? currentRecord.reasonName : reason.name,
        chargePercent: preservesHistoricalReason ? currentRecord.chargePercent : reason.chargePercent,
        consumePercent: preservesHistoricalReason ? currentRecord.consumePercent : reason.consumePercent,
      };
    });

    const submittedIds = new Set(records.map((record) => record.studentId));
    if (submittedIds.size !== records.length) throw validationError("records contains duplicate studentId values");
    if (!allowedStudentIds.size) {
      const error = new Error("Lesson roster is empty; cancel the lesson or add participants before completion");
      error.status = 409;
      throw error;
    }
    if (submittedIds.size !== allowedStudentIds.size || [...allowedStudentIds].some((studentId) => !submittedIds.has(studentId))) {
      throw validationError("records must contain every student in the lesson roster exactly once");
    }

    records.forEach((record) => {
      if (!allowedStudentIds.has(record.studentId)) {
        const error = new Error("Student does not belong to this lesson group");
        error.status = 422;
        throw error;
      }
    });

    const correctionReason = limitedText(body.correctionReason ?? body.correction_reason, "correctionReason", 500);
    const lessonDetails = {
      topic: limitedText(body.topic, "topic", 500, lesson.topic || ""),
      homework: limitedText(body.homework, "homework", 2000, lesson.homework || ""),
      note: limitedText(body.lessonNote ?? body.lesson_note, "lessonNote", 2000, lesson.note || ""),
    };
    const normalizedCurrent = currentRecords
      .map((record) => ({ studentId: record.studentId, status: record.status, reasonId: record.reasonId, note: record.note || "" }))
      .sort((left, right) => left.studentId.localeCompare(right.studentId));
    const normalizedNext = records
      .map((record) => ({ studentId: record.studentId, status: record.status, reasonId: record.reasonId, note: record.note || "" }))
      .sort((left, right) => left.studentId.localeCompare(right.studentId));
    const attendanceUnchanged = JSON.stringify(normalizedCurrent) === JSON.stringify(normalizedNext);
    const lessonDetailsUnchanged = lessonDetails.topic === (lesson.topic || "")
      && lessonDetails.homework === (lesson.homework || "")
      && lessonDetails.note === (lesson.note || "");
    const unchanged = attendanceUnchanged && lessonDetailsUnchanged;
    if (lesson.status === "completed" && unchanged) {
      return { ok: true, reused: true, lesson, dashboard: this.bootstrap(context).dashboard };
    }
    if (lesson.status === "completed") {
      if (context.role !== "admin") {
        const error = new Error("Only an admin can correct completed attendance");
        error.status = 403;
        throw error;
      }
      if (!correctionReason) throw validationError("correctionReason is required for completed attendance");
      if (lesson.financialStatus === "posted") {
        const error = new Error("Reverse the active financial settlement before correcting attendance");
        error.status = 409;
        throw error;
      }
    }
    const closedPeriod = this.repository.closedFinancePeriod(context.tenantId, lesson.branchId || "", lesson.date);
    if (closedPeriod) {
      const error = new Error(`Finance period is closed: ${closedPeriod.label}`);
      error.status = 409;
      throw error;
    }

    const updatedLesson = this.repository.replaceAttendance(context.tenantId, lessonId, records, {
      actorUserId: context.userId,
      actorRole: context.role,
      reason: correctionReason,
      ...lessonDetails,
    });
    this.repository.audit(context, lesson.status === "completed" ? "corrected" : "completed", "attendance", lessonId);
    return { ok: true, lesson: updatedLesson, dashboard: this.bootstrap(context).dashboard };
  }

  lessonFinancialPreview(context, lessonId) {
    const lesson = this.repository.lesson(context.tenantId, required(lessonId, "lessonId"));
    if (!lesson) {
      const error = new Error("Lesson not found");
      error.status = 404;
      throw error;
    }
    if (lesson.status !== "completed") {
      const error = new Error("Only a completed lesson can be financially reviewed");
      error.status = 409;
      throw error;
    }
    return this.repository.lessonFinancialPreview(context.tenantId, lesson.id);
  }

  confirmLessonFinance(context, lessonId, body) {
    const idempotency = idempotencyKey(body);
    if (!idempotency) throw validationError("idempotencyKey is required");
    const lesson = this.repository.lesson(context.tenantId, required(lessonId, "lessonId"));
    if (!lesson) {
      const error = new Error("Lesson not found");
      error.status = 404;
      throw error;
    }
    const attendanceVersion = Number(body.attendanceVersion ?? body.attendance_version ?? lesson.attendanceVersion);
    const lessonVersion = Number(body.lessonVersion ?? body.lesson_version ?? lesson.version);
    if (!Number.isSafeInteger(attendanceVersion) || attendanceVersion < 1) throw validationError("attendanceVersion is invalid");
    if (!Number.isSafeInteger(lessonVersion) || lessonVersion < 1) throw validationError("lessonVersion is invalid");
    const fingerprint = requestFingerprint({ lessonId: lesson.id, attendanceVersion, lessonVersion });
    const existingRun = this.repository.financialRunByKey(context.tenantId, idempotency);
    if (existingRun) {
      if (existingRun.lessonId !== lesson.id || existingRun.requestFingerprint !== fingerprint || existingRun.operation !== "confirm") {
        const error = new Error("idempotencyKey was already used with a different request");
        error.status = 409;
        throw error;
      }
      return this.repository.lessonFinanceResult(context.tenantId, lesson.id, true);
    }
    if (lesson.status !== "completed" || lesson.financialStatus !== "pending") {
      const error = new Error("Lesson is not pending financial confirmation");
      error.status = 409;
      throw error;
    }
    if (lesson.attendanceVersion !== attendanceVersion || lesson.version !== lessonVersion) {
      const error = new Error("Lesson or attendance changed; refresh the preview and retry");
      error.status = 409;
      throw error;
    }
    const closedPeriod = this.repository.closedFinancePeriod(context.tenantId, lesson.branchId || "", lesson.date);
    if (closedPeriod) {
      const error = new Error(`Finance period is closed: ${closedPeriod.label}`);
      error.status = 409;
      throw error;
    }
    const result = this.repository.confirmLessonFinance(context.tenantId, lesson.id, {
      attendanceVersion,
      lessonVersion,
      idempotencyKey: idempotency,
      requestFingerprint: fingerprint,
      actorUserId: context.userId,
      actorRole: context.role,
    });
    this.repository.audit(context, "confirmed", "lesson_finance", lesson.id);
    return result;
  }

  reverseLessonFinance(context, lessonId, body) {
    const idempotency = idempotencyKey(body);
    if (!idempotency) throw validationError("idempotencyKey is required");
    const reason = requiredLimitedText(body.reason, "reason", 500);
    const lesson = this.repository.lesson(context.tenantId, required(lessonId, "lessonId"));
    if (!lesson) {
      const error = new Error("Lesson not found");
      error.status = 404;
      throw error;
    }
    const settlement = this.repository.activeLessonSettlement(context.tenantId, lesson.id)
      || this.repository.latestLessonSettlement(context.tenantId, lesson.id);
    const settlementVersion = Number(body.settlementVersion ?? body.settlement_version ?? settlement?.version);
    if (!settlement || !Number.isSafeInteger(settlementVersion) || settlementVersion < 1) {
      const error = new Error("Active financial settlement not found");
      error.status = 409;
      throw error;
    }
    const fingerprint = requestFingerprint({ lessonId: lesson.id, settlementId: settlement.id, settlementVersion, reason });
    const existingRun = this.repository.financialRunByKey(context.tenantId, idempotency);
    if (existingRun) {
      if (existingRun.lessonId !== lesson.id || existingRun.requestFingerprint !== fingerprint || existingRun.operation !== "reverse") {
        const error = new Error("idempotencyKey was already used with a different request");
        error.status = 409;
        throw error;
      }
      return this.repository.lessonFinanceResult(context.tenantId, lesson.id, true);
    }
    if (settlement.status !== "confirmed") {
      const error = new Error("Active financial settlement not found");
      error.status = 409;
      throw error;
    }
    if (settlement.version !== settlementVersion) {
      const error = new Error("Settlement changed; refresh and retry");
      error.status = 409;
      throw error;
    }
    const postingDate = today();
    const closedPeriod = this.repository.closedFinancePeriod(context.tenantId, lesson.branchId || "", postingDate);
    if (closedPeriod) {
      const error = new Error(`Current posting period is closed: ${closedPeriod.label}`);
      error.status = 409;
      throw error;
    }
    const result = this.repository.reverseLessonFinance(context.tenantId, lesson.id, {
      settlementId: settlement.id,
      settlementVersion,
      reason,
      postingDate,
      idempotencyKey: idempotency,
      requestFingerprint: fingerprint,
      actorUserId: context.userId,
      actorRole: context.role,
    });
    this.repository.audit(context, "reversed", "lesson_finance", lesson.id);
    return result;
  }

  sendAttendanceAlerts(context, lessonId) {
    const teacherId = context.role === "teacher" ? context.userId : null;
    const result = this.repository.sendAttendanceAlerts(context.tenantId, required(lessonId, "lessonId"), teacherId);
    this.repository.audit(context, "queued", "attendance_alerts", lessonId);
    return result;
  }

  createPayment(context, body) {
    const studentId = required(body.studentId, "studentId");
    const student = this.repository.student(context.tenantId, studentId);
    if (!student) {
      const error = new Error("Student not found");
      error.status = 404;
      throw error;
    }
    const financeRefs = this.validateFinanceReferences(context, body);
    this.assertFinancialDateOpen(context, today(), financeRefs.branchId);
    const row = this.repository.createPayment(context.tenantId, student, {
      amount: positiveAmount(body.amount),
      type: enumValue(body.type || "cash", ["cash", "card", "transfer"], "type"),
      idempotencyKey: idempotencyKey(body),
      ...financeRefs,
    });
    if (!row.reused) {
      this.repository.createMessage(context.tenantId, {
        channel: "telegram",
        studentId: student.id,
        to: student.name,
        text: `To'lov qabul qilindi: ${row.amount.toLocaleString("ru-RU")} so'm.`,
      });
      this.repository.audit(context, "created", "payment", row.id);
    }
    return row;
  }

  updatePayment(context, paymentId, body) {
    const existing = this.repository.payment(context.tenantId, required(paymentId, "paymentId"));
    if (!existing) {
      const error = new Error("Payment not found");
      error.status = 404;
      throw error;
    }
    const studentId = required(body.studentId, "studentId");
    const student = this.repository.student(context.tenantId, studentId);
    if (!student) {
      const error = new Error("Student not found");
      error.status = 404;
      throw error;
    }
    const existingLedger = this.repository.paymentLedgerTransaction(context.tenantId, existing);
    this.assertFinancialDateOpen(context, existingLedger?.invoiceDate || today(), existing.branchId || "");
    const row = this.repository.updatePayment(context.tenantId, existing.id, student, {
      amount: positiveAmount(body.amount),
      type: enumValue(body.type || existing.type || "cash", ["cash", "card", "transfer"], "type"),
    });
    this.repository.audit(context, "updated", "payment", existing.id);
    return row;
  }

  deletePayment(context, paymentId) {
    const existing = this.repository.payment(context.tenantId, required(paymentId, "paymentId"));
    if (!existing) {
      const error = new Error("Payment not found");
      error.status = 404;
      throw error;
    }
    const existingLedger = this.repository.paymentLedgerTransaction(context.tenantId, existing);
    this.assertFinancialDateOpen(context, existingLedger?.invoiceDate || today(), existing.branchId || "");
    const row = this.repository.deletePayment(context.tenantId, existing.id, context.userId, "Payment voided by user");
    this.repository.audit(context, "voided", "payment", existing.id);
    return row;
  }

  getStudentBalance(context, studentId) {
    const student = this.repository.student(context.tenantId, required(studentId, "studentId"));
    if (!student) {
      const error = new Error("Student not found");
      error.status = 404;
      throw error;
    }
    return this.repository.getStudentBalance(context.tenantId, student.id);
  }

  getStudentLedger(context, studentId) {
    const student = this.repository.student(context.tenantId, required(studentId, "studentId"));
    if (!student) {
      const error = new Error("Student not found");
      error.status = 404;
      throw error;
    }
    const balance = this.repository.getStudentBalance(context.tenantId, student.id);
    return {
      student: {
        ...student,
        balance,
        debt: balance < 0 ? Math.round(Math.abs(balance)) : 0,
      },
      balance,
      ledger: this.repository.getStudentLedger(context.tenantId, student.id),
    };
  }

  addTransaction(context, studentId, body) {
    const student = this.repository.student(context.tenantId, required(studentId, "studentId"));
    if (!student) {
      const error = new Error("Student not found");
      error.status = 404;
      throw error;
    }
    const type = enumValue(body.type || "payment", ["payment", "charge", "discount", "refund", "correction"], "type");
    const method = enumValue(body.method || "cash", ["cash", "card", "transfer", "click", "payme", "bank"], "method");
    const invoiceDate = normalizeDateField(body.invoiceDate || body.invoice_date, "invoiceDate", today());
    const financeRefs = this.validateFinanceReferences(context, body);
    this.assertFinancialDateOpen(context, invoiceDate, financeRefs.branchId);
    const result = this.repository.addTransaction(context.tenantId, student, {
      type,
      method,
      amount: positiveAmount(body.amount),
      description: body.description || (type === "payment" ? "Naqd to'lov" : "Xarajat"),
      invoiceDate,
      idempotencyKey: idempotencyKey(body),
      ...financeRefs,
    });
    if (!result.transaction.reused) this.repository.audit(context, "created", "transaction", String(result.transaction.id));
    return {
      ...result,
      student: {
        ...student,
        balance: result.balance,
        debt: result.balance < 0 ? Math.round(Math.abs(result.balance)) : 0,
      },
      ledger: this.repository.getStudentLedger(context.tenantId, student.id),
    };
  }

  createMessage(context, body) {
    const studentId = body.student_id || body.studentId || "";
    const student = studentId ? this.repository.student(context.tenantId, studentId) : null;
    if (studentId && !student) {
      const error = new Error("Student not found");
      error.status = 404;
      throw error;
    }
    const row = this.repository.createMessage(context.tenantId, {
      channel: "telegram",
      studentId: student?.id || "",
      to: student ? body.to || student.name : required(body.to, "to"),
      text: required(body.text, "text"),
    });
    this.repository.audit(context, "queued", "message", row.id);
    return row;
  }

  async updateTelegramSettings(context, body) {
    const telegramBotToken = required(body.telegramBotToken, "telegramBotToken");
    if (!/^\d+:[A-Za-z0-9_-]{20,}$/.test(telegramBotToken)) {
      const error = new Error("Telegram bot token format is invalid");
      error.status = 422;
      throw error;
    }
    let identity;
    if (process.env.DONO_TELEGRAM_SKIP_REMOTE_VALIDATION === "true" && process.env.NODE_ENV === "test") {
      identity = { username: String(body.telegramBot || "test_bot").replace(/^@/, "") };
    } else {
      try {
        identity = await getMe(telegramBotToken);
      } catch (error) {
        const invalid = new Error(error.message || "Telegram bot token is invalid");
        invalid.status = 422;
        throw invalid;
      }
    }
    const tenant = this.repository.updateTelegramSettings(context.tenantId, {
      telegramBot: `@${identity.username}`,
      telegramBotToken,
    });
    this.repository.audit(context, "updated", "telegram_settings", context.tenantId);
    return tenant;
  }

  async processMessages(context) {
    const result = await this.repository.processMessages(context.tenantId);
    this.repository.audit(context, "processed", "message_queue", "telegram");
    return result;
  }

  retryFailedMessages(context) {
    const retried = this.repository.retryFailedMessages(context.tenantId);
    this.repository.audit(context, "retried", "message_queue", "telegram");
    return { retried };
  }

  createStudentTelegramLink(context, studentId) {
    const student = this.repository.student(context.tenantId, required(studentId, "studentId"));
    if (!student) {
      const error = new Error("Student not found");
      error.status = 404;
      throw error;
    }
    const tenant = this.repository.tenant(context.tenantId);
    if (!tenant?.telegramBotTokenSet || !tenant.telegramBot) {
      const error = new Error("Telegram bot is not configured");
      error.status = 422;
      throw error;
    }
    const link = this.repository.createStudentTelegramLink(context.tenantId, student.id, context.userId);
    this.repository.audit(context, "created", "student_telegram_link", student.id);
    return link;
  }

  async testTelegram(context, body) {
    return this.repository.sendTelegramTestMessage(context.tenantId, required(body.chat_id, "chat_id"));
  }

  updateStudentChatId(context, studentId, body) {
    const student = this.repository.student(context.tenantId, required(studentId, "studentId"));
    if (!student) {
      const error = new Error("Student not found");
      error.status = 404;
      throw error;
    }
    const updated = this.repository.updateStudentChatId(context.tenantId, student.id, String(body.chat_id || "").trim());
    this.repository.audit(context, "updated", "student_telegram_chat_id", student.id);
    return updated;
  }

  listLeads(context) {
    return this.repository.leads(context.tenantId);
  }

  listPipelineStages(context) {
    return this.repository.pipelineStages(context.tenantId);
  }

  requirePipelineStage(context, stageId) {
    const stage = this.repository.pipelineStage(context.tenantId, required(stageId, "stage"));
    if (!stage) {
      const error = new Error("stage is invalid");
      error.status = 422;
      throw error;
    }
    return stage;
  }

  createLead(context, body) {
    const status = enumValue(body.status || "new", ["new", "contacted", "converted"], "status");
    const stage = body.stage ? required(body.stage, "stage") : stageForLegacyStatus(status);
    this.requirePipelineStage(context, stage);
    const row = this.repository.createLead(context.tenantId, {
      name: required(body.name, "name"),
      phone: body.phone || "",
      source: body.source || "Manual",
      status: body.stage ? statusForLeadStage(stage) : status,
      stage,
      responsibleAdmin: body.responsibleAdmin || "",
      nextAction: body.nextAction || "",
      note: body.note || "",
    });
    this.repository.audit(context, "created", "lead", row.id);
    return row;
  }

  updateLeadStage(context, leadId, body) {
    const stage = this.requirePipelineStage(context, body.stage).id;
    const lead = this.repository.updateLeadStage(context.tenantId, required(leadId, "leadId"), stage);
    if (!lead) {
      const error = new Error("Lead not found");
      error.status = 404;
      throw error;
    }
    this.repository.audit(context, "updated", "lead_stage", lead.id);
    return lead;
  }

  convertLeadToStudent(context, leadId, body) {
    const lead = this.repository.lead(context.tenantId, required(leadId, "leadId"));
    if (!lead) {
      const error = new Error("Lead not found");
      error.status = 404;
      throw error;
    }
    const result = this.repository.convertLeadToStudent(context.tenantId, lead.id, {
      groupId: required(body.groupId || body.group_id, "groupId"),
      name: body.name || lead.name,
      phone: body.phone || lead.phone || "",
      parentName: body.parentName || body.parent_name || "",
      parentRelationship: body.parentRelationship || body.parent_relationship || "guardian",
      parentEmail: optionalEmail(body.parentEmail || body.parent_email || "", "parentEmail"),
      studentPhone: textValue(body.studentPhone ?? body.student_phone),
      email: optionalEmail(body.email || "", "email"),
      birthDate: optionalDateField(body.birthDate ?? body.birth_date, "birthDate"),
      gender: body.gender ? enumValue(textValue(body.gender), ["male", "female", "other"], "gender") : "",
      address: textValue(body.address),
      source: textValue(body.source, lead.source || "Lead"),
      enrollmentDate: optionalDateField(body.enrollmentDate ?? body.enrollment_date, "enrollmentDate", today()),
      note: textValue(body.note, lead.note || ""),
      telegramChatId: textValue(body.telegramChatId ?? body.telegram_chat_id),
      debt: Math.max(0, Number(body.debt || 0)),
      branchId: body.branchId || body.branch_id || "",
      actorUserId: context.userId,
    });
    this.repository.audit(context, "converted", "lead", lead.id);
    this.repository.audit(context, "created", "student", result.student.id);
    return result;
  }

  createPipelineStage(context, body) {
    const row = this.repository.createPipelineStage(context.tenantId, {
      name: required(body.name, "name"),
    });
    this.repository.audit(context, "created", "pipeline_stage", row.id);
    return row;
  }

  updatePipelineStage(context, stageId, body) {
    const existing = this.repository.pipelineStage(context.tenantId, required(stageId, "stageId"));
    if (!existing) {
      const error = new Error("Pipeline stage not found");
      error.status = 404;
      throw error;
    }
    const row = this.repository.updatePipelineStage(context.tenantId, existing.id, {
      name: required(body.name, "name"),
    });
    this.repository.audit(context, "updated", "pipeline_stage", row.id);
    return row;
  }

  deletePipelineStage(context, stageId) {
    const existing = this.repository.pipelineStage(context.tenantId, required(stageId, "stageId"));
    if (!existing) {
      const error = new Error("Pipeline stage not found");
      error.status = 404;
      throw error;
    }
    const deleted = this.repository.deletePipelineStage(context.tenantId, existing.id);
    this.repository.audit(context, "deleted", "pipeline_stage", existing.id);
    return { deleted: deleted.id, movedTo: "new" };
  }

  importStudents(context, body) {
    const students = String(body.csv || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [name, phone, parentName, groupId, debt] = line.split(",").map((item) => item?.trim());
        return { name, phone, parentName, groupId, debt: Number(debt || 0), parentRelationship: "guardian", actorUserId: context.userId };
      })
      .filter((student) => student.name && student.groupId);

    const groupIds = new Set(this.repository.groups(context.tenantId).map((group) => group.id));
    const unknownGroup = students.find((student) => !groupIds.has(student.groupId));
    if (unknownGroup) {
      const error = new Error(`CSV contains unknown groupId: ${unknownGroup.groupId}`);
      error.status = 422;
      throw error;
    }

    const imported = this.repository.importStudents(context.tenantId, students);
    this.repository.audit(context, "imported", "students", String(imported));
    return { imported };
  }
}

module.exports = { AppService };
