"use strict";

const CONTROLS = Object.freeze({
  timezone: "Asia/Tashkent",
  fixedClock: "2026-07-24T06:00:00.000Z",
  idSequencePrefix: "wf-test-",
  tenantIds: Object.freeze(["tenant_wf_a", "tenant_wf_b"]),
  database: "isolated-in-memory-sqlite",
  randomness: "forbidden",
  network: "forbidden",
});

const ACTORS = Object.freeze({
  adminA: Object.freeze({ tenantId: "tenant_wf_a", userId: "admin_wf_a", role: "admin" }),
  teacherA: Object.freeze({ tenantId: "tenant_wf_a", userId: "teacher_wf_a", role: "teacher" }),
  adminB: Object.freeze({ tenantId: "tenant_wf_b", userId: "admin_wf_b", role: "admin" }),
  teacherB: Object.freeze({ tenantId: "tenant_wf_b", userId: "teacher_wf_b", role: "teacher" }),
});

const HTTP_OPERATIONS = Object.freeze([
  Object.freeze({ operationId: "WF-HTTP-01", method: "GET", path: "/api/teachers" }),
  Object.freeze({ operationId: "WF-HTTP-02", method: "GET", path: "/api/teachers/{teacherId}" }),
  Object.freeze({ operationId: "WF-HTTP-03", method: "POST", path: "/api/teachers" }),
  Object.freeze({ operationId: "WF-HTTP-04", method: "PUT", path: "/api/teachers/{teacherId}" }),
  Object.freeze({ operationId: "WF-HTTP-05", method: "DELETE", path: "/api/teachers/{teacherId}" }),
  Object.freeze({ operationId: "WF-HTTP-06", method: "POST", path: "/api/teachers/{teacherId}/restore" }),
  Object.freeze({ operationId: "WF-HTTP-07", method: "POST", path: "/api/teachers/{teacherId}/reset-password" }),
  Object.freeze({ operationId: "WF-HTTP-08", method: "GET", path: "/api/teacher-working-hours" }),
  Object.freeze({ operationId: "WF-HTTP-09", method: "POST", path: "/api/teacher-working-hours" }),
  Object.freeze({ operationId: "WF-HTTP-10", method: "DELETE", path: "/api/teacher-working-hours/{workingHourId}" }),
]);

const NORMALIZATION_MAP = Object.freeze({
  generatedId: /^wf-test-\d{4}$/,
  generatedTimestamp: CONTROLS.fixedClock,
  preserveExactly: Object.freeze([
    "tenantId", "status", "role", "authorization", "ordering", "businessFields",
    "semanticError", "privacy", "auditIntent", "sideEffects",
  ]),
});

class ScriptedProvider {
  constructor(script) {
    this.script = script.map((step) => Object.freeze({ ...step }));
    this.calls = [];
  }

  async invoke(operation, input) {
    const step = this.script.shift();
    if (!step) throw new Error(`Unexpected provider call: ${operation}`);
    this.calls.push(Object.freeze({ sequence: this.calls.length + 1, operation, input }));
    if (step.operation !== operation) {
      throw new Error(`Provider order mismatch: expected ${step.operation}, received ${operation}`);
    }
    if (step.outcome === "success") return step.value;
    const error = new Error(step.message);
    error.code = step.code;
    error.dispatchState = step.dispatchState;
    throw error;
  }

  assertConsumed() {
    if (this.script.length !== 0) throw new Error(`${this.script.length} provider outcomes were not consumed`);
  }
}

