"use strict";

const { Teacher } = require("../domain/Teacher");
const { TeacherWorkingHour } = require("../domain/TeacherWorkingHour");
const { WorkforceError, fail } = require("../domain/WorkforceError");
const { deepFreeze, err, ok } = require("./Result");
const {
  actorContext,
  persistenceContext,
  portContext,
  requireAdmin,
  requirePermission,
  serviceContext,
} = require("./context");
const { assertFocusedPorts } = require("./ports");

const USERNAME_PATTERN = /^[A-Za-z0-9._@+-]{3,80}$/;
const PROVIDER_ERROR_MAP = Object.freeze({
  IDENTITY_USERNAME_CONFLICT: "USERNAME_CONFLICT",
  IDENTITY_PORTAL_NOT_CONFIGURED: "PORTAL_ACCESS_NOT_CONFIGURED",
  BRANCH_REFERENCE_INVALID: "BRANCH_INVALID",
  PROVIDER_UNAVAILABLE: "WORKFORCE_UNAVAILABLE",
  PROVIDER_FAILURE: "WORKFORCE_FAILURE",
  AUDIT_APPEND_FAILED: "WORKFORCE_FAILURE",
  OWNED_RECORD_CONFLICT: "WORKFORCE_FAILURE",
});

function requireIdentifier(value, code, message) {
  const normalized = String(value || "").trim();
  if (!normalized) fail(code, message);
  return normalized;
}

function portalProvision(value) {
  if (value === null) return null;
  const username = String(value?.username || "").trim();
  const password = String(value?.password || "");
  if (!USERNAME_PATTERN.test(username)) fail("USERNAME_INVALID", "username is invalid");
  if (password.length < 8) fail("PASSWORD_TOO_SHORT", "password must contain at least 8 characters");
  return Object.freeze({ username, password });
}

function portalChange(value, currentStatus) {
  if (value === null) return null;
  const change = { ...value };
  if (change.enabled === true && currentStatus === "inactive") {
    fail("RESTORE_BEFORE_ACCESS", "Restore teacher before enabling portal access");
  }
  if (change.username !== undefined) {
    change.username = String(change.username || "").trim();
    if (!USERNAME_PATTERN.test(change.username)) fail("USERNAME_INVALID", "username is invalid");
  }
  if (change.newPassword !== undefined && String(change.newPassword).length < 8) {
    fail("PASSWORD_TOO_SHORT", "password must contain at least 8 characters");
  }
  return Object.freeze(change);
}

function indexComplete(rows, ids, key, source) {
  const map = new Map((rows || []).map((row) => [row[key], row]));
  for (const id of ids) {
    if (!map.has(id)) fail("WORKFORCE_FAILURE", `${source} omitted keyed projection ${id}`);
  }
  return map;
}

function teacherAdminView(base, access, groups, workload, lessons, students) {
  const maxWeeklyMinutes = Number(base.maxWeeklyMinutes);
  const weeklyMinutes = Number(workload.weeklyMinutes);
  return {
    ...base,
    branchId: base.branchId || "",
    hiredAt: base.hiredAt || "",
    weeklyMinutes,
    workloadPercent: maxWeeklyMinutes > 0 ? Math.round((weeklyMinutes / maxWeeklyMinutes) * 100) : 0,
    groupsCount: Number(groups.groupsCount),
    studentsCount: Number(students.studentsCount),
    completedLessons: Number(lessons.completedLessons),
    hasAccess: Boolean(access.hasAccess),
    username: access.username || "",
    accessStatus: access.accessStatus || "not_granted",
  };
}

function selfTeacherView(view) {
  const { username, accessStatus, ...safe } = view;
  return safe;
}

function workingHourView(hour, teacherName) {
  return {
    ...hour,
    branchId: hour.branchId || "",
    teacherName,
  };
}

