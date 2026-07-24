"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { Worker } = require("node:worker_threads");
const { DatabaseSync, constants } = require("node:sqlite");

const { schema } = require("../../../src/db/schema");
const {
  createSQLiteWorkforceAdapters,
} = require("../../../src/modules/workforce/infrastructure/createSQLiteWorkforceAdapters");
const {
  OwnedRecordConflictError,
} = require("../../../src/modules/workforce/infrastructure/sqliteSupport");

const FIXED_CLOCK = "2026-07-24T06:00:00.000Z";
const CONTEXT_A = Object.freeze({ tenantId: "tenant_wf_a", correlationId: "corr-sqlite-a" });
const CONTEXT_B = Object.freeze({ tenantId: "tenant_wf_b", correlationId: "corr-sqlite-b" });
const OWNED_TABLES = new Set(["teachers", "teacher_working_hours"]);

const OWNED_SCHEMA = `
  PRAGMA foreign_keys = ON;
  PRAGMA journal_mode = WAL;
  PRAGMA busy_timeout = 5000;
  CREATE TABLE teachers (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    name TEXT NOT NULL,
    branch_id TEXT,
    phone TEXT,
    email TEXT,
    specialization TEXT,
    employment_type TEXT NOT NULL DEFAULT 'full_time',
    status TEXT NOT NULL DEFAULT 'active',
    hired_at TEXT,
    max_weekly_minutes INTEGER NOT NULL DEFAULT 2400,
    note TEXT,
    created_at TEXT
  );
  CREATE TABLE teacher_working_hours (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    teacher_id TEXT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
    branch_id TEXT,
    weekday TEXT NOT NULL CHECK(weekday IN ('1', '2', '3', '4', '5', '6', '7')),
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(tenant_id, teacher_id, weekday, start_time, end_time)
  );
  CREATE TABLE forbidden_identity_probe (
    teacher_id TEXT PRIMARY KEY,
    username TEXT NOT NULL
  );
`;

function teacher(overrides = {}) {
  return {
    id: "teacher_wf_a",
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

function workingHour(overrides = {}) {
  return {
    id: "hour_wf_a",
    branchId: "branch_wf_a_main",
    teacherId: "teacher_wf_a",
    weekday: "1",
    startTime: "09:00",
    endTime: "12:00",
    createdAt: FIXED_CLOCK,
    ...overrides,
  };
}

function databaseFixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "dono-wf-owned-"));
  const databaseFile = path.join(directory, "workforce.sqlite");
  const db = new DatabaseSync(databaseFile);
  db.exec(OWNED_SCHEMA);
  const adapters = createSQLiteWorkforceAdapters(db);
  return {
    adapters,
    databaseFile,
    db,
    cleanup() {
      db.close();
      fs.rmSync(directory, { recursive: true, force: true });
    },
  };
}

function installOwnedTableAuthorizer(db) {
  const touched = new Set();
  const dataActions = new Set([
    constants.SQLITE_READ,
    constants.SQLITE_INSERT,
    constants.SQLITE_UPDATE,
    constants.SQLITE_DELETE,
  ]);
  db.setAuthorizer((action, tableName) => {
    if (!dataActions.has(action) || !tableName || tableName === "sqlite_master") {
      return constants.SQLITE_OK;
    }
    touched.add(tableName);
    return OWNED_TABLES.has(tableName) ? constants.SQLITE_OK : constants.SQLITE_DENY;
  });
  return touched;
}

function workerResult(worker) {
  return new Promise((resolve, reject) => {
    worker.once("message", resolve);
    worker.once("error", reject);
    worker.once("exit", (code) => {
      if (code !== 0) reject(new Error(`Worker exited ${code}`));
    });
  });
}

test("adapter bundle implements all five owned ports without foreign table access", () => {
  const fixture = databaseFixture();
  try {
    const touched = installOwnedTableAuthorizer(fixture.db);
    assert.deepEqual(Object.keys(fixture.adapters).sort(), [
      "teacherDirectoryQuery",
      "teacherProfileQuery",
      "teacherReferenceQuery",
      "teacherRepository",
      "workingHourRepository",
    ]);
    fixture.adapters.teacherRepository.insert(CONTEXT_A, teacher());
    fixture.adapters.teacherDirectoryQuery.listTenantBase(CONTEXT_A);
    fixture.adapters.teacherProfileQuery.getBaseProfile(CONTEXT_A, "teacher_wf_a");
    fixture.adapters.teacherReferenceQuery.getReference(CONTEXT_A, "teacher_wf_a");
    fixture.adapters.workingHourRepository.insert(CONTEXT_A, workingHour());
    fixture.adapters.workingHourRepository.list(CONTEXT_A, { teacherId: null });
    assert.deepEqual([...touched].sort(), ["teacher_working_hours", "teachers"]);
    assert.equal(touched.has("forbidden_identity_probe"), false);
  } finally {
    fixture.cleanup();
  }
});

