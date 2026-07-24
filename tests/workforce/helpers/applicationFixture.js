"use strict";

const { WorkforceApplication } = require("../../../src/modules/workforce/application/WorkforceApplication");

const FIXED_CLOCK = "2026-07-24T06:00:00.000Z";

function teacher(overrides = {}) {
  return {
    id: "teacher_wf_a",
    tenantId: "tenant_wf_a",
    branchId: "branch_wf_a_main",
    name: "Alpha Teacher",
    phone: "+998900000001",
    email: "alpha@example.test",
    specialization: "Mathematics",
    employmentType: "full_time",
    status: "active",
    hiredAt: "2026-01-01",
    maxWeeklyMinutes: 2400,
    note: "",
    createdAt: FIXED_CLOCK,
    ...overrides,
  };
}

function actor(overrides = {}) {
  return {
    tenantId: "tenant_wf_a",
    actorUserId: "admin_wf_a",
    role: "admin",
    permissions: ["lessons.manage"],
    correlationId: "corr-wf-0001",
    ...overrides,
  };
}

function fixture(overrides = {}) {
  const calls = [];
  const teachers = new Map([
    ["teacher_wf_a", teacher()],
    ["teacher_wf_a_inactive", teacher({
      id: "teacher_wf_a_inactive",
      name: "Zulu Inactive",
      status: "inactive",
      branchId: null,
    })],
  ]);
  const hours = new Map([
    ["hour_wf_a", {
      id: "hour_wf_a",
      tenantId: "tenant_wf_a",
      branchId: "branch_wf_a_main",
      teacherId: "teacher_wf_a",
      weekday: "1",
      startTime: "09:00",
      endTime: "12:00",
      createdAt: FIXED_CLOCK,
    }],
  ]);
  const access = new Map([
    ["teacher_wf_a", {
      teacherId: "teacher_wf_a",
      hasAccess: true,
      username: "alpha.teacher",
      accessStatus: "active",
    }],
    ["teacher_wf_a_inactive", {
      teacherId: "teacher_wf_a_inactive",
      hasAccess: false,
      username: "",
      accessStatus: "not_granted",
    }],
  ]);
  let idSequence = 0;
  const log = (name, args) => calls.push({ name, args });
  const orderedTeachers = () => [...teachers.values()].sort((left, right) => {
    if (left.status !== right.status) return left.status === "active" ? -1 : 1;
    return left.name.localeCompare(right.name);
  });
  const deps = {
    teacherRepository: {
      async findById(_context, teacherId) {
        log("teacherRepository.findById", [teacherId]);
        return teachers.get(teacherId) || null;
      },
      async insert(_context, record) {
        log("teacherRepository.insert", [record]);
        teachers.set(record.id, { ...record });
        return teachers.get(record.id);
      },
      async replaceProfile(_context, replacement) {
        log("teacherRepository.replaceProfile", [replacement]);
        const current = teachers.get(replacement.teacherId);
        if (!current) return null;
        const updated = { ...current, ...replacement, id: current.id };
        delete updated.teacherId;
        teachers.set(current.id, updated);
        return updated;
      },
      async setStatus(_context, change) {
        log("teacherRepository.setStatus", [change]);
        const current = teachers.get(change.teacherId);
        if (!current) return null;
        const updated = { ...current, status: change.status };
        teachers.set(current.id, updated);
        return updated;
      },
    },
    workingHourRepository: {
      async list(_context, filter) {
        log("workingHourRepository.list", [filter]);
        return [...hours.values()].filter((item) => !filter.teacherId || item.teacherId === filter.teacherId);
      },
      async findById(_context, id) {
        log("workingHourRepository.findById", [id]);
        return hours.get(id) || null;
      },
      async findOverlap(_context, query) {
        log("workingHourRepository.findOverlap", [query]);
        return [...hours.values()].find((item) =>
          item.teacherId === query.teacherId &&
          item.weekday === query.weekday &&
          item.startTime < query.endTime &&
          item.endTime > query.startTime)?.id || null;
      },
      async insert(_context, record) {
        log("workingHourRepository.insert", [record]);
        hours.set(record.id, { ...record });
        return hours.get(record.id);
      },
      async deleteById(_context, id) {
        log("workingHourRepository.deleteById", [id]);
        const current = hours.get(id) || null;
        hours.delete(id);
        return current;
      },
    },
    teacherDirectoryQuery: {
      async listTenantBase() {
        log("teacherDirectoryQuery.listTenantBase", []);
        return orderedTeachers();
      },
    },
    teacherProfileQuery: {
      async getBaseProfile(_context, id) {
        log("teacherProfileQuery.getBaseProfile", [id]);
        return teachers.get(id) || null;
      },
    },
    teacherReferenceQuery: {
      async getReference(_context, id) {
        log("teacherReferenceQuery.getReference", [id]);
        const item = teachers.get(id);
        return item ? {
          tenantId: item.tenantId,
          teacherId: item.id,
          displayName: item.name,
          status: item.status,
          branchId: item.branchId,
        } : null;
      },
    },
    portalLifecycle: {
      async provision(_context, intent) {
        log("portalLifecycle.provision", [intent]);
        const row = { teacherId: intent.teacherId, hasAccess: true, username: intent.username, accessStatus: "active" };
        access.set(intent.teacherId, row);
        return row;
      },
      async applyChange(_context, intent) {
        log("portalLifecycle.applyChange", [intent]);
        const current = access.get(intent.teacherId) || {
          teacherId: intent.teacherId, hasAccess: false, username: "", accessStatus: "not_granted",
        };
        const enabled = intent.enabled ?? current.hasAccess;
        const row = {
          teacherId: intent.teacherId,
          hasAccess: enabled,
          username: intent.username ?? current.username,
          accessStatus: enabled ? "active" : "inactive",
        };
        access.set(intent.teacherId, row);
        return row;
      },
      async disable(_context, intent) {
        log("portalLifecycle.disable", [intent]);
        const current = access.get(intent.teacherId);
        const row = { ...current, hasAccess: false, accessStatus: "inactive" };
        access.set(intent.teacherId, row);
        return row;
      },
    },
    credentialReset: {
      async resetAndInvalidateSessions(_context, intent) {
        log("credentialReset.resetAndInvalidateSessions", [intent]);
        return { success: true };
      },
    },
    portalProjection: {
      async getByTeacherIds(_context, input) {
        log("portalProjection.getByTeacherIds", [input]);
        return input.teacherIds.map((id) => access.get(id) || {
          teacherId: id, hasAccess: false, username: "", accessStatus: "not_granted",
        });
      },
    },
    branchResolver: {
      async resolveActive(_context, request) {
        log("branchResolver.resolveActive", [request]);
        if (request.requestedBranchId === "branch_wf_b_main") {
          const error = new Error("branchId is invalid");
          error.code = "BRANCH_REFERENCE_INVALID";
          throw error;
        }
        return {
          branchId: request.requestedBranchId || (request.useMainWhenOmitted ? "branch_wf_a_main" : null),
          resolution: request.requestedBranchId ? "explicit" : request.useMainWhenOmitted ? "main" : "none",
        };
      },
    },
    groupArchiveBlocker: {
      async decide(_context, teacherId) {
        log("groupArchiveBlocker.decide", [teacherId]);
        return { teacherId, blocked: false };
      },
    },
    groupProjection: {
      async getCountsByTeacherIds(_context, input) {
        log("groupProjection.getCountsByTeacherIds", [input]);
        return input.teacherIds.map((teacherId) => ({ teacherId, groupsCount: teacherId === "teacher_wf_a" ? 1 : 0 }));
      },
      async listBaseByTeacherId(_context, teacherId) {
        log("groupProjection.listBaseByTeacherId", [teacherId]);
        if (teacherId !== "teacher_wf_a") return [];
        return [{
          id: "group_wf_a",
          tenantId: "tenant_wf_a",
          branchId: "branch_wf_a_main",
          name: "Alpha Group",
          subject: "Math",
          description: "",
          level: "",
          teacherId,
          teacherName: "Alpha Teacher",
          room: "A1",
          monthlyFee: 500000,
          capacity: 10,
          startDate: "2026-01-01",
          endDate: "",
          status: "active",
          color: "",
          note: "",
          archivedAt: "",
          archiveReason: "",
          createdAt: FIXED_CLOCK,
          updatedAt: "",
          active: true,
        }];
      },
    },
    scheduleProjection: {
      async getWorkloadByTeacherIds(_context, input) {
        log("scheduleProjection.getWorkloadByTeacherIds", [input]);
        return input.teacherIds.map((teacherId) => ({ teacherId, weeklyMinutes: teacherId === "teacher_wf_a" ? 600 : 0 }));
      },
      async getGroupSummaries(_context, input) {
        log("scheduleProjection.getGroupSummaries", [input]);
        return input.groupIds.map((groupId) => ({ groupId, schedulesCount: 2, scheduleSummary: "Mon 09:00" }));
      },
    },
    lessonArchiveBlocker: {
      async decide(_context, teacherId) {
        log("lessonArchiveBlocker.decide", [teacherId]);
        return { teacherId, blocked: false };
      },
    },
    lessonProjection: {
      async getCompletedCountsByTeacherIds(_context, input) {
        log("lessonProjection.getCompletedCountsByTeacherIds", [input]);
        return input.teacherIds.map((teacherId) => ({ teacherId, completedLessons: teacherId === "teacher_wf_a" ? 4 : 0 }));
      },
      async listUpcomingByTeacherId(_context, teacherId) {
        log("lessonProjection.listUpcomingByTeacherId", [teacherId]);
        return [{ id: "lesson_wf_a", tenantId: "tenant_wf_a", teacherId, date: "2026-07-25", time: "09:00 - 10:00" }];
      },
      async getGroupMetrics(_context, input) {
        log("lessonProjection.getGroupMetrics", [input]);
        return input.groupIds.map((groupId) => ({
          groupId,
          totalLessons: 5,
          plannedLessons: 1,
          completedLessons: 4,
          cancelledLessons: 0,
          nextLessonDate: "2026-07-25",
        }));
      },
    },
    studentCountProjection: {
      async getByTeacherIds(_context, input) {
        log("studentCountProjection.getByTeacherIds", [input]);
        return input.teacherIds.map((teacherId) => ({ teacherId, studentsCount: teacherId === "teacher_wf_a" ? 8 : 0 }));
      },
      async getByGroupIds(_context, input) {
        log("studentCountProjection.getByGroupIds", [input]);
        return input.groupIds.map((groupId) => ({ groupId, studentsCount: 8 }));
      },
    },
    auditAppender: {
      async append(_context, intent) {
        log("auditAppender.append", [intent]);
        return { success: true };
      },
    },
    clock: { now: () => FIXED_CLOCK },
    idGenerator: {
      nextId(kind) {
        idSequence += 1;
        return `wf-test-${kind}-${String(idSequence).padStart(4, "0")}`;
      },
    },
  };

  for (const [name, implementation] of Object.entries(overrides)) deps[name] = implementation;
  return {
    access,
    app: new WorkforceApplication(deps),
    calls,
    deps,
    hours,
    teachers,
  };
}

module.exports = { FIXED_CLOCK, actor, fixture, teacher };