const FIXTURES = Object.freeze([
  Object.freeze({
    id: "WF-FIX-01",
    name: "Two-tenant actor and Branch fixture",
    actors: ACTORS,
    branches: Object.freeze([
      Object.freeze({ id: "branch_wf_a_main", tenantId: "tenant_wf_a", status: "active", isMain: true }),
      Object.freeze({ id: "branch_wf_a_inactive", tenantId: "tenant_wf_a", status: "inactive", isMain: false }),
      Object.freeze({ id: "branch_wf_b_main", tenantId: "tenant_wf_b", status: "active", isMain: true }),
    ]),
  }),
  Object.freeze({
    id: "WF-FIX-02",
    name: "Teacher lifecycle and Identity fixture",
    teachers: Object.freeze([
      Object.freeze({ key: "activeWithAccess", tenantId: "tenant_wf_a", status: "active", access: "active" }),
      Object.freeze({ key: "activeWithoutAccess", tenantId: "tenant_wf_a", status: "active", access: "none" }),
      Object.freeze({ key: "inactiveWithDisabledAccess", tenantId: "tenant_wf_a", status: "inactive", access: "inactive" }),
    ]),
    duplicateUsername: "teacher.a@fixture.test",
    sessionIds: Object.freeze(["session_wf_a_1", "session_wf_a_2"]),
  }),
  Object.freeze({
    id: "WF-FIX-03",
    name: "Profile provider projection fixture",
    requestedTeacherIds: Object.freeze(["teacher_wf_a", "teacher_wf_a_zero"]),
    completeZeroRow: Object.freeze({
      teacherId: "teacher_wf_a_zero",
      groupsCount: 0,
      studentsCount: 0,
      weeklyMinutes: 0,
      completedLessons: 0,
      upcomingLessons: Object.freeze([]),
    }),
  }),
  Object.freeze({
    id: "WF-FIX-04",
    name: "Working Hour boundary and concurrency fixture",
    intervals: Object.freeze([
      Object.freeze({ weekday: "1", startTime: "09:00", endTime: "12:00", outcome: "accepted" }),
      Object.freeze({ weekday: "1", startTime: "12:00", endTime: "13:00", outcome: "accepted_adjacent" }),
      Object.freeze({ weekday: "1", startTime: "11:59", endTime: "13:00", outcome: "overlap" }),
      Object.freeze({ weekday: "7", startTime: "00:00", endTime: "23:59", outcome: "accepted_boundary" }),
    ]),
    concurrency: Object.freeze({ mechanism: "explicit-barrier", sleepsAllowed: false, winners: 1 }),
  }),
  Object.freeze({
    id: "WF-FIX-05",
    name: "Provider fault and outcome fixture",
    outcomes: Object.freeze([
      "success",
      "semantic_failure",
      "unavailable_before_dispatch",
      "timeout_after_dispatch",
      "commit_then_acknowledgement_failure",
    ]),
  }),
  Object.freeze({
    id: "WF-FIX-06",
    name: "Legacy-target parity dataset",
    sides: Object.freeze(["legacy", "target"]),
    governedDeltas: Object.freeze(["WF-TARGET-DELTA-01", "WF-TARGET-DELTA-02"]),
    normalizationMap: NORMALIZATION_MAP,
  }),
  Object.freeze({
    id: "WF-FIX-07",
    name: "HTTP compatibility fixture",
    operations: HTTP_OPERATIONS,
    actorModes: Object.freeze(["admin", "teacher", "no_session"]),
    bodyModes: Object.freeze(["valid", "invalid", "oversized"]),
    dispatchHooks: Object.freeze(["legacy", "target_shadow"]),
  }),
  Object.freeze({
    id: "WF-FIX-08",
    name: "Rollback and reconciliation fixture",
    states: Object.freeze([
      "legacy_authority",
      "known_commit",
      "unknown_outcome",
      "audit_intent_missing",
      "audit_intent_existing",
      "clean_rollback_checkpoint",
    ]),
    terminalInvariant: Object.freeze({
      authority: "legacy",
      targetWriteRoutes: 0,
      unresolvedIncidents: 0,
    }),
  }),
]);

module.exports = {
  ACTORS,
  CONTROLS,
  FIXTURES,
  HTTP_OPERATIONS,
  NORMALIZATION_MAP,
  ScriptedProvider,
};