test("adapter is compatible with the unchanged production SQLite schema", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(schema);
    db.prepare(`
      INSERT INTO tenants (id, name, type, status, plan, language, created_at)
      VALUES (?, ?, 'center', 'active', 'pro', 'uz', ?)
    `).run("tenant_wf_a", "Fixture A", FIXED_CLOCK);
    const adapters = createSQLiteWorkforceAdapters(db);
    const inserted = adapters.teacherRepository.insert(CONTEXT_A, teacher());
    const hour = adapters.workingHourRepository.insert(CONTEXT_A, workingHour());
    assert.equal(inserted.tenantId, "tenant_wf_a");
    assert.equal(hour.teacherId, inserted.id);
  } finally {
    db.close();
  }
});

test("Teacher ports preserve DTO, tenant scope, SQLite ordering, and minimum reference", () => {
  const fixture = databaseFixture();
  try {
    const store = fixture.adapters.teacherRepository;
    const alpha = store.insert(CONTEXT_A, teacher());
    store.insert(CONTEXT_A, teacher({ id: "teacher_wf_a_inactive", name: "Zulu", status: "inactive" }));
    store.insert(CONTEXT_B, teacher({ id: "teacher_wf_b", name: "Foreign", branchId: null }));
    assert.deepEqual(Object.keys(alpha), [
      "id", "tenantId", "branchId", "name", "phone", "email", "specialization",
      "employmentType", "status", "hiredAt", "maxWeeklyMinutes", "note", "createdAt",
    ]);
    assert.deepEqual(
      fixture.adapters.teacherDirectoryQuery.listTenantBase(CONTEXT_A).map((item) => item.id),
      ["teacher_wf_a", "teacher_wf_a_inactive"],
    );
    assert.equal(fixture.adapters.teacherProfileQuery.getBaseProfile(CONTEXT_A, "teacher_wf_b"), null);
    assert.deepEqual(
      fixture.adapters.teacherReferenceQuery.getReference(CONTEXT_A, "teacher_wf_a"),
      {
        tenantId: "tenant_wf_a",
        teacherId: "teacher_wf_a",
        displayName: "Alpha Teacher",
        status: "active",
        branchId: "branch_wf_a_main",
      },
    );
    assert.equal(Object.isFrozen(alpha), true);
  } finally {
    fixture.cleanup();
  }
});

test("Teacher replaceProfile and setStatus mutate only explicit owned fields", () => {
  const fixture = databaseFixture();
  try {
    const store = fixture.adapters.teacherRepository;
    store.insert(CONTEXT_A, teacher());
    const replacement = {
      teacherId: "teacher_wf_a",
      branchId: null,
      name: "Updated",
      phone: "",
      email: "",
      specialization: "",
      employmentType: "contract",
      hiredAt: null,
      maxWeeklyMinutes: 600,
      note: "updated",
      status: "inactive",
      arbitrary: "must-not-persist",
    };
    const replaced = store.replaceProfile(CONTEXT_A, replacement);
    assert.equal(replaced.status, "active");
    assert.equal(replaced.name, "Updated");
    assert.equal(Object.prototype.hasOwnProperty.call(replaced, "arbitrary"), false);
    assert.equal(store.setStatus(CONTEXT_A, { teacherId: "teacher_wf_a", status: "inactive" }).status, "inactive");
    assert.equal(store.replaceProfile(CONTEXT_B, replacement), null);
    assert.equal(store.setStatus(CONTEXT_B, { teacherId: "teacher_wf_a", status: "active" }), null);
  } finally {
    fixture.cleanup();
  }
});

test("Teacher insert conflict maps exactly and leaves transaction state clean", () => {
  const fixture = databaseFixture();
  try {
    const store = fixture.adapters.teacherRepository;
    store.insert(CONTEXT_A, teacher());
    assert.throws(
      () => store.insert(CONTEXT_B, teacher({ name: "Conflicting global ID" })),
      (error) => error instanceof OwnedRecordConflictError && error.code === "OWNED_RECORD_CONFLICT",
    );
    assert.equal(fixture.db.prepare("SELECT COUNT(*) AS count FROM teachers").get().count, 1);
    assert.doesNotThrow(() => fixture.db.exec("BEGIN IMMEDIATE; ROLLBACK"));
  } finally {
    fixture.cleanup();
  }
});