function groupView(group, schedule, lessons, students, self) {
  const capacity = Number(group.capacity || 0);
  const studentsCount = Number(students.studentsCount);
  const composed = {
    ...group,
    branchId: group.branchId || "",
    monthlyFee: Number(group.monthlyFee || 0),
    capacity,
    studentsCount,
    occupancyPercent: capacity > 0 ? Math.round((studentsCount / capacity) * 100) : 0,
    schedulesCount: Number(schedule.schedulesCount),
    scheduleSummary: schedule.scheduleSummary || "",
    totalLessons: Number(lessons.totalLessons),
    plannedLessons: Number(lessons.plannedLessons),
    completedLessons: Number(lessons.completedLessons),
    cancelledLessons: Number(lessons.cancelledLessons),
    attendanceRate: 0,
    nextLessonDate: lessons.nextLessonDate || "",
  };
  if (!self) return composed;
  const { monthlyFee, ...safe } = composed;
  return safe;
}

class WorkforceApplication {
  constructor(dependencies) {
    assertFocusedPorts(dependencies);
    Object.assign(this, dependencies);
    Object.freeze(this);
  }

  async _run(work) {
    try {
      return ok(await work());
    } catch (cause) {
      if (cause instanceof WorkforceError) return err(cause);
      const mapped = PROVIDER_ERROR_MAP[cause?.code];
      if (mapped) {
        return err(new WorkforceError(mapped, cause.message || mapped, { cause }));
      }
      return err(new WorkforceError("WORKFORCE_FAILURE", "Workforce operation failed", { cause }));
    }
  }

  async _projections(callContext, teacherIds) {
    const input = Object.freeze({ teacherIds: Object.freeze([...teacherIds]) });
    const access = indexComplete(
      await this.portalProjection.getByTeacherIds(callContext, input),
      teacherIds,
      "teacherId",
      "Identity",
    );
    const groups = indexComplete(
      await this.groupProjection.getCountsByTeacherIds(callContext, input),
      teacherIds,
      "teacherId",
      "Academic Groups",
    );
    const workload = indexComplete(
      await this.scheduleProjection.getWorkloadByTeacherIds(callContext, input),
      teacherIds,
      "teacherId",
      "Scheduling",
    );
    const lessons = indexComplete(
      await this.lessonProjection.getCompletedCountsByTeacherIds(callContext, input),
      teacherIds,
      "teacherId",
      "Lesson Delivery",
    );
    const students = indexComplete(
      await this.studentCountProjection.getByTeacherIds(callContext, input),
      teacherIds,
      "teacherId",
      "Student Information",
    );
    return { access, groups, workload, lessons, students };
  }

  async _composeTeachers(context, bases, self = false) {
    if (!bases.length) return [];
    const ids = bases.map((teacher) => teacher.id);
    const projections = await this._projections(portContext(context), ids);
    return bases.map((base) => {
      const view = teacherAdminView(
        base,
        projections.access.get(base.id),
        projections.groups.get(base.id),
        projections.workload.get(base.id),
        projections.lessons.get(base.id),
        projections.students.get(base.id),
      );
      return self ? selfTeacherView(view) : view;
    });
  }

  async _audit(context, action, entityType, entityId) {
    await this.auditAppender.append(portContext(context), Object.freeze({
      actorUserId: context.actorUserId,
      action,
      entityType,
      entityId,
      correlationId: context.correlationId,
    }));
  }

  listTeachers(rawContext, _input = {}) {
    return this._run(async () => {
      const context = actorContext(rawContext);
      const bases = await this.teacherDirectoryQuery.listTenantBase(persistenceContext(context));
      const selected = context.role === "teacher"
        ? bases.filter((teacher) => teacher.id === context.actorUserId)
        : bases;
      return deepFreeze({ teachers: await this._composeTeachers(context, selected, context.role === "teacher") });
    });
  }

