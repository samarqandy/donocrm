"use strict";

const { DOMAIN_PORTS } = require("../domain/ports");

function port(id, name, dependency, methods) {
  return Object.freeze({ id, name, dependency, methods: Object.freeze([...methods]) });
}

const APPLICATION_PORTS = Object.freeze([
  port("WF-PORT-OWN-03", "TeacherDirectoryBaseQueryV1", "teacherDirectoryQuery", ["listTenantBase"]),
  port("WF-PORT-OWN-04", "TeacherProfileBaseQueryV1", "teacherProfileQuery", ["getBaseProfile"]),
  port("WF-PORT-OWN-05", "TeacherReferenceQueryV1", "teacherReferenceQuery", ["getReference"]),
  port("WF-PORT-PROV-01", "TeacherPortalLifecycleCommandPortV1", "portalLifecycle", [
    "provision", "applyChange", "disable",
  ]),
  port("WF-PORT-PROV-02", "TeacherCredentialResetCommandPortV1", "credentialReset", [
    "resetAndInvalidateSessions",
  ]),
  port("WF-PORT-PROV-03", "TeacherPortalAccessProjectionPortV1", "portalProjection", [
    "getByTeacherIds",
  ]),
  port("WF-PORT-PROV-04", "BranchReferenceResolverPortV1", "branchResolver", ["resolveActive"]),
  port("WF-PORT-PROV-05", "ActiveGroupArchiveBlockerPortV1", "groupArchiveBlocker", ["decide"]),
  port("WF-PORT-PROV-06", "TeacherGroupProjectionPortV1", "groupProjection", [
    "getCountsByTeacherIds", "listBaseByTeacherId",
  ]),
  port("WF-PORT-PROV-07", "TeacherScheduleProjectionPortV1", "scheduleProjection", [
    "getWorkloadByTeacherIds", "getGroupSummaries",
  ]),
  port("WF-PORT-PROV-08", "UpcomingLessonArchiveBlockerPortV1", "lessonArchiveBlocker", ["decide"]),
  port("WF-PORT-PROV-09", "TeacherLessonProjectionPortV1", "lessonProjection", [
    "getCompletedCountsByTeacherIds", "listUpcomingByTeacherId", "getGroupMetrics",
  ]),
  port("WF-PORT-PROV-10", "TeacherStudentCountProjectionPortV1", "studentCountProjection", [
    "getByTeacherIds", "getByGroupIds",
  ]),
  port("WF-PORT-PROV-11", "WorkforceAuditAppenderPortV1", "auditAppender", ["append"]),
  port("WF-PORT-SYS-01", "WorkforceClockPortV1", "clock", ["now"]),
  port("WF-PORT-SYS-02", "WorkforceIdGeneratorPortV1", "idGenerator", ["nextId"]),
]);

const FOCUSED_PORTS = Object.freeze([...DOMAIN_PORTS, ...APPLICATION_PORTS]);

const DOMAIN_DEPENDENCIES = Object.freeze({
  "WF-PORT-OWN-01": "teacherRepository",
  "WF-PORT-OWN-02": "workingHourRepository",
});

function assertFocusedPorts(dependencies) {
  for (const contract of FOCUSED_PORTS) {
    const dependency = contract.dependency || DOMAIN_DEPENDENCIES[contract.id];
    const implementation = dependencies?.[dependency];
    if (!implementation) throw new TypeError(`${contract.name} dependency is required`);
    for (const method of contract.methods) {
      if (typeof implementation[method] !== "function") {
        throw new TypeError(`${contract.name}.${method} must be a function`);
      }
    }
  }
  return dependencies;
}

module.exports = { APPLICATION_PORTS, FOCUSED_PORTS, assertFocusedPorts };
