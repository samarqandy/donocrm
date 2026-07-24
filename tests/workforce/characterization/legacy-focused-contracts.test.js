"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { DatabaseSync } = require("node:sqlite");

const { schema } = require("../../../src/db/schema");
const {
  ACTORS,
  CONTROLS,
  FIXTURES,
  HTTP_OPERATIONS,
  NORMALIZATION_MAP,
  ScriptedProvider,
} = require("../fixtures/focused-contract-fixtures");

let nextId = 0;
const idModule = require("../../../src/utils/id");
const timeModule = require("../../../src/utils/time");
const passwordModule = require("../../../src/utils/password");
idModule.id = () => `${CONTROLS.idSequencePrefix}${String(++nextId).padStart(4, "0")}`;
timeModule.now = () => CONTROLS.fixedClock;
timeModule.today = () => "2026-07-24";
passwordModule.hashPassword = async () => "pbkdf2_sha256$fixture$deterministic";
delete require.cache[require.resolve("../../../src/repositories/appRepository")];
delete require.cache[require.resolve("../../../src/services/appService")];
const { AppRepository } = require("../../../src/repositories/appRepository");
const { AppService } = require("../../../src/services/appService");

function seedDatabase() {
  const db = new DatabaseSync(":memory:");
  db.exec(schema);
  const insertTenant = db.prepare(
    "INSERT INTO tenants (id, name, type, status, plan, language, created_at) VALUES (?, ?, 'center', 'active', 'pro', 'uz', ?)",
  );
  const insertBranch = db.prepare(
    "INSERT INTO branches (id, tenant_id, name, status, is_main, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  );
  const insertRole = db.prepare(
    "INSERT INTO roles (id, tenant_id, code, name, rank, interface, is_system, created_at) VALUES (?, ?, 'teacher', 'Teacher', 10, 'teacher', 1, ?)",
  );
  for (const tenantId of CONTROLS.tenantIds) {
    insertTenant.run(tenantId, tenantId, CONTROLS.fixedClock);
    insertRole.run(`${tenantId}_role_teacher`, tenantId, CONTROLS.fixedClock);
  }
  insertBranch.run("branch_wf_a_main", "tenant_wf_a", "A Main", "active", 1, CONTROLS.fixedClock);
  insertBranch.run("branch_wf_a_inactive", "tenant_wf_a", "A Inactive", "inactive", 0, CONTROLS.fixedClock);
  insertBranch.run("branch_wf_b_main", "tenant_wf_b", "B Main", "active", 1, CONTROLS.fixedClock);
  return db;
}

function harness() {
  const db = seedDatabase();
  const repository = new AppRepository(db);
  return { db, repository, service: new AppService(repository) };
}

function adminContext(tenantId = "tenant_wf_a") {
  return { tenantId, userId: `admin_${tenantId}`, role: "admin", realRole: "admin" };
}

function teacherInput(overrides = {}) {
  return {
    name: "Alpha Teacher",
    employmentType: "full_time",
    maxWeeklyHours: 40,
    accessEnabled: false,
    ...overrides,
  };
}

async function captureError(work) {
  try {
    await work();
  } catch (error) {
    return { status: error.status, message: error.message };
  }
  assert.fail("Expected legacy operation to fail");
}

test("WF-FIX-01 reproduces tenant-bound directory and Branch validation", async () => {
  const { db, service } = harness();
  try {
    const teacherA = await service.createTeacher(adminContext("tenant_wf_a"), teacherInput({ name: "Tenant A" }));
    await service.createTeacher(adminContext("tenant_wf_b"), teacherInput({ name: "Tenant B" }));
    assert.deepEqual(service.listTeachers(adminContext("tenant_wf_a")).map((item) => item.id), [teacherA.id]);
    assert.deepEqual(
      await captureError(() => service.createTeacher(
        adminContext("tenant_wf_a"),
        teacherInput({ name: "Foreign Branch", branchId: "branch_wf_b_main" }),
      )),
      { status: 422, message: "branchId is invalid" },
    );
    assert.equal(ACTORS.teacherA.tenantId, "tenant_wf_a");
  } finally {
    db.close();
  }
});

test("WF-FIX-02 reproduces Teacher/Identity atomic lifecycle behavior", async () => {
  const { db, service } = harness();
  try {
    const noAccess = await service.createTeacher(adminContext(), teacherInput({ name: "No Access" }));
    assert.equal(noAccess.hasAccess, false);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM users WHERE id = ?").get(noAccess.id).count, 0);

    const withAccess = await service.createTeacher(adminContext(), teacherInput({
      name: "Portal Teacher",
      accessEnabled: true,
      username: "teacher.a@fixture.test",
      password: "FixturePass123",
    }));
    assert.equal(withAccess.hasAccess, true);
    assert.equal(db.prepare("SELECT id FROM users WHERE id = ?").get(withAccess.id).id, withAccess.id);
    const beforeConflict = db.prepare("SELECT COUNT(*) AS count FROM teachers").get().count;
    assert.deepEqual(
      await captureError(() => service.createTeacher(adminContext(), teacherInput({
        name: "Duplicate",
        accessEnabled: true,
        username: "teacher.a@fixture.test",
        password: "FixturePass456",
      }))),
      { status: 409, message: "Username already exists" },
    );
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM teachers").get().count, beforeConflict);

    db.prepare(
      "INSERT INTO sessions (id, user_id, tenant_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?)",
    ).run("session_wf_a_1", withAccess.id, "tenant_wf_a", CONTROLS.fixedClock, "2026-07-25T06:00:00.000Z");
    assert.equal(service.archiveTeacher(adminContext(), withAccess.id).status, "inactive");
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM sessions WHERE user_id = ?").get(withAccess.id).count, 0);
    assert.equal(service.restoreTeacher(adminContext(), withAccess.id).status, "active");
  } finally {
    db.close();
  }
});

test("WF-FIX-03 provides complete keyed zero projections", () => {
  const fixture = FIXTURES.find((item) => item.id === "WF-FIX-03");
  assert.deepEqual(fixture.requestedTeacherIds, ["teacher_wf_a", "teacher_wf_a_zero"]);
  assert.deepEqual(Object.keys(fixture.completeZeroRow).sort(), [
    "completedLessons", "groupsCount", "studentsCount", "teacherId", "upcomingLessons", "weeklyMinutes",
  ]);
  assert.deepEqual(fixture.completeZeroRow.upcomingLessons, []);
});

test("WF-FIX-04 reproduces adjacent acceptance, overlap conflict, ordering, and tenant scope", async () => {
  const { db, service } = harness();
  try {
    const teacherA = await service.createTeacher(adminContext(), teacherInput({ name: "Hours A" }));
    const teacherB = await service.createTeacher(adminContext("tenant_wf_b"), teacherInput({ name: "Hours B" }));
    const first = service.createTeacherWorkingHour(adminContext(), {
      teacherId: teacherA.id, weekday: "1", startTime: "09:00", endTime: "12:00",
    });
    const adjacent = service.createTeacherWorkingHour(adminContext(), {
      teacherId: teacherA.id, weekday: "1", startTime: "12:00", endTime: "13:00",
    });
    assert.deepEqual([first.startTime, adjacent.startTime], ["09:00", "12:00"]);
    assert.deepEqual(
      await captureError(() => service.createTeacherWorkingHour(adminContext(), {
        teacherId: teacherA.id, weekday: "1", startTime: "11:59", endTime: "13:00",
      })),
      { status: 409, message: "Working hours overlap with an existing interval" },
    );
    assert.deepEqual(
      await captureError(() => service.createTeacherWorkingHour(adminContext(), {
        teacherId: teacherB.id, weekday: "1", startTime: "09:00", endTime: "10:00",
      })),
      { status: 404, message: "Teacher not found" },
    );
    assert.deepEqual(service.listTeacherWorkingHours(adminContext()).map((item) => item.startTime), ["09:00", "12:00"]);
  } finally {
    db.close();
  }
});

test("WF-FIX-05 scripts ordered provider outcomes without network or sleeps", async () => {
  const provider = new ScriptedProvider([
    { operation: "resolveBranch", outcome: "success", value: { branchId: "branch_wf_a_main" } },
    {
      operation: "appendAudit", outcome: "failure", code: "PROVIDER_UNAVAILABLE",
      dispatchState: "before_dispatch", message: "provider unavailable",
    },
  ]);
  assert.deepEqual(await provider.invoke("resolveBranch", { tenantId: "tenant_wf_a" }), { branchId: "branch_wf_a_main" });
  assert.deepEqual(
    await captureError(() => provider.invoke("appendAudit", { entityId: "teacher_wf_a" })),
    { status: undefined, message: "provider unavailable" },
  );
  provider.assertConsumed();
  assert.deepEqual(provider.calls.map((call) => call.operation), ["resolveBranch", "appendAudit"]);
});

test("WF-FIX-06 freezes narrow parity normalization and two governed deltas", () => {
  const fixture = FIXTURES.find((item) => item.id === "WF-FIX-06");
  assert.deepEqual(fixture.governedDeltas, ["WF-TARGET-DELTA-01", "WF-TARGET-DELTA-02"]);
  assert.match("wf-test-0042", NORMALIZATION_MAP.generatedId);
  assert.ok(NORMALIZATION_MAP.preserveExactly.includes("tenantId"));
  assert.ok(NORMALIZATION_MAP.preserveExactly.includes("semanticError"));
});

test("WF-FIX-07 freezes all ten legacy HTTP method/path pairs", () => {
  const baseline = require("../../../architecture/workforce-contract-baseline.json");
  assert.equal(HTTP_OPERATIONS.length, 10);
  assert.deepEqual(
    HTTP_OPERATIONS.map(({ method, path }) => ({ method, path })),
    baseline.operations.map(({ method, path }) => ({ method, path })),
  );
  assert.equal(new Set(HTTP_OPERATIONS.map((item) => item.operationId)).size, 10);
});

test("WF-FIX-08 requires a clean legacy-authority rollback terminal state", () => {
  const fixture = FIXTURES.find((item) => item.id === "WF-FIX-08");
  assert.ok(fixture.states.includes("unknown_outcome"));
  assert.ok(fixture.states.includes("audit_intent_missing"));
  assert.deepEqual(fixture.terminalInvariant, {
    authority: "legacy",
    targetWriteRoutes: 0,
    unresolvedIncidents: 0,
  });
});