  getTeacherProfile(rawContext, input) {
    return this._run(async () => {
      const context = actorContext(rawContext);
      const teacherId = requireIdentifier(input?.teacherId, "TEACHER_NOT_FOUND", "Teacher not found");
      if (context.role === "teacher" && teacherId !== context.actorUserId) {
        fail("OWN_PROFILE_ONLY", "Only own teacher profile is available");
      }
      const persistence = persistenceContext(context);
      const base = await this.teacherProfileQuery.getBaseProfile(persistence, teacherId);
      if (!base) fail("TEACHER_NOT_FOUND", "Teacher not found");
      const self = context.role === "teacher";
      const [teacher] = await this._composeTeachers(context, [base], self);
      const call = portContext(context);
      const groups = await this.groupProjection.listBaseByTeacherId(call, teacherId);
      const groupIds = groups.map((group) => group.id);
      const hours = await this.workingHourRepository.list(persistence, { teacherId });
      const groupInput = Object.freeze({ groupIds: Object.freeze([...groupIds]) });
      const scheduleRows = await this.scheduleProjection.getGroupSummaries(call, groupInput);
      const lessonRows = await this.lessonProjection.getGroupMetrics(call, groupInput);
      const studentRows = await this.studentCountProjection.getByGroupIds(call, groupInput);
      const schedules = indexComplete(scheduleRows, groupIds, "groupId", "Scheduling");
      const lessons = indexComplete(lessonRows, groupIds, "groupId", "Lesson Delivery");
      const students = indexComplete(studentRows, groupIds, "groupId", "Student Information");
      const upcomingLessons = await this.lessonProjection.listUpcomingByTeacherId(call, teacherId);
      return deepFreeze({
        teacher,
        groups: groups.map((group) =>
          groupView(group, schedules.get(group.id), lessons.get(group.id), students.get(group.id), self)),
        workingHours: hours.map((hour) => workingHourView(hour, base.name)),
        upcomingLessons: upcomingLessons.slice(0, 20),
      });
    });
  }

  createTeacher(rawContext, command) {
    return this._run(async () => {
      const context = actorContext(rawContext);
      requireAdmin(context);
      const access = portalProvision(command?.portalAccess ?? null);
      const call = portContext(context);
      const branch = await this.branchResolver.resolveActive(call, {
        requestedBranchId: command?.profile?.branchId || null,
        useMainWhenOmitted: true,
      });
      const teacher = Teacher.create({
        id: this.idGenerator.nextId("teacher"),
        tenantId: context.tenantId,
        profile: { ...command?.profile, branchId: branch.branchId },
        createdAt: this.clock.now(),
      });
      const inserted = await this.teacherRepository.insert(persistenceContext(context), teacher.toSnapshot());
      if (access) {
        await this.portalLifecycle.provision(call, {
          teacherId: inserted.id,
          displayName: inserted.name,
          username: access.username,
          password: access.password,
          branchId: inserted.branchId,
        });
      }
      await this._audit(context, "created", "teacher", inserted.id);
      return deepFreeze((await this._composeTeachers(context, [inserted]))[0]);
    });
  }

  updateTeacher(rawContext, command) {
    return this._run(async () => {
      const context = actorContext(rawContext);
      requireAdmin(context);
      const teacherId = requireIdentifier(command?.teacherId, "TEACHER_NOT_FOUND", "Teacher not found");
      const persistence = persistenceContext(context);
      const existing = await this.teacherRepository.findById(persistence, teacherId);
      if (!existing) fail("TEACHER_NOT_FOUND", "Teacher not found");
      const accessChange = portalChange(command?.portalAccessChange ?? null, existing.status);
      let branchId = existing.branchId;
      if (command?.profile?.branchId !== undefined) {
        const branch = await this.branchResolver.resolveActive(portContext(context), {
          requestedBranchId: command.profile.branchId,
          useMainWhenOmitted: false,
        });
        branchId = branch.branchId || existing.branchId;
      }
      const replacement = Teacher.replaceProfile(existing, { ...command?.profile, branchId }).toSnapshot();
      const updated = await this.teacherRepository.replaceProfile(persistence, {
        teacherId,
        branchId: replacement.branchId,
        name: replacement.name,
        phone: replacement.phone,
        email: replacement.email,
        specialization: replacement.specialization,
        employmentType: replacement.employmentType,
        hiredAt: replacement.hiredAt,
        maxWeeklyMinutes: replacement.maxWeeklyMinutes,
        note: replacement.note,
      });
      if (!updated) fail("TEACHER_NOT_FOUND", "Teacher not found");
      if (accessChange) {
        await this.portalLifecycle.applyChange(portContext(context), {
          teacherId,
          displayName: updated.name,
          ...accessChange,
          branchId: updated.branchId,
        });
      }
      await this._audit(context, "updated", "teacher", teacherId);
      return deepFreeze((await this._composeTeachers(context, [updated]))[0]);
    });
  }