test("Working Hour ports preserve filter/order/tenant rules and adjacency", () => {
  const fixture = databaseFixture();
  try {
    fixture.adapters.teacherRepository.insert(CONTEXT_A, teacher());
    fixture.adapters.teacherRepository.insert(CONTEXT_B, teacher({ id: "teacher_wf_b", name: "Foreign" }));
    const store = fixture.adapters.workingHourRepository;
    store.insert(CONTEXT_A, workingHour({ id: "hour_wf_a_late", startTime: "12:00", endTime: "13:00" }));
    store.insert(CONTEXT_A, workingHour());
    store.insert(CONTEXT_B, workingHour({
      id: "hour_wf_b",
      teacherId: "teacher_wf_b",
      startTime: "08:00",
      endTime: "09:00",
    }));
    assert.deepEqual(store.list(CONTEXT_A, { teacherId: "teacher_wf_a" }).map((item) => item.id), [
      "hour_wf_a",
      "hour_wf_a_late",
    ]);
    assert.equal(store.findById(CONTEXT_A, "hour_wf_b"), null);
    assert.equal(store.findOverlap(CONTEXT_A, {
      teacherId: "teacher_wf_a",
      weekday: "1",
      startTime: "11:59",
      endTime: "12:30",
    }), "hour_wf_a");
    assert.equal(store.findOverlap(CONTEXT_A, {
      teacherId: "teacher_wf_a",
      weekday: "1",
      startTime: "13:00",
      endTime: "14:00",
    }), null);
  } finally {
    fixture.cleanup();
  }
});

test("Working Hour overlap/constraint failures roll back and driver errors stay technical", () => {
  const fixture = databaseFixture();
  const store = fixture.adapters.workingHourRepository;
  try {
    fixture.adapters.teacherRepository.insert(CONTEXT_A, teacher());
    store.insert(CONTEXT_A, workingHour());
    assert.throws(
      () => store.insert(CONTEXT_A, workingHour({
        id: "hour_overlap",
        startTime: "11:00",
        endTime: "13:00",
      })),
      (error) => error.code === "OWNED_RECORD_CONFLICT",
    );
    assert.equal(fixture.db.prepare("SELECT COUNT(*) AS count FROM teacher_working_hours").get().count, 1);
    assert.doesNotThrow(() => fixture.db.exec("BEGIN IMMEDIATE; ROLLBACK"));
  } finally {
    fixture.cleanup();
  }

  const closed = databaseFixture();
  const closedStore = closed.adapters.workingHourRepository;
  closed.db.close();
  assert.throws(
    () => closedStore.list(CONTEXT_A, { teacherId: null }),
    (error) => error.code !== "OWNED_RECORD_CONFLICT",
  );
  fs.rmSync(path.dirname(closed.databaseFile), { recursive: true, force: true });
});

test("Working Hour deleteById is tenant-scoped, atomic, and returns frozen deleted snapshot", () => {
  const fixture = databaseFixture();
  try {
    fixture.adapters.teacherRepository.insert(CONTEXT_A, teacher());
    const store = fixture.adapters.workingHourRepository;
    store.insert(CONTEXT_A, workingHour());
    assert.equal(store.deleteById(CONTEXT_B, "hour_wf_a"), null);
    const deleted = store.deleteById(CONTEXT_A, "hour_wf_a");
    assert.equal(deleted.id, "hour_wf_a");
    assert.equal(Object.isFrozen(deleted), true);
    assert.equal(store.findById(CONTEXT_A, "hour_wf_a"), null);
    assert.equal(store.deleteById(CONTEXT_A, "hour_wf_a"), null);
  } finally {
    fixture.cleanup();
  }
});

test("competing overlap inserts use a barrier and produce exactly one winner", async () => {
  const fixture = databaseFixture();
  try {
    fixture.adapters.teacherRepository.insert(CONTEXT_A, teacher());
    const barrierBuffer = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * 2);
    const barrier = new Int32Array(barrierBuffer);
    const workerFile = path.join(__dirname, "../helpers/sqliteWorkingHourWorker.js");
    const workers = [
      new Worker(workerFile, {
        workerData: {
          barrier: barrierBuffer,
          context: CONTEXT_A,
          databaseFile: fixture.databaseFile,
          record: workingHour({ id: "hour_compete_a", startTime: "14:00", endTime: "16:00" }),
        },
      }),
      new Worker(workerFile, {
        workerData: {
          barrier: barrierBuffer,
          context: CONTEXT_A,
          databaseFile: fixture.databaseFile,
          record: workingHour({ id: "hour_compete_b", startTime: "15:00", endTime: "17:00" }),
        },
      }),
    ];
    while (Atomics.load(barrier, 0) < 2) Atomics.wait(barrier, 0, Atomics.load(barrier, 0));
    const resultsPromise = Promise.all(workers.map(workerResult));
    Atomics.store(barrier, 1, 1);
    Atomics.notify(barrier, 1, 2);
    const results = await resultsPromise;
    assert.equal(results.filter((result) => result.ok).length, 1);
    assert.deepEqual(
      results.filter((result) => !result.ok).map((result) => result.code),
      ["OWNED_RECORD_CONFLICT"],
    );
    assert.equal(
      fixture.db.prepare(
        "SELECT COUNT(*) AS count FROM teacher_working_hours WHERE tenant_id = ?",
      ).get("tenant_wf_a").count,
      1,
    );
  } finally {
    fixture.cleanup();
  }
});