  archiveTeacher(rawContext, input) {
    return this._run(async () => {
      const context = actorContext(rawContext);
      requireAdmin(context);
      const teacherId = requireIdentifier(input?.teacherId, "TEACHER_NOT_FOUND", "Teacher not found");
      const persistence = persistenceContext(context);
      const existing = await this.teacherRepository.findById(persistence, teacherId);
      if (!existing) fail("TEACHER_NOT_FOUND", "Teacher not found");
      const call = portContext(context);
      const groupDecision = await this.groupArchiveBlocker.decide(call, teacherId);
      const lessonDecision = await this.lessonArchiveBlocker.decide(call, teacherId);
      if (groupDecision.blocked || lessonDecision.blocked) {
        fail("ARCHIVE_BLOCKED", "Teacher has active groups or upcoming lessons; reassign them before archiving");
      }
      const accessRows = await this.portalProjection.getByTeacherIds(call, { teacherIds: [teacherId] });
      const access = indexComplete(accessRows, [teacherId], "teacherId", "Identity").get(teacherId);
      const archived = await this.teacherRepository.setStatus(persistence, { teacherId, status: "inactive" });
      if (!archived) fail("TEACHER_NOT_FOUND", "Teacher not found");
      if (access.hasAccess) await this.portalLifecycle.disable(call, { teacherId });
      await this._audit(context, "archived", "teacher", teacherId);
      return deepFreeze((await this._composeTeachers(context, [archived]))[0]);
    });
  }

  restoreTeacher(rawContext, input) {
    return this._run(async () => {
      const context = actorContext(rawContext);
      requireAdmin(context);
      const teacherId = requireIdentifier(input?.teacherId, "TEACHER_NOT_FOUND", "Teacher not found");
      const restored = await this.teacherRepository.setStatus(
        persistenceContext(context),
        { teacherId, status: "active" },
      );
      if (!restored) fail("TEACHER_NOT_FOUND", "Teacher not found");
      await this._audit(context, "restored", "teacher", teacherId);
      return deepFreeze((await this._composeTeachers(context, [restored]))[0]);
    });
  }

  resetTeacherPassword(rawContext, command) {
    return this._run(async () => {
      const context = actorContext(rawContext);
      requireAdmin(context);
      const teacherId = requireIdentifier(command?.teacherId, "TEACHER_NOT_FOUND", "Teacher not found");
      const password = String(command?.newPassword || "");
      if (!password) fail("NEW_PASSWORD_REQUIRED", "newPassword is required");
      if (password.length < 8) fail("PASSWORD_TOO_SHORT", "password must contain at least 8 characters");
      const reference = await this.teacherReferenceQuery.getReference(persistenceContext(context), teacherId);
      if (!reference) fail("TEACHER_NOT_FOUND", "Teacher not found");
      await this.credentialReset.resetAndInvalidateSessions(portContext(context), {
        teacherId,
        newPassword: password,
      });
      await this._audit(context, "reset_password", "teacher", teacherId);
      return deepFreeze({ success: true });
    });
  }

  listTeacherWorkingHours(rawContext, _input = {}) {
    return this._run(async () => {
      const context = actorContext(rawContext);
      const persistence = persistenceContext(context);
      const teacherId = context.role === "teacher" ? context.actorUserId : null;
      const hours = await this.workingHourRepository.list(persistence, { teacherId });
      const ids = [...new Set(hours.map((hour) => hour.teacherId))];
      const teachers = await this.teacherDirectoryQuery.listTenantBase(persistence);
      const names = new Map(teachers.filter((teacher) => ids.includes(teacher.id)).map((teacher) => [teacher.id, teacher.name]));
      if (ids.some((id) => !names.has(id))) fail("WORKFORCE_FAILURE", "Teacher name projection is incomplete");
      return deepFreeze({ workingHours: hours.map((hour) => workingHourView(hour, names.get(hour.teacherId))) });
    });
  }

  createTeacherWorkingHour(rawContext, command) {
    return this._run(async () => {
      const context = actorContext(rawContext);
      requirePermission(context, "lessons.manage");
      const teacherId = requireIdentifier(command?.teacherId, "TEACHER_ID_REQUIRED", "teacherId is required");
      const persistence = persistenceContext(context);
      const reference = await this.teacherReferenceQuery.getReference(persistence, teacherId);
      if (!reference) fail("TEACHER_NOT_FOUND", "Teacher not found");
      if (reference.status !== "active") fail("TEACHER_INACTIVE", "Teacher is inactive");
      const branch = await this.branchResolver.resolveActive(portContext(context), {
        requestedBranchId: command?.branchId || null,
        useMainWhenOmitted: true,
      });
      const hour = TeacherWorkingHour.create({
        id: this.idGenerator.nextId("teacher_working_hour"),
        tenantId: context.tenantId,
        teacherId,
        weekday: command?.weekday,
        startTime: command?.startTime,
        endTime: command?.endTime,
        branchId: branch.branchId,
        createdAt: this.clock.now(),
      });
      const overlap = await this.workingHourRepository.findOverlap(persistence, hour.toSnapshot());
      if (overlap) fail("WORKING_HOUR_OVERLAP", "Working hours overlap with an existing interval");
      const inserted = await this.workingHourRepository.insert(persistence, hour.toSnapshot());
      await this._audit(context, "created", "teacher_working_hour", inserted.id);
      return deepFreeze(workingHourView(inserted, reference.displayName));
    });
  }

  deleteTeacherWorkingHour(rawContext, input) {
    return this._run(async () => {
      const context = actorContext(rawContext);
      requireAdmin(context);
      const workingHourId = requireIdentifier(
        input?.workingHourId,
        "WORKING_HOUR_NOT_FOUND",
        "Working hour not found",
      );
      const deleted = await this.workingHourRepository.deleteById(
        persistenceContext(context),
        workingHourId,
      );
      if (!deleted) fail("WORKING_HOUR_NOT_FOUND", "Working hour not found");
      await this._audit(context, "deleted", "teacher_working_hour", workingHourId);
      return deepFreeze(workingHourView(deleted, ""));
    });
  }

  getTeacherReference(rawContext, input) {
    return this._run(async () => {
      const context = serviceContext(rawContext);
      const teacherId = requireIdentifier(input?.teacherId, "TEACHER_NOT_FOUND", "Teacher not found");
      const reference = await this.teacherReferenceQuery.getReference(
        persistenceContext(context),
        teacherId,
      );
      if (!reference) fail("TEACHER_NOT_FOUND", "Teacher not found");
      return deepFreeze({
        tenantId: reference.tenantId,
        teacherId: reference.teacherId,
        displayName: reference.displayName,
        status: reference.status,
        branchId: reference.branchId || null,
      });
    });
  }
}

module.exports = {
  WorkforceApplication,
  PROVIDER_ERROR_MAP,
  USERNAME_PATTERN,
};
