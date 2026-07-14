#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { DatabaseSync } = require("node:sqlite");
const { Readable, Writable } = require("node:stream");

const sqliteFile = path.join(os.tmpdir(), `dono-backend-logic-${process.pid}-${Date.now()}.sqlite`);
process.env.NODE_ENV = "test";
process.env.DONO_TELEGRAM_SKIP_REMOTE_VALIDATION = "true";
process.env.SQLITE_FILE = sqliteFile;
process.env.PORT = "0";

const { getDb } = require("../src/db/client");
const { api } = require("../src/http/api");
const { AppRepository } = require("../src/repositories/appRepository");
const { today: localToday } = require("../src/utils/time");

const tests = [];
let adminCookie = "";
let teacherCookie = "";
let superCookie = "";
let auditStudent = null;
let auditGroup = null;

function test(name, fn) {
  tests.push({ name, fn });
}

function cookieFrom(headers) {
  const raw = headers.get("set-cookie") || "";
  return raw.split(";")[0];
}

async function request(pathname, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.cookie) headers.cookie = options.cookie;
  let body = options.body;
  if (body && typeof body === "object" && !Buffer.isBuffer(body)) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(body);
  }
  const req = Readable.from(body ? [body] : []);
  req.method = options.method || "GET";
  req.url = pathname;
  req.headers = { host: "localhost", ...headers };
  const parsedPathname = new URL(pathname, "http://localhost").pathname;
  const response = await invokeApi(req, parsedPathname);
  const text = response.body;
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch (_error) {
    json = { raw: text };
  }
  return { status: response.status, json, headers: response.headers };
}

function invokeApi(req, pathname) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const headers = new Map();
    const res = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(Buffer.from(chunk));
        callback();
      },
    });
    res.statusCode = 200;
    res.setHeader = (key, value) => {
      headers.set(key.toLowerCase(), value);
    };
    res.writeHead = (status, payload = {}) => {
      res.statusCode = status;
      Object.entries(payload).forEach(([key, value]) => headers.set(key.toLowerCase(), value));
    };
    res.end = (chunk) => {
      if (chunk) chunks.push(Buffer.from(chunk));
      resolve({
        status: res.statusCode,
        headers: {
          get(key) {
            return headers.get(String(key).toLowerCase()) || "";
          },
        },
        body: Buffer.concat(chunks).toString("utf8"),
      });
    };
    Promise.resolve(api(req, res, pathname)).catch(reject);
  });
}

async function login(username, password) {
  const response = await request("/api/login", {
    method: "POST",
    body: { username, password },
  });
  assert.equal(response.status, 200, `${username} login failed`);
  return cookieFrom(response.headers);
}

async function createGroup(name = `Audit Group ${Date.now()}`) {
  const response = await request("/api/groups", {
    method: "POST",
    cookie: adminCookie,
    body: {
      name,
      subject: "Backend QA",
      teacherId: "user_teacher",
      room: "QA",
      monthlyFee: 0,
    },
  });
  assert.equal(response.status, 201, `create group failed: ${JSON.stringify(response.json)}`);
  return response.json;
}

let auditStudentSequence = 0;

async function createStudent(groupId, name = `Audit Student ${Date.now()}`) {
  auditStudentSequence += 1;
  const response = await request("/api/students", {
    method: "POST",
    cookie: adminCookie,
    body: {
      name,
      parentName: "Audit Parent",
      phone: `+99890${String(1000000 + auditStudentSequence).slice(-7)}`,
      groupId,
      debt: 0,
    },
  });
  assert.equal(response.status, 201, `create student failed: ${JSON.stringify(response.json)}`);
  return response.json;
}

async function createLesson(groupId, time = "10:00 - 11:00") {
  const response = await request("/api/lessons", {
    method: "POST",
    cookie: adminCookie,
    body: { groupId, time, date: isoPlusDays(0) },
  });
  assert.equal(response.status, 201, `create lesson failed: ${JSON.stringify(response.json)}`);
  return response.json;
}

function isoPlusDays(days) {
  const anchor = new Date(`${localToday()}T12:00:00.000Z`);
  anchor.setUTCDate(anchor.getUTCDate() + days);
  return anchor.toISOString().slice(0, 10);
}

async function createRichGroup(overrides = {}) {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const body = {
    name: `Audit Rich Group ${suffix}`,
    subject: "English",
    description: "Regression-tested group profile",
    level: "A2",
    teacherId: "user_teacher",
    room: `QA-${suffix.slice(-4)}`,
    capacity: 12,
    monthlyFee: 220000,
    startDate: isoPlusDays(-7),
    endDate: isoPlusDays(90),
    status: "active",
    color: "#2563EB",
    note: "Group lifecycle audit",
    ...overrides,
  };
  const response = await request("/api/groups", {
    method: "POST",
    cookie: adminCookie,
    body,
  });
  assert.equal(response.status, 201, `rich group create failed: ${JSON.stringify(response.json)}`);
  return response.json;
}

function assertOmitsKeysDeep(value, forbiddenKeys, label = "response") {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertOmitsKeysDeep(item, forbiddenKeys, `${label}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  Object.entries(value).forEach(([key, nested]) => {
    assert.ok(!forbiddenKeys.has(key), `${label} exposes private key ${key}`);
    assertOmitsKeysDeep(nested, forbiddenKeys, `${label}.${key}`);
  });
}

test("Database Upgrade: legacy group schema migrates before dependent indexes are created", async () => {
  const legacyFile = path.join(os.tmpdir(), `dono-legacy-upgrade-${process.pid}-${Date.now()}.sqlite`);
  const legacyDb = new DatabaseSync(legacyFile);
  legacyDb.exec(`
    CREATE TABLE groups (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      subject TEXT NOT NULL,
      teacher_id TEXT NOT NULL,
      room TEXT,
      monthly_fee INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1
    );
  `);
  legacyDb.close();

  try {
    const upgrade = spawnSync(
      process.execPath,
      ["-e", "const db=require('./src/db/client').getDb(); db.prepare('SELECT 1').get();"],
      {
        cwd: path.resolve(__dirname, ".."),
        env: { ...process.env, SQLITE_FILE: legacyFile, NODE_ENV: "test" },
        encoding: "utf8",
      },
    );
    assert.equal(upgrade.status, 0, `legacy upgrade failed: ${upgrade.stderr || upgrade.stdout}`);

    const upgradedDb = new DatabaseSync(legacyFile, { readOnly: true });
    const groupColumns = upgradedDb.prepare("PRAGMA table_info(groups)").all().map((column) => column.name);
    const scheduleColumns = upgradedDb.prepare("PRAGMA table_info(schedules)").all().map((column) => column.name);
    assert.ok(groupColumns.includes("status"), "groups.status migration was not applied");
    assert.ok(scheduleColumns.includes("valid_from") && scheduleColumns.includes("status"), "schedule lifecycle migration was not applied");
    assert.equal(upgradedDb.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
    assert.equal(upgradedDb.prepare("PRAGMA foreign_key_check").all().length, 0);
    upgradedDb.close();
  } finally {
    for (const suffix of ["", "-shm", "-wal"]) {
      try {
        fs.unlinkSync(`${legacyFile}${suffix}`);
      } catch (_error) {}
    }
  }
});

test("Platform Multi-Tenancy: SuperAdmin manages tenants but cannot see tenant data until switched", async () => {
  let response = await request("/api/me", { method: "GET", cookie: superCookie });
  assert.equal(response.status, 200, `superadmin /api/me failed: ${JSON.stringify(response.json)}`);
  assert.equal(response.json.user.role, "superadmin");
  assert.equal(response.json.user.realRole, "superadmin");
  assert.equal(response.json.user.tenantId, null);

  response = await request("/api/bootstrap", { method: "GET", cookie: superCookie });
  assert.equal(response.status, 200, `superadmin bootstrap failed: ${JSON.stringify(response.json)}`);
  assert.equal(response.json.dashboard, null, "platform mode must not return tenant dashboard");
  assert.ok(Array.isArray(response.json.platform.tenants), "platform mode must return tenant list");

  response = await request("/api/payments", { method: "GET", cookie: superCookie });
  assert.equal(response.status, 403, "superadmin must not read tenant payments before switching");

  response = await request("/api/platform/tenants", { method: "GET", cookie: adminCookie });
  assert.equal(response.status, 403, "tenant admin must not access platform tenants");

  response = await request("/api/platform/tenants", {
    method: "POST",
    cookie: superCookie,
    body: { name: "Audit Center", domain: `audit-center-${Date.now()}` },
  });
  assert.equal(response.status, 201, `platform tenant create failed: ${JSON.stringify(response.json)}`);
  const tenant = response.json;
  assert.ok(tenant.id);
  assert.equal(tenant.name, "Audit Center");

  response = await request(`/api/platform/tenants/${encodeURIComponent(tenant.id)}/users`, {
    method: "POST",
    cookie: superCookie,
    body: { name: "Audit Director", username: `audit_admin_${Date.now()}`, password: "123456" },
  });
  assert.equal(response.status, 201, `platform admin create failed: ${JSON.stringify(response.json)}`);
  assert.equal(response.json.role, "admin");
  assert.equal(response.json.tenantId, tenant.id);
  const createdAdmin = response.json;

  response = await request("/api/platform/switch-tenant", {
    method: "POST",
    cookie: superCookie,
    body: { tenantId: tenant.id },
  });
  assert.equal(response.status, 200, `platform switch failed: ${JSON.stringify(response.json)}`);
  assert.equal(response.json.user.role, "admin");
  assert.equal(response.json.user.realRole, "superadmin");
  assert.equal(response.json.user.activeTenantId, tenant.id);

  response = await request("/api/payments", { method: "GET", cookie: superCookie });
  assert.equal(response.status, 200, `switched superadmin should read selected tenant payments: ${JSON.stringify(response.json)}`);
  assert.deepEqual(response.json.payments, []);

  response = await request("/api/platform/exit-tenant", { method: "POST", cookie: superCookie, body: {} });
  assert.equal(response.status, 200, `platform exit failed: ${JSON.stringify(response.json)}`);
  assert.equal(response.json.user.role, "superadmin");
  assert.equal(response.json.user.activeTenantId, null);

  response = await request("/api/payments", { method: "GET", cookie: superCookie });
  assert.equal(response.status, 403, "superadmin must lose tenant data access after exiting tenant mode");

  const createdAdminCookie = await login(createdAdmin.username, "123456");
	  response = await request("/api/me", { method: "GET", cookie: createdAdminCookie });
	  assert.equal(response.status, 200);
	  assert.equal(response.json.user.role, "admin");
	  assert.equal(response.json.user.tenantId, tenant.id);

  response = await request(`/api/platform/tenants/${encodeURIComponent(tenant.id)}`, {
    method: "PATCH",
    cookie: superCookie,
    body: { status: "suspended", plan: "pro", suspendedReason: "Audit suspension" },
  });
  assert.equal(response.status, 200, `platform tenant patch failed: ${JSON.stringify(response.json)}`);
  assert.equal(response.json.status, "suspended");
  assert.equal(response.json.plan, "pro");

  response = await request("/api/platform/audit-logs", { method: "GET", cookie: superCookie });
  assert.equal(response.status, 200, `platform audit logs failed: ${JSON.stringify(response.json)}`);
  assert.ok(response.json.auditLogs.some((log) => log.entity === "tenant" && log.entityId === tenant.id), "tenant platform actions must be audited");

  response = await request("/api/bootstrap", { method: "GET", cookie: createdAdminCookie });
  assert.equal(response.status, 403, "already-open suspended tenant session must be blocked from tenant APIs");

  response = await request("/api/login", {
    method: "POST",
    body: { username: createdAdmin.username, password: "123456" },
  });
  assert.equal(response.status, 403, "suspended tenant admin must not be allowed to login");
	});

test("Financial Logic: charge decreases balance, payment increases it, ledger ignores stale cached balance", async () => {
  auditGroup = await createGroup("Audit Finance Group");
  auditStudent = await createStudent(auditGroup.id, "Audit Finance Student");

  let response = await request(`/api/students/${encodeURIComponent(auditStudent.id)}/transactions`, {
    method: "POST",
    cookie: adminCookie,
    body: { type: "charge", amount: 100000, description: "Audit charge" },
  });
  assert.equal(response.status, 201, `charge failed: ${JSON.stringify(response.json)}`);
  assert.equal(response.json.balance, -100000);

  response = await request(`/api/students/${encodeURIComponent(auditStudent.id)}/transactions`, {
    method: "POST",
    cookie: adminCookie,
    body: { type: "payment", method: "cash", amount: 50000, description: "Audit payment", idempotencyKey: "audit-wallet-payment-50000" },
  });
  assert.equal(response.status, 201, `payment transaction failed: ${JSON.stringify(response.json)}`);
  assert.equal(response.json.balance, -50000);

  getDb().prepare("UPDATE students SET balance = 999999, debt = 0 WHERE tenant_id = 'tenant_main' AND id = ?").run(auditStudent.id);
  response = await request(`/api/students/${encodeURIComponent(auditStudent.id)}/ledger`, {
    method: "GET",
    cookie: adminCookie,
  });
  assert.equal(response.status, 200, `ledger failed: ${JSON.stringify(response.json)}`);
	  assert.equal(response.json.balance, -50000);
	});

test("Enterprise Foundation: branches, permissions, subscriptions, teacher hours, finance metadata, tasks and lead conversion work", async () => {
  let response = await request("/api/permissions/me", { method: "GET", cookie: adminCookie });
  assert.equal(response.status, 200, `admin permissions failed: ${JSON.stringify(response.json)}`);
  assert.ok(response.json.permissions.includes("finance.manage"));
  assert.ok(response.json.permissions.includes("subscriptions.manage"));

  response = await request("/api/permissions/me", { method: "GET", cookie: teacherCookie });
  assert.equal(response.status, 200, `teacher permissions failed: ${JSON.stringify(response.json)}`);
  assert.ok(!response.json.permissions.includes("finance.manage"), "teacher must not receive finance permission");

  response = await request("/api/branches", { method: "GET", cookie: adminCookie });
  assert.equal(response.status, 200, `branches list failed: ${JSON.stringify(response.json)}`);
  assert.ok(response.json.branches.some((branch) => branch.isMain), "tenant must have a main branch");

  response = await request("/api/branches", {
    method: "POST",
    cookie: adminCookie,
    body: { name: `Audit Branch ${Date.now()}` },
  });
  assert.equal(response.status, 201, `branch create failed: ${JSON.stringify(response.json)}`);
  assert.equal(response.json.status, "active");

  response = await request("/api/branches", { method: "GET", cookie: teacherCookie });
  assert.equal(response.status, 403, "teacher must not manage branches");

  response = await request("/api/roles", { method: "GET", cookie: adminCookie });
  assert.equal(response.status, 200, `roles list failed: ${JSON.stringify(response.json)}`);
  assert.ok(response.json.roles.some((role) => role.code === "admin"));
  assert.ok(response.json.roles.some((role) => role.code === "teacher"));

  response = await request("/api/finance/accounts", { method: "GET", cookie: adminCookie });
  assert.equal(response.status, 200, `finance accounts failed: ${JSON.stringify(response.json)}`);
  assert.ok(response.json.accounts.some((account) => account.type === "cash"));

  response = await request("/api/finance/accounts", {
    method: "POST",
    cookie: adminCookie,
    body: { name: `Audit Online ${Date.now()}`, type: "online" },
  });
  assert.equal(response.status, 201, `finance account create failed: ${JSON.stringify(response.json)}`);
  const account = response.json;

  response = await request("/api/finance/categories", {
    method: "POST",
    cookie: adminCookie,
    body: { name: `Audit Income ${Date.now()}`, kind: "income" },
  });
  assert.equal(response.status, 201, `finance category create failed: ${JSON.stringify(response.json)}`);
  const category = response.json;

  response = await request(`/api/students/${encodeURIComponent(auditStudent.id)}/transactions`, {
    method: "POST",
    cookie: adminCookie,
    body: { type: "charge", amount: 1234, description: "Audit finance metadata", accountId: account.id, categoryId: category.id },
  });
  assert.equal(response.status, 201, `metadata transaction failed: ${JSON.stringify(response.json)}`);
  assert.equal(response.json.transaction.accountId, account.id);
  assert.equal(response.json.transaction.categoryId, category.id);

  response = await request("/api/subscriptions", {
    method: "POST",
    cookie: adminCookie,
    body: { studentId: auditStudent.id, groupId: auditGroup.id, name: "Audit Abonement", startDate: "2026-07-01", lessonsTotal: 12, amount: 500000 },
  });
  assert.equal(response.status, 201, `subscription create failed: ${JSON.stringify(response.json)}`);
  assert.equal(response.json.studentId, auditStudent.id);
  assert.equal(response.json.lessonsTotal, 12);

  response = await request("/api/teacher-working-hours", {
    method: "POST",
    cookie: adminCookie,
    body: { teacherId: "user_teacher", weekday: "1", startTime: "09:00", endTime: "18:00" },
  });
  assert.equal(response.status, 201, `teacher hours create failed: ${JSON.stringify(response.json)}`);
  assert.equal(response.json.teacherId, "user_teacher");

  response = await request("/api/teacher-working-hours", { method: "GET", cookie: teacherCookie });
  assert.equal(response.status, 200, `teacher hours read failed: ${JSON.stringify(response.json)}`);
  assert.ok(response.json.workingHours.every((item) => item.teacherId === "user_teacher"));

  response = await request("/api/tasks", {
    method: "POST",
    cookie: adminCookie,
    body: { title: "Audit parent call", assigneeUserId: "user_teacher", relatedType: "student", relatedId: auditStudent.id, priority: "high" },
  });
  assert.equal(response.status, 201, `task create failed: ${JSON.stringify(response.json)}`);
  const task = response.json;
  assert.equal(task.status, "open");

  response = await request("/api/tasks", { method: "GET", cookie: teacherCookie });
  assert.equal(response.status, 200, `teacher tasks read failed: ${JSON.stringify(response.json)}`);
  assert.ok(response.json.tasks.some((item) => item.id === task.id), "assigned teacher must see assigned task");

  response = await request(`/api/tasks/${encodeURIComponent(task.id)}`, {
    method: "PATCH",
    cookie: teacherCookie,
    body: { status: "completed" },
  });
  assert.equal(response.status, 200, `teacher task complete failed: ${JSON.stringify(response.json)}`);
  assert.equal(response.json.status, "completed");
  assert.ok(response.json.completedAt);

  response = await request(`/api/tasks/${encodeURIComponent(task.id)}`, {
    method: "PATCH",
    cookie: teacherCookie,
    body: { title: "Teacher must not rename admin task" },
  });
  assert.equal(response.status, 403, "teacher must only be allowed to update task status");

  response = await request("/api/leads", {
    method: "POST",
    cookie: adminCookie,
    body: { name: "Audit Convert Lead", phone: "+998 90 000 00 07", source: "Referral" },
  });
  assert.equal(response.status, 201, `lead create for conversion failed: ${JSON.stringify(response.json)}`);
  const lead = response.json;

  response = await request(`/api/leads/${encodeURIComponent(lead.id)}/convert`, {
    method: "POST",
    cookie: adminCookie,
    body: { groupId: auditGroup.id, parentName: "Converted Parent", debt: 15000 },
  });
  assert.equal(response.status, 201, `lead convert failed: ${JSON.stringify(response.json)}`);
  assert.equal(response.json.lead.status, "converted");
  assert.equal(response.json.lead.convertedStudentId, response.json.student.id);
  assert.equal(response.json.student.groupId, auditGroup.id);
  assert.equal(response.json.student.debt, 15000);
});

test("Financial Idempotency: duplicate POST /api/payments with same idempotencyKey should not create duplicates", async () => {
  const before = await request("/api/payments", { method: "GET", cookie: adminCookie });
  assert.equal(before.status, 200);
  const countBefore = before.json.payments.filter((payment) => payment.studentId === auditStudent.id && payment.amount === 25000).length;
  const payload = { studentId: auditStudent.id, amount: 25000, type: "cash", idempotencyKey: "audit-payment-25000-a" };

  let response = await request("/api/payments", { method: "POST", cookie: adminCookie, body: payload });
  assert.equal(response.status, 201, `first payment failed: ${JSON.stringify(response.json)}`);
  const firstId = response.json.id;
  response = await request("/api/payments", { method: "POST", cookie: adminCookie, body: payload });
  assert.equal(response.status, 201, `second payment failed: ${JSON.stringify(response.json)}`);
  assert.equal(response.json.id, firstId, "same idempotencyKey must return the original payment");
  assert.equal(response.json.reused, true);

  response = await request("/api/payments", {
    method: "POST",
    cookie: adminCookie,
    body: { ...payload, idempotencyKey: "audit-payment-25000-b" },
  });
  assert.equal(response.status, 201, `distinct idempotency key payment failed: ${JSON.stringify(response.json)}`);
  assert.notEqual(response.json.id, firstId, "different idempotencyKey must allow a distinct real payment");

  const after = await request("/api/payments", { method: "GET", cookie: adminCookie });
  assert.equal(after.status, 200);
  const countAfter = after.json.payments.filter((payment) => payment.studentId === auditStudent.id && payment.amount === 25000).length;
  assert.equal(countAfter - countBefore, 2, "idempotency should dedupe only matching keys, not all matching payloads");
});

test("Financial Integrity: DELETE /api/payments/:id voids payment and ledger rows instead of hard deleting", async () => {
  let response = await request("/api/payments", {
    method: "POST",
    cookie: adminCookie,
    body: { studentId: auditStudent.id, amount: 7000, type: "transfer", idempotencyKey: "audit-payment-void" },
  });
  assert.equal(response.status, 201, `void candidate payment failed: ${JSON.stringify(response.json)}`);
  const payment = response.json;

  response = await request(`/api/payments/${encodeURIComponent(payment.id)}`, {
    method: "DELETE",
    cookie: adminCookie,
    body: {},
  });
  assert.equal(response.status, 200, `payment void failed: ${JSON.stringify(response.json)}`);
  assert.equal(response.json.status, "voided");

  const paymentRow = getDb().prepare("SELECT status, voided_at FROM payments WHERE tenant_id = ? AND id = ?").get("tenant_main", payment.id);
  assert.equal(paymentRow.status, "voided", "payment row must remain in DB as voided");
  assert.ok(paymentRow.voided_at, "voided payment must have voided_at");

  const transactionRow = getDb()
    .prepare("SELECT status, voided_at FROM invoices_transactions WHERE tenant_id = ? AND description LIKE ? LIMIT 1")
    .get("tenant_main", `%payment:${payment.id}%`);
  assert.equal(transactionRow.status, "voided", "linked ledger transaction must remain in DB as voided");
  assert.ok(transactionRow.voided_at, "voided ledger transaction must have voided_at");

  response = await request("/api/payments", { method: "GET", cookie: adminCookie });
  assert.equal(response.status, 200);
  assert.ok(!response.json.payments.some((item) => item.id === payment.id), "voided payments must not appear in normal payment list");
});

test("Contract: frontend PUT /api/students/:id endpoint exists and is not 404/500", async () => {
  const response = await request(`/api/students/${encodeURIComponent(auditStudent.id)}`, {
    method: "PUT",
    cookie: adminCookie,
    body: {
      name: "Audit Finance Student Updated",
      parentName: "Audit Parent Updated",
      phone: "+998 90 000 00 02",
      groupId: auditGroup.id,
      status: "active",
    },
  });
  assert.notEqual(response.status, 404);
  assert.notEqual(response.status, 500);
  assert.equal(response.status, 200, `unexpected contract response: ${JSON.stringify(response.json)}`);
});

test("RBAC: teacher is blocked from critical admin routes", async () => {
  let response = await request("/api/payments", { method: "GET", cookie: teacherCookie });
  assert.equal(response.status, 403, "teacher GET /api/payments must be forbidden");

  response = await request("/api/students", {
    method: "POST",
    cookie: teacherCookie,
    body: { name: "Teacher Bypass", parentName: "Parent", groupId: auditGroup.id },
  });
  assert.equal(response.status, 403, "teacher POST /api/students must be forbidden");

  response = await request("/api/settings/telegram", {
    method: "POST",
    cookie: teacherCookie,
    body: { telegramBot: "@bot", telegramBotToken: "123456:abcdefghijklmnopqrstuvwxyz" },
  });
  assert.equal(response.status, 403, "teacher POST /api/settings/telegram must be forbidden");

  response = await request("/api/leads/nonexistent", { method: "DELETE", cookie: teacherCookie, body: {} });
  assert.equal(response.status, 404, "DELETE /api/leads/:id is not implemented; RBAC cannot be evaluated on this route");

  response = await request("/api/group-schedules/1/changes/preview", {
    method: "POST",
    cookie: teacherCookie,
    body: { scope: "this_occurrence", occurrenceDate: isoPlusDays(0), reason: "RBAC probe", patch: { endTime: "23:59" } },
  });
  assert.equal(response.status, 403, "teacher schedule change preview must be forbidden");

  response = await request("/api/group-schedules/1/changes", {
    method: "POST",
    cookie: teacherCookie,
    body: {
      scope: "this_occurrence",
      occurrenceDate: isoPlusDays(0),
      reason: "RBAC probe",
      patch: { endTime: "23:59" },
      idempotencyKey: "teacher-schedule-rbac-probe",
    },
  });
  assert.equal(response.status, 403, "teacher schedule change apply must be forbidden");
});

test("Teacher DTO: sensitive finance and Telegram fields are omitted, not zero-filled", async () => {
  let response = await request("/api/students", { method: "GET", cookie: teacherCookie });
  assert.equal(response.status, 200);
  assert.ok(response.json.students.length > 0);
  response.json.students.forEach((student) => {
    assert.ok(!Object.prototype.hasOwnProperty.call(student, "debt"), "teacher student DTO must omit debt");
    assert.ok(!Object.prototype.hasOwnProperty.call(student, "balance"), "teacher student DTO must omit balance");
    assert.ok(!Object.prototype.hasOwnProperty.call(student, "telegramChatId"), "teacher student DTO must omit telegramChatId");
  });

  response = await request("/api/groups", { method: "GET", cookie: teacherCookie });
  assert.equal(response.status, 200);
  assert.ok(response.json.groups.length > 0);
  response.json.groups.forEach((group) => {
    assert.ok(!Object.prototype.hasOwnProperty.call(group, "monthlyFee"), "teacher group DTO must omit monthlyFee");
  });

  response = await request("/api/bootstrap", { method: "GET", cookie: teacherCookie });
  assert.equal(response.status, 200);
  assert.ok(!Object.prototype.hasOwnProperty.call(response.json.dashboard.stats, "debtTotal"), "teacher stats must omit debtTotal");
  assert.ok(!Object.prototype.hasOwnProperty.call(response.json.dashboard.stats, "revenueToday"), "teacher stats must omit revenueToday");
  assert.ok(!Object.prototype.hasOwnProperty.call(response.json.dashboard.stats, "queuedMessages"), "teacher stats must omit queuedMessages");
});

test("Student Lifecycle: guardian, profile, effective enrollment, archive/restore and all intake paths are real", async () => {
  const db = getDb();
  const today = isoPlusDays(0);
  const oldLessonDate = isoPlusDays(-1);
  const enrollmentDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const groupA = await createRichGroup({ name: "Audit Lifecycle A", startDate: enrollmentDate });
  const groupB = await createRichGroup({ name: "Audit Lifecycle B", startDate: enrollmentDate });
  const familyPhone = `+99893${String(2000000 + auditStudentSequence).slice(-7)}`;

  const createRichStudent = async (name) => {
    const response = await request("/api/students", {
      method: "POST",
      cookie: adminCookie,
      body: {
        name,
        groupId: groupA.id,
        parentName: "Lifecycle Parent",
        parentRelationship: "mother",
        parentEmail: "parent@example.com",
        phone: familyPhone,
        studentPhone: "+998935551122",
        email: `${name.toLowerCase().replace(/\s+/g, ".")}@example.com`,
        birthDate: "2014-05-12",
        gender: "female",
        address: "Toshkent",
        source: "Referral",
        enrollmentDate,
        note: "Lifecycle audit",
        debt: 0,
      },
    });
    assert.equal(response.status, 201, JSON.stringify(response.json));
    return response.json;
  };

  const first = await createRichStudent("Lifecycle First");
  const sibling = await createRichStudent("Lifecycle Sibling");
  const guardians = db.prepare("SELECT * FROM guardians WHERE tenant_id = 'tenant_main' AND phone_normalized = ?").all(first.phone.replace(/\D/g, ""));
  assert.equal(guardians.length, 1, "siblings with one parent phone must share one guardian");
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM student_guardians WHERE tenant_id = 'tenant_main' AND guardian_id = ?").get(guardians[0].id).count, 2);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM student_group_enrollments WHERE tenant_id = 'tenant_main' AND student_id IN (?, ?) AND status = 'active'").get(first.id, sibling.id).count, 2);

  let response = await request(`/api/students/${encodeURIComponent(first.id)}/chat-id`, {
    method: "POST",
    cookie: adminCookie,
    body: { chat_id: "700001" },
  });
  assert.equal(response.status, 200);
  const siblingChats = db.prepare("SELECT telegram_chat_id FROM students WHERE tenant_id = 'tenant_main' AND id IN (?, ?) ORDER BY id").all(first.id, sibling.id);
  assert.deepEqual([...new Set(siblingChats.map((row) => row.telegram_chat_id))], ["700001"], "guardian Telegram must synchronize all siblings");

  response = await request(`/api/students/${encodeURIComponent(first.id)}/profile`, { cookie: adminCookie });
  assert.equal(response.status, 200, JSON.stringify(response.json));
  assert.equal(response.json.guardians.length, 1);
  assert.equal(response.json.enrollments.length, 1);
  assert.equal(response.json.student.parentEmail, "parent@example.com");
  assert.ok(Array.isArray(response.json.ledger));

  const oldLesson = await request("/api/lessons", {
    method: "POST",
    cookie: adminCookie,
    body: { groupId: groupA.id, date: oldLessonDate, time: "15:00 - 16:00" },
  });
  assert.equal(oldLesson.status, 201, JSON.stringify(oldLesson.json));

  response = await request(`/api/students/${encodeURIComponent(first.id)}`, {
    method: "PUT",
    cookie: adminCookie,
    body: {
      ...first,
      groupId: groupB.id,
      parentEmail: "parent@example.com",
      parentRelationship: "mother",
      enrollmentDate,
      transferReason: "Level promotion",
    },
  });
  assert.equal(response.status, 200, JSON.stringify(response.json));

  const oldRoster = await request(`/api/lessons/${encodeURIComponent(oldLesson.json.id)}/students`, { cookie: adminCookie });
  assert.equal(oldRoster.status, 200);
  assert.ok(oldRoster.json.students.some((student) => student.id === first.id), "transferred student disappeared from historical lesson roster");
  response = await request("/api/attendance", {
    method: "POST",
    cookie: adminCookie,
    body: {
      lessonId: oldLesson.json.id,
      records: oldRoster.json.students.map((student) => ({ studentId: student.id, status: "present" })),
    },
  });
  assert.equal(response.status, 200, "historical attendance must remain editable after transfer");

  const newLesson = await request("/api/lessons", {
    method: "POST",
    cookie: adminCookie,
    body: { groupId: groupB.id, date: today, time: "16:00 - 17:00" },
  });
  assert.equal(newLesson.status, 201, JSON.stringify(newLesson.json));
  const newRoster = await request(`/api/lessons/${encodeURIComponent(newLesson.json.id)}/students`, { cookie: adminCookie });
  assert.ok(newRoster.json.students.some((student) => student.id === first.id));
  assert.ok(!newRoster.json.students.some((student) => student.id === sibling.id), "student from old group leaked into new lesson roster");

  response = await request(`/api/students/${encodeURIComponent(first.id)}`, {
    method: "DELETE",
    cookie: adminCookie,
    body: { reason: "Course completed" },
  });
  assert.equal(response.status, 200);
  assert.equal(response.json.status, "left");
  assert.equal(db.prepare("SELECT archive_reason FROM students WHERE id = ?").get(first.id).archive_reason, "Course completed");
  const activeList = await request("/api/students", { cookie: adminCookie });
  const archiveList = await request("/api/students?includeArchived=1", { cookie: adminCookie });
  assert.ok(!activeList.json.students.some((student) => student.id === first.id));
  assert.ok(archiveList.json.students.some((student) => student.id === first.id));
  response = await request(`/api/students/${encodeURIComponent(first.id)}/restore`, { method: "POST", cookie: adminCookie, body: {} });
  assert.equal(response.status, 200);
  assert.equal(response.json.status, "active");
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM student_group_enrollments WHERE tenant_id = 'tenant_main' AND student_id = ? AND status = 'active'").get(first.id).count, 1);

  const importedName = `Imported Lifecycle ${Date.now()}`;
  response = await request("/api/import/students", {
    method: "POST",
    cookie: adminCookie,
    body: { csv: `${importedName},+998931112233,Import Parent,${groupB.id},0` },
  });
  assert.equal(response.status, 201, JSON.stringify(response.json));
  const imported = db.prepare("SELECT id FROM students WHERE tenant_id = 'tenant_main' AND name = ?").get(importedName);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM student_guardians WHERE tenant_id = 'tenant_main' AND student_id = ?").get(imported.id).count, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM student_group_enrollments WHERE tenant_id = 'tenant_main' AND student_id = ?").get(imported.id).count, 1);

  const lead = await request("/api/leads", { method: "POST", cookie: adminCookie, body: { name: `Lead Lifecycle ${Date.now()}`, phone: "+998934445566", source: "Website" } });
  assert.equal(lead.status, 201);
  const converted = await request(`/api/leads/${encodeURIComponent(lead.json.id)}/convert`, { method: "POST", cookie: adminCookie, body: { groupId: groupB.id, parentName: "Lead Parent" } });
  assert.equal(converted.status, 201, JSON.stringify(converted.json));
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM student_guardians WHERE tenant_id = 'tenant_main' AND student_id = ?").get(converted.json.student.id).count, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM student_group_enrollments WHERE tenant_id = 'tenant_main' AND student_id = ?").get(converted.json.student.id).count, 1);
});

test("Attendance Alerts: only absent/late are considered and missing telegram_chat_id is skipped", async () => {
  const group = await createGroup("Audit Attendance Group");
  const present = await createStudent(group.id, "Present Student");
  const absent = await createStudent(group.id, "Absent Student");
  const late = await createStudent(group.id, "Late Student");
  const excused = await createStudent(group.id, "Excused Student");

  for (const [student, chatId] of [
    [present, "10001"],
    [absent, "10002"],
    [excused, "10004"],
  ]) {
    const chatResponse = await request(`/api/students/${encodeURIComponent(student.id)}/chat-id`, {
      method: "POST",
      cookie: adminCookie,
      body: { chat_id: chatId },
    });
    assert.equal(chatResponse.status, 200, `chat id save failed: ${JSON.stringify(chatResponse.json)}`);
  }

  const lesson = await createLesson(group.id, "12:00 - 13:00");
  let response = await request("/api/attendance", {
    method: "POST",
    cookie: adminCookie,
    body: {
      lessonId: lesson.id,
      records: [
        { studentId: present.id, status: "present" },
        { studentId: absent.id, status: "absent" },
        { studentId: late.id, status: "late" },
        { studentId: excused.id, status: "excused" },
      ],
    },
  });
  assert.equal(response.status, 200, `attendance save failed: ${JSON.stringify(response.json)}`);

  response = await request(`/api/lessons/${encodeURIComponent(lesson.id)}/send-attendance-alerts`, {
    method: "POST",
    cookie: adminCookie,
    body: {},
  });
  assert.equal(response.status, 200, `attendance alerts failed: ${JSON.stringify(response.json)}`);
  assert.equal(response.json.sent_count, 1);
  assert.equal(response.json.skipped_count, 1);

  const queued = getDb()
    .prepare("SELECT student_id FROM messages WHERE tenant_id = 'tenant_main' AND student_id IN (?, ?, ?, ?) ORDER BY student_id")
    .all(present.id, absent.id, late.id, excused.id)
    .map((row) => row.student_id);
  assert.deepEqual(queued, [absent.id], "Only absent student with telegram_chat_id should receive queued alert");
});

test("Lesson Management: one-off isolation, occurrence lifecycle, conflicts and attendance revisions are enforced", async () => {
  const db = getDb();
  assert.ok(
    db.prepare("PRAGMA index_list(lessons)").all().some((index) => index.name === "idx_lessons_schedule_occurrence" && Number(index.unique) === 1),
    "clean databases must enforce unique schedule occurrence identity",
  );
  const username = `lesson.teacher.${Date.now()}`;
  let response = await request("/api/teachers", {
    method: "POST",
    cookie: adminCookie,
    body: {
      name: "Lesson Lifecycle Teacher",
      accessEnabled: true,
      username,
      password: "LessonTeacher123",
      employmentType: "part_time",
      maxWeeklyHours: 20,
    },
  });
  assert.equal(response.status, 201, JSON.stringify(response.json));
  const teacher = response.json;
  const lifecycleTeacherCookie = await login(username, "LessonTeacher123");
  const group = await createRichGroup({
    name: `Lesson Lifecycle ${Date.now()}`,
    teacherId: teacher.id,
    room: `Lifecycle-${Date.now()}`,
    startDate: isoPlusDays(-7),
  });
  const conflictGroup = await createRichGroup({
    name: `Lesson Conflict ${Date.now()}`,
    teacherId: teacher.id,
    room: `Other-${Date.now()}`,
    startDate: isoPlusDays(-7),
  });
  const student = await createStudent(group.id, "Lesson Lifecycle Student");
  response = await request(`/api/students/${encodeURIComponent(student.id)}/chat-id`, {
    method: "POST",
    cookie: adminCookie,
    body: { chat_id: `lesson-chat-${Date.now()}` },
  });
  assert.equal(response.status, 200);

  const schedulesBefore = db.prepare("SELECT COUNT(*) AS count FROM schedules WHERE tenant_id = 'tenant_main'").get().count;
  response = await request("/api/lessons", {
    method: "POST",
    cookie: adminCookie,
    body: { groupId: group.id, date: isoPlusDays(0), time: "03:00 - 04:00", topic: "One-off topic" },
  });
  assert.equal(response.status, 201, JSON.stringify(response.json));
  const oneOff = response.json;
  assert.equal(oneOff.scheduleId, null, "manual lesson must not create or attach a recurring rule");
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM schedules WHERE tenant_id = 'tenant_main'").get().count, schedulesBefore);

  response = await request("/api/lessons", {
    method: "POST",
    cookie: adminCookie,
    body: { groupId: conflictGroup.id, date: isoPlusDays(0), time: "03:30 - 04:30" },
  });
  assert.equal(response.status, 409, "overlapping concrete lesson for the same teacher must be rejected");

  response = await request("/api/lessons", {
    method: "POST",
    cookie: adminCookie,
    body: { groupId: group.id, date: isoPlusDays(1), time: "04:00 - 05:00" },
  });
  assert.equal(response.status, 201, JSON.stringify(response.json));
  const futureLesson = response.json;
  response = await request("/api/attendance", {
    method: "POST",
    cookie: adminCookie,
    body: { lessonId: futureLesson.id, records: [{ studentId: student.id, status: "present" }] },
  });
  assert.equal(response.status, 409, "future lesson must not be completed");

  const weekday = new Date(`${isoPlusDays(0)}T12:00:00.000Z`).getUTCDay() || 7;
  response = await request(`/api/groups/${encodeURIComponent(group.id)}/schedules`, {
    method: "POST",
    cookie: adminCookie,
    body: {
      weekday,
      startTime: "01:00",
      endTime: "02:00",
      teacherId: teacher.id,
      validFrom: group.startDate,
      validUntil: group.endDate,
      status: "active",
    },
  });
  assert.equal(response.status, 201, JSON.stringify(response.json));
  const schedule = response.json;

  response = await request("/api/lesson-occurrences", {
    method: "POST",
    cookie: lifecycleTeacherCookie,
    body: { scheduleId: schedule.id, date: isoPlusDays(0) },
  });
  assert.equal(response.status, 201, JSON.stringify(response.json));
  let occurrence = response.json;
  assert.equal(occurrence.scheduleId, schedule.id);
  assert.equal(occurrence.teacherId, teacher.id, "occurrence must snapshot schedule teacher");
  assert.equal(occurrence.occurrenceDate, isoPlusDays(0));

  response = await request("/api/lesson-occurrences", {
    method: "POST",
    cookie: lifecycleTeacherCookie,
    body: { scheduleId: schedule.id, date: isoPlusDays(0) },
  });
  assert.equal(response.status, 409, "same schedule occurrence must be materialized once");

  response = await request(`/api/lessons/${encodeURIComponent(occurrence.id)}/cancel`, {
    method: "POST",
    cookie: lifecycleTeacherCookie,
    body: { reason: "Teacher cannot cancel" },
  });
  assert.equal(response.status, 403);
  response = await request(`/api/lessons/${encodeURIComponent(occurrence.id)}/cancel`, {
    method: "POST",
    cookie: adminCookie,
    body: { reason: "Center closed" },
  });
  assert.equal(response.status, 200, JSON.stringify(response.json));
  assert.equal(response.json.status, "cancelled");
  assert.equal(response.json.cancelledReason, "Center closed");
  response = await request("/api/attendance", {
    method: "POST",
    cookie: adminCookie,
    body: { lessonId: occurrence.id, records: [{ studentId: student.id, status: "present" }] },
  });
  assert.equal(response.status, 409, "cancelled lesson must not be completed");

  const week = await request(`/api/schedules/week?date=${encodeURIComponent(isoPlusDays(0))}`, { cookie: adminCookie });
  assert.equal(week.status, 200);
  assert.equal(week.json.filter((item) => Number(item.schedule_id) === Number(schedule.id)).length, 1, "cancelled occurrence must suppress its virtual duplicate");
  assert.ok(week.json.some((item) => item.id === occurrence.id && item.status === "cancelled"));

  response = await request(`/api/lessons/${encodeURIComponent(occurrence.id)}/restore`, {
    method: "POST",
    cookie: adminCookie,
    body: {},
  });
  assert.equal(response.status, 200, JSON.stringify(response.json));
  assert.equal(response.json.status, "planned");

  response = await request(`/api/lessons/${encodeURIComponent(occurrence.id)}`, {
    method: "PUT",
    cookie: adminCookie,
    body: { date: occurrence.date, time: "01:15 - 02:15", teacherId: teacher.id, roomName: group.room, version: response.json.version },
  });
  assert.equal(response.status, 422, "reschedule reason must be mandatory");
  const currentProfile = await request(`/api/lessons/${encodeURIComponent(occurrence.id)}`, { cookie: adminCookie });
  response = await request(`/api/lessons/${encodeURIComponent(occurrence.id)}`, {
    method: "PUT",
    cookie: adminCookie,
    body: {
      date: occurrence.date,
      time: "01:15 - 02:15",
      teacherId: teacher.id,
      roomName: group.room,
      reason: "Parent request",
      version: currentProfile.json.lesson.version,
    },
  });
  assert.equal(response.status, 200, JSON.stringify(response.json));
  occurrence = response.json;
  assert.equal(occurrence.startTime, "01:15");

  response = await request("/api/attendance", {
    method: "POST",
    cookie: lifecycleTeacherCookie,
    body: { lessonId: occurrence.id, records: [] },
  });
  assert.equal(response.status, 422, "partial lesson roster must not be finalized");
  response = await request("/api/attendance", {
    method: "POST",
    cookie: lifecycleTeacherCookie,
    body: {
      lessonId: occurrence.id,
      records: [
        { studentId: student.id, status: "present" },
        { studentId: student.id, status: "absent" },
      ],
    },
  });
  assert.equal(response.status, 422, "duplicate roster rows must be rejected");
  response = await request("/api/attendance-reasons", {
    method: "POST",
    cookie: adminCookie,
    body: {
      code: `present_review_${Date.now()}`,
      name: "Present after review",
      attendanceStatus: "present",
      chargePercent: 100,
      consumePercent: 100,
    },
  });
  assert.equal(response.status, 201, JSON.stringify(response.json));
  const historicalReason = response.json;
  response = await request("/api/attendance", {
    method: "POST",
    cookie: lifecycleTeacherCookie,
    body: {
      lessonId: occurrence.id,
      topic: "Fractions",
      homework: "Exercises 1-5",
      lessonNote: "Strong participation",
      records: [{ studentId: student.id, status: "present", reasonId: historicalReason.id, note: "Answered at the board" }],
    },
  });
  assert.equal(response.status, 200, JSON.stringify(response.json));
  assert.equal(response.json.lesson.status, "completed");
  assert.equal(response.json.lesson.attendanceVersion, 1);
  assert.equal(response.json.lesson.topic, "Fractions");
  assert.equal(response.json.lesson.homework, "Exercises 1-5");
  assert.equal(response.json.lesson.note, "Strong participation");
  response = await request(`/api/attendance-reasons/${encodeURIComponent(historicalReason.id)}`, {
    method: "PATCH",
    cookie: adminCookie,
    body: { isActive: false },
  });
  assert.equal(response.status, 200, JSON.stringify(response.json));
  const completedRoster = await request(`/api/lessons/${encodeURIComponent(occurrence.id)}/students`, { cookie: lifecycleTeacherCookie });
  assert.equal(completedRoster.status, 200, JSON.stringify(completedRoster.json));
  assert.equal(completedRoster.json.students[0].attendanceNote, "Answered at the board");
  assert.equal(completedRoster.json.students[0].attendanceReasonName, "Present after review", "teacher roster must expose a deactivated historical reason snapshot");
  response = await request("/api/attendance", {
    method: "POST",
    cookie: adminCookie,
    body: {
      lessonId: occurrence.id,
      correctionReason: "Clarified lesson note",
      records: [{ studentId: student.id, status: "present", reasonId: historicalReason.id, note: "Answered two questions" }],
    },
  });
  assert.equal(response.status, 200, JSON.stringify(response.json));
  assert.equal(response.json.lesson.attendanceVersion, 2, "admin may preserve an inactive historical reason while correcting another field");

  response = await request("/api/attendance", {
    method: "POST",
    cookie: lifecycleTeacherCookie,
    body: { lessonId: occurrence.id, correctionReason: "Teacher correction", records: [{ studentId: student.id, status: "absent" }] },
  });
  assert.equal(response.status, 403, "teacher must not rewrite finalized attendance");
  response = await request("/api/attendance", {
    method: "POST",
    cookie: adminCookie,
    body: { lessonId: occurrence.id, records: [{ studentId: student.id, status: "absent" }] },
  });
  assert.equal(response.status, 422, "admin correction needs a reason");
  response = await request("/api/attendance", {
    method: "POST",
    cookie: adminCookie,
    body: { lessonId: occurrence.id, correctionReason: "Verified guardian call", records: [{ studentId: student.id, status: "absent" }] },
  });
  assert.equal(response.status, 200, JSON.stringify(response.json));
  assert.equal(response.json.lesson.attendanceVersion, 3);

  const firstAlert = await request(`/api/lessons/${encodeURIComponent(occurrence.id)}/send-attendance-alerts`, {
    method: "POST",
    cookie: adminCookie,
    body: {},
  });
  const repeatedAlert = await request(`/api/lessons/${encodeURIComponent(occurrence.id)}/send-attendance-alerts`, {
    method: "POST",
    cookie: adminCookie,
    body: {},
  });
  assert.equal(firstAlert.status, 200, JSON.stringify(firstAlert.json));
  assert.equal(firstAlert.json.sent_count, 1);
  assert.equal(repeatedAlert.status, 200, JSON.stringify(repeatedAlert.json));
  assert.equal(repeatedAlert.json.sent_count, 0);
  assert.equal(repeatedAlert.json.already_queued_count, 1, "repeated alert must be idempotent for one attendance revision");

  const profile = await request(`/api/lessons/${encodeURIComponent(occurrence.id)}`, { cookie: adminCookie });
  assert.equal(profile.status, 200, JSON.stringify(profile.json));
  assert.equal(profile.json.attendanceRevisions.length, 3, "attendance correction history must remain append-only");
  assert.ok(profile.json.events.some((event) => event.action === "cancelled"));
  assert.ok(profile.json.events.some((event) => event.action === "restored"));
  assert.ok(profile.json.events.some((event) => event.action === "rescheduled"));
  assert.ok(profile.json.events.some((event) => event.action === "attendance_corrected"));
});

test("P1 Lesson Finance: preview, atomic confirmation, idempotency, reversal and closed periods are enforced", async () => {
  const db = getDb();
  let response = await request("/api/teachers", {
    method: "POST",
    cookie: adminCookie,
    body: { name: `P1 Finance Teacher ${Date.now()}`, employmentType: "contract", maxWeeklyHours: 20 },
  });
  assert.equal(response.status, 201, JSON.stringify(response.json));
  const teacher = response.json;
  const group = await createRichGroup({
    name: `P1 Finance Group ${Date.now()}`,
    teacherId: teacher.id,
    startDate: isoPlusDays(-2),
  });
  const chargedStudent = await createStudent(group.id, "P1 Charged Student");
  const excusedStudent = await createStudent(group.id, "P1 Excused Student");
  response = await request("/api/lessons", {
    method: "POST",
    cookie: adminCookie,
    body: { groupId: group.id, date: isoPlusDays(0), time: "22:00 - 22:45" },
  });
  assert.equal(response.status, 201, JSON.stringify(response.json));
  let lesson = response.json;
  const ledgerBefore = db.prepare("SELECT COUNT(*) AS count FROM invoices_transactions WHERE tenant_id = 'tenant_main'").get().count;
  response = await request("/api/attendance", {
    method: "POST",
    cookie: adminCookie,
    body: {
      lessonId: lesson.id,
      records: [
        { studentId: chargedStudent.id, status: "present" },
        { studentId: excusedStudent.id, status: "excused" },
      ],
    },
  });
  assert.equal(response.status, 200, JSON.stringify(response.json));
  lesson = response.json.lesson;
  assert.equal(lesson.financialStatus, "pending");
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM invoices_transactions WHERE tenant_id = 'tenant_main'").get().count, ledgerBefore, "attendance must not post money");

  response = await request(`/api/lessons/${encodeURIComponent(lesson.id)}/finance-preview`, { cookie: adminCookie });
  assert.equal(response.status, 200, JSON.stringify(response.json));
  assert.equal(response.json.readyToConfirm, false);
  assert.deepEqual(new Set(response.json.blockers.map((item) => item.code)), new Set(["billing_policy_missing", "teacher_rate_missing"]));
  const missingConfigBody = {
    attendanceVersion: lesson.attendanceVersion,
    lessonVersion: lesson.version,
    idempotencyKey: `p1-missing-${Date.now()}`,
  };
  response = await request(`/api/lessons/${encodeURIComponent(lesson.id)}/confirm-finance`, {
    method: "POST",
    cookie: adminCookie,
    body: missingConfigBody,
  });
  assert.equal(response.status, 409, "missing config must block all financial writes");
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM lesson_financial_settlements WHERE lesson_id = ?").get(lesson.id).count, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM invoices_transactions WHERE tenant_id = 'tenant_main'").get().count, ledgerBefore);

  response = await request("/api/finance/lesson-billing-policies", {
    method: "POST",
    cookie: adminCookie,
    body: {
      groupId: group.id,
      name: "P1 explicit per-lesson tariff",
      baseAmount: 100000,
      validFrom: isoPlusDays(-1),
    },
  });
  assert.equal(response.status, 201, JSON.stringify(response.json));
  response = await request("/api/finance/teacher-rate-rules", {
    method: "POST",
    cookie: adminCookie,
    body: {
      teacherId: teacher.id,
      groupId: group.id,
      rateType: "flat",
      amount: 50000,
      effectiveFrom: isoPlusDays(-1),
    },
  });
  assert.equal(response.status, 201, JSON.stringify(response.json));

  response = await request(`/api/lessons/${encodeURIComponent(lesson.id)}/finance-preview`, { cookie: adminCookie });
  assert.equal(response.status, 200, JSON.stringify(response.json));
  const preview = response.json;
  assert.equal(preview.readyToConfirm, true, JSON.stringify(preview.blockers));
  assert.equal(preview.totals.studentCharges, 100000);
  assert.equal(preview.totals.teacherAccrual, 50000);
  assert.deepEqual(preview.studentLines.map((line) => line.chargeAmount).sort((a, b) => a - b), [0, 100000]);

  const confirmBody = {
    attendanceVersion: preview.attendanceVersion,
    lessonVersion: preview.lessonVersion,
    idempotencyKey: `p1-confirm-${Date.now()}`,
  };
  response = await request(`/api/lessons/${encodeURIComponent(lesson.id)}/confirm-finance`, {
    method: "POST",
    cookie: adminCookie,
    body: confirmBody,
  });
  assert.equal(response.status, 200, JSON.stringify(response.json));
  assert.equal(response.json.lesson.financialStatus, "posted");
  const settlement = response.json.settlement;
  assert.ok(settlement?.id);
  assert.equal(response.json.postings.length, 2, "zero charge decisions must also be persisted");
  assert.equal(response.json.accruals.filter((entry) => entry.entryType === "accrual").length, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM invoices_transactions WHERE tenant_id = 'tenant_main'").get().count, ledgerBefore + 1);
  assert.equal(db.prepare("SELECT balance FROM students WHERE tenant_id = 'tenant_main' AND id = ?").get(chargedStudent.id).balance, -100000);
  assert.equal(db.prepare("SELECT balance FROM students WHERE tenant_id = 'tenant_main' AND id = ?").get(excusedStudent.id).balance, 0);

  const countsAfterConfirm = {
    ledger: db.prepare("SELECT COUNT(*) AS count FROM invoices_transactions WHERE tenant_id = 'tenant_main'").get().count,
    settlement: db.prepare("SELECT COUNT(*) AS count FROM lesson_financial_settlements WHERE lesson_id = ?").get(lesson.id).count,
    postings: db.prepare("SELECT COUNT(*) AS count FROM lesson_student_postings WHERE lesson_id = ?").get(lesson.id).count,
    accruals: db.prepare("SELECT COUNT(*) AS count FROM teacher_accruals WHERE lesson_id = ?").get(lesson.id).count,
  };
  response = await request(`/api/lessons/${encodeURIComponent(lesson.id)}/confirm-finance`, {
    method: "POST",
    cookie: adminCookie,
    body: confirmBody,
  });
  assert.equal(response.status, 200, JSON.stringify(response.json));
  assert.equal(response.json.reused, true);
  assert.deepEqual({
    ledger: db.prepare("SELECT COUNT(*) AS count FROM invoices_transactions WHERE tenant_id = 'tenant_main'").get().count,
    settlement: db.prepare("SELECT COUNT(*) AS count FROM lesson_financial_settlements WHERE lesson_id = ?").get(lesson.id).count,
    postings: db.prepare("SELECT COUNT(*) AS count FROM lesson_student_postings WHERE lesson_id = ?").get(lesson.id).count,
    accruals: db.prepare("SELECT COUNT(*) AS count FROM teacher_accruals WHERE lesson_id = ?").get(lesson.id).count,
  }, countsAfterConfirm, "confirmation retry created duplicate financial rows");
  response = await request(`/api/lessons/${encodeURIComponent(lesson.id)}/confirm-finance`, {
    method: "POST",
    cookie: adminCookie,
    body: { ...confirmBody, attendanceVersion: confirmBody.attendanceVersion + 1 },
  });
  assert.equal(response.status, 409, "same key with a changed payload must be rejected");

  response = await request("/api/attendance", {
    method: "POST",
    cookie: adminCookie,
    body: {
      lessonId: lesson.id,
      correctionReason: "Must reverse first",
      records: [
        { studentId: chargedStudent.id, status: "excused" },
        { studentId: excusedStudent.id, status: "present" },
      ],
    },
  });
  assert.equal(response.status, 409, "active settlement must block attendance correction");

  const reverseBody = {
    settlementVersion: settlement.version,
    reason: "Verified finance correction",
    idempotencyKey: `p1-reverse-${Date.now()}`,
  };
  response = await request(`/api/lessons/${encodeURIComponent(lesson.id)}/reverse-finance`, {
    method: "POST",
    cookie: adminCookie,
    body: reverseBody,
  });
  assert.equal(response.status, 200, JSON.stringify(response.json));
  assert.equal(response.json.lesson.financialStatus, "reversed");
  assert.equal(db.prepare("SELECT balance FROM students WHERE tenant_id = 'tenant_main' AND id = ?").get(chargedStudent.id).balance, 0);
  const lessonTransactions = db
    .prepare("SELECT type, effect, status, reversal_of_id FROM invoices_transactions WHERE tenant_id = 'tenant_main' AND source_id = ? ORDER BY id")
    .all(settlement.id);
  assert.equal(lessonTransactions.length, 2);
  assert.deepEqual(lessonTransactions.map((row) => row.effect), ["debit", "credit"]);
  assert.ok(lessonTransactions[1].reversal_of_id, "reversal must directly reference the original ledger row");
  assert.ok(lessonTransactions.every((row) => row.status === "active"), "original or reversal was voided instead of preserved");
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM teacher_accruals WHERE lesson_id = ? AND entry_type = 'reversal'").get(lesson.id).count, 1);

  const countsAfterReverse = {
    ledger: db.prepare("SELECT COUNT(*) AS count FROM invoices_transactions WHERE tenant_id = 'tenant_main'").get().count,
    accruals: db.prepare("SELECT COUNT(*) AS count FROM teacher_accruals WHERE lesson_id = ?").get(lesson.id).count,
  };
  response = await request(`/api/lessons/${encodeURIComponent(lesson.id)}/reverse-finance`, {
    method: "POST",
    cookie: adminCookie,
    body: reverseBody,
  });
  assert.equal(response.status, 200, JSON.stringify(response.json));
  assert.equal(response.json.reused, true);
  assert.deepEqual({
    ledger: db.prepare("SELECT COUNT(*) AS count FROM invoices_transactions WHERE tenant_id = 'tenant_main'").get().count,
    accruals: db.prepare("SELECT COUNT(*) AS count FROM teacher_accruals WHERE lesson_id = ?").get(lesson.id).count,
  }, countsAfterReverse, "reversal retry created duplicate entries");

  response = await request(`/api/lessons/${encodeURIComponent(lesson.id)}/reopen`, {
    method: "POST",
    cookie: adminCookie,
    body: { reason: "Attendance must be retaken" },
  });
  assert.equal(response.status, 200, JSON.stringify(response.json));
  assert.equal(response.json.status, "planned");
  assert.equal(response.json.financialStatus, "reversed");
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM attendance WHERE tenant_id = 'tenant_main' AND lesson_id = ?").get(lesson.id).count, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM lesson_attendance_revisions WHERE tenant_id = 'tenant_main' AND lesson_id = ?").get(lesson.id).count, 1, "reopen deleted immutable attendance history");
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM lesson_financial_settlements WHERE tenant_id = 'tenant_main' AND lesson_id = ? AND status = 'reversed'").get(lesson.id).count, 1);

  const closedDate = isoPlusDays(-30);
  response = await request("/api/finance/periods", {
    method: "POST",
    cookie: adminCookie,
    body: { label: "P1 closed day", startDate: closedDate, endDate: closedDate },
  });
  assert.equal(response.status, 201, JSON.stringify(response.json));
  const period = response.json;
  response = await request(`/api/finance/periods/${encodeURIComponent(period.id)}/close`, {
    method: "POST",
    cookie: adminCookie,
    body: { reason: "Daily close" },
  });
  assert.equal(response.status, 200, JSON.stringify(response.json));
  assert.equal(response.json.status, "closed");
  response = await request(`/api/students/${encodeURIComponent(chargedStudent.id)}/transactions`, {
    method: "POST",
    cookie: adminCookie,
    body: { type: "charge", amount: 1, invoiceDate: closedDate, description: "Must be blocked" },
  });
  assert.equal(response.status, 409, "closed period must block manual ledger mutation");
  response = await request(`/api/finance/periods/${encodeURIComponent(period.id)}/reopen`, {
    method: "POST",
    cookie: adminCookie,
    body: { reason: "Approved correction window" },
  });
  assert.equal(response.status, 200, JSON.stringify(response.json));
  assert.equal(response.json.status, "open");
});

test("Telegram Queue Recovery: stale processing messages are not left stuck forever", async () => {
  const messageId = `audit_stale_processing_${Date.now()}`;
  const staleAt = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  getDb()
    .prepare(
      `INSERT INTO messages (id, tenant_id, recipient, channel, text, status, attempts, created_at, sent_at, processing_started_at)
       VALUES (?, 'tenant_main', 'Missing Chat', 'telegram', 'stale message', 'processing', 5, ?, 'processing:stale', ?)`,
    )
    .run(messageId, staleAt, staleAt);

  const response = await request("/api/messages/process", { method: "POST", cookie: adminCookie, body: {} });
  assert.equal(response.status, 200, `process messages failed: ${JSON.stringify(response.json)}`);

  const row = getDb().prepare("SELECT status, processing_started_at FROM messages WHERE id = ?").get(messageId);
  assert.equal(row.status, "failed", "stale processing message with exhausted attempts must become failed");
  assert.equal(row.processing_started_at, null, "recovered message must clear processing_started_at");
});

test("Group Management: rich profile uses real membership, attendance and finance aggregates", async () => {
  const db = getDb();
  const group = await createRichGroup({ name: `Audit Aggregate Group ${Date.now()}`, capacity: 1, monthlyFee: 220000 });
  assert.equal(group.description, "Regression-tested group profile");
  assert.equal(group.level, "A2");
  assert.equal(group.capacity, 1);
  assert.equal(group.status, "active");
  assert.equal(group.color, "#2563EB");
  assert.ok(group.createdAt);

  const member = await createStudent(group.id, "Audit Aggregate Member");
  db.prepare("UPDATE students SET enrollment_date = ? WHERE tenant_id = 'tenant_main' AND id = ?").run(isoPlusDays(-2), member.id);
  db.prepare("UPDATE student_group_enrollments SET start_date = ? WHERE tenant_id = 'tenant_main' AND student_id = ? AND group_id = ? AND status = 'active'")
    .run(isoPlusDays(-2), member.id, group.id);
  const extraMember = await request("/api/students", {
    method: "POST",
    cookie: adminCookie,
    body: {
      name: "Audit Capacity Overflow",
      groupId: group.id,
      parentName: "Overflow Parent",
      phone: "+998901234000",
    },
  });
  assert.equal(extraMember.status, 409, `group capacity must reject an extra active enrollment: ${JSON.stringify(extraMember.json)}`);
  assert.equal(
    db.prepare("SELECT COUNT(*) AS count FROM student_group_enrollments WHERE tenant_id = ? AND group_id = ? AND status = 'active'").get("tenant_main", group.id).count,
    1,
    "capacity rejection left a partial enrollment",
  );

  let response = await request(`/api/students/${encodeURIComponent(member.id)}/transactions`, {
    method: "POST",
    cookie: adminCookie,
    body: { type: "charge", amount: 100000, description: "Group aggregate charge" },
  });
  assert.equal(response.status, 201, JSON.stringify(response.json));
  response = await request(`/api/students/${encodeURIComponent(member.id)}/transactions`, {
    method: "POST",
    cookie: adminCookie,
    body: { type: "payment", amount: 40000, method: "cash", description: "Group aggregate payment", idempotencyKey: `group-profile-${group.id}` },
  });
  assert.equal(response.status, 201, JSON.stringify(response.json));

  const lessonResponse = await request("/api/lessons", {
    method: "POST",
    cookie: adminCookie,
    body: { groupId: group.id, date: isoPlusDays(-1), time: "11:15 - 12:15" },
  });
  assert.equal(lessonResponse.status, 201, JSON.stringify(lessonResponse.json));
  response = await request("/api/attendance", {
    method: "POST",
    cookie: adminCookie,
    body: { lessonId: lessonResponse.json.id, records: [{ studentId: member.id, status: "present" }] },
  });
  assert.equal(response.status, 200, JSON.stringify(response.json));

  response = await request(`/api/groups/${encodeURIComponent(group.id)}/profile`, { cookie: adminCookie });
  assert.equal(response.status, 200, JSON.stringify(response.json));
  const profile = response.json;
  assert.equal(profile.group.id, group.id);
  assert.equal(profile.group.studentsCount, 1);
  assert.equal(profile.group.capacity, 1);
  assert.ok(profile.members.active.some((student) => student.id === member.id));
  assert.ok(profile.teacherAssignments.some((assignment) => assignment.teacherId === "user_teacher" && assignment.status === "active"));
  assert.ok(profile.lessons.recent.some((lesson) => lesson.id === lessonResponse.json.id));
  assert.equal(profile.lessons.summary.completed, 1);
  assert.equal(profile.attendance.summary.present, 1);
  assert.equal(profile.attendance.summary.rate, 100);
  assert.equal(profile.finance.monthlyPotential, 220000);
  assert.equal(profile.finance.charged, 100000);
  assert.equal(profile.finance.paid, 40000);
  assert.equal(profile.finance.outstanding, 60000);
  assert.ok(profile.finance.debtors.some((student) => student.id === member.id && student.debt === 60000));

  const teacherProfile = await request(`/api/groups/${encodeURIComponent(group.id)}/profile`, { cookie: teacherCookie });
  assert.equal(teacherProfile.status, 200, JSON.stringify(teacherProfile.json));
  assertOmitsKeysDeep(
    teacherProfile.json,
    new Set(["monthlyFee", "finance", "debt", "balance", "payments", "subscriptions", "telegramChatId"]),
    "teacher group profile",
  );
});

test("Group Schedule P1-B: scoped preview/apply versions rules without rewriting occurrences", async () => {
  const weekday = new Date(`${isoPlusDays(0)}T12:00:00.000Z`).getUTCDay() || 7;
  const group = await createRichGroup({ name: `Audit Schedule Group ${Date.now()}`, teacherId: "teacher_bekzod" });
  const otherGroup = await createRichGroup({ name: `Audit Schedule Conflict Group ${Date.now()}`, teacherId: "teacher_bekzod" });
  const validPayload = {
    weekday,
    startTime: "08:00",
    endTime: "09:00",
    teacherId: "teacher_bekzod",
    validFrom: group.startDate,
    validUntil: group.endDate,
    status: "active",
    lessonLink: "https://meet.google.com/audit-group",
  };

  let response = await request(`/api/groups/${encodeURIComponent(group.id)}/schedules`, {
    method: "POST",
    cookie: adminCookie,
    body: { ...validPayload, validFrom: isoPlusDays(-8) },
  });
  assert.equal(response.status, 422, "schedule cannot start before its group");
  response = await request(`/api/groups/${encodeURIComponent(group.id)}/schedules`, {
    method: "POST",
    cookie: adminCookie,
    body: { ...validPayload, validUntil: isoPlusDays(91) },
  });
  assert.equal(response.status, 422, "schedule cannot end after its group");
  response = await request(`/api/groups/${encodeURIComponent(group.id)}/schedules`, {
    method: "POST",
    cookie: adminCookie,
    body: { ...validPayload, endTime: "08:00" },
  });
  assert.equal(response.status, 422, "schedule end must be after start");

  response = await request(`/api/groups/${encodeURIComponent(group.id)}/schedules`, {
    method: "POST",
    cookie: adminCookie,
    body: validPayload,
  });
  assert.equal(response.status, 201, JSON.stringify(response.json));
  const schedule = response.json;
  assert.equal(schedule.groupId, group.id);
  assert.equal(schedule.status, "active");

  const duplicate = await request(`/api/groups/${encodeURIComponent(group.id)}/schedules`, {
    method: "POST",
    cookie: adminCookie,
    body: validPayload,
  });
  assert.equal(duplicate.status, 409, "exact recurring rule must be rejected instead of duplicated");
  const groupOverlap = await request(`/api/groups/${encodeURIComponent(group.id)}/schedules`, {
    method: "POST",
    cookie: adminCookie,
    body: { ...validPayload, startTime: "08:30", endTime: "09:30" },
  });
  assert.equal(groupOverlap.status, 409, "overlapping schedule for one group must be rejected");
  const teacherOverlap = await request(`/api/groups/${encodeURIComponent(otherGroup.id)}/schedules`, {
    method: "POST",
    cookie: adminCookie,
    body: { ...validPayload, validFrom: otherGroup.startDate, validUntil: otherGroup.endDate, startTime: "08:15", endTime: "08:45" },
  });
  assert.equal(teacherOverlap.status, 409, "overlapping schedule for one teacher must be rejected");

  response = await request(`/api/groups/${encodeURIComponent(group.id)}/schedules`, { cookie: adminCookie });
  assert.equal(response.status, 200);
  assert.equal(response.json.schedules.filter((item) => item.id === schedule.id).length, 1);
  assert.ok(schedule.seriesId);
  assert.equal(schedule.seriesVersion, 1);

  const directUpdate = await request(`/api/group-schedules/${encodeURIComponent(schedule.id)}`, {
    method: "PUT",
    cookie: adminCookie,
    body: { ...validPayload, endTime: "09:15" },
  });
  assert.equal(directUpdate.status, 422, "legacy PUT must not bypass schedule lineage");

  const occurrenceRequest = {
    scope: "this_occurrence",
    occurrenceDate: isoPlusDays(0),
    version: schedule.seriesVersion,
    patch: { endTime: "09:15" },
    reason: "P1-B occurrence exception regression",
  };
  response = await request(`/api/group-schedules/${encodeURIComponent(schedule.id)}/changes/preview`, {
    method: "POST",
    cookie: adminCookie,
    body: occurrenceRequest,
  });
  assert.equal(response.status, 200, JSON.stringify(response.json));
  assert.equal(response.json.canApply, true);
  assert.equal(response.json.impact.createsOccurrenceException, true);
  assert.equal(
    getDb().prepare("SELECT COUNT(*) AS count FROM lessons WHERE tenant_id = ? AND schedule_series_id = ?").get("tenant_main", schedule.seriesId).count,
    0,
    "preview must not materialize the occurrence",
  );

  const occurrenceIdempotencyKey = `schedule-occurrence-${schedule.id}-${Date.now()}`;
  response = await request(`/api/group-schedules/${encodeURIComponent(schedule.id)}/changes`, {
    method: "POST",
    cookie: adminCookie,
    body: { ...occurrenceRequest, idempotencyKey: occurrenceIdempotencyKey },
  });
  assert.equal(response.status, 200, JSON.stringify(response.json));
  assert.equal(response.json.lesson.endTime, "09:15");
  assert.equal(response.json.lesson.scheduleSeriesId, schedule.seriesId);
  assert.equal(response.json.lesson.overrideMask, 2);
  const occurrenceLessonId = response.json.lesson.id;
  let weekResponse = await request(`/api/schedules/week?date=${encodeURIComponent(isoPlusDays(0))}`, { cookie: adminCookie });
  assert.equal(weekResponse.status, 200, JSON.stringify(weekResponse.json));
  let seriesRows = weekResponse.json.filter((row) => row.schedule_series_id === schedule.seriesId);
  assert.equal(seriesRows.length, 1, "materialized exception must suppress its virtual series occurrence");
  assert.equal(seriesRows[0].id, occurrenceLessonId);

  const replay = await request(`/api/group-schedules/${encodeURIComponent(schedule.id)}/changes`, {
    method: "POST",
    cookie: adminCookie,
    body: { ...occurrenceRequest, idempotencyKey: occurrenceIdempotencyKey },
  });
  assert.equal(replay.status, 200, JSON.stringify(replay.json));
  assert.equal(replay.json.reused, true, "same idempotency key must replay the original occurrence result");
  assert.equal(
    getDb().prepare("SELECT COUNT(*) AS count FROM lessons WHERE tenant_id = ? AND id = ?").get("tenant_main", occurrenceLessonId).count,
    1,
  );

  const defaultFutureOccurrence = await request("/api/lesson-occurrences", {
    method: "POST",
    cookie: adminCookie,
    body: { scheduleId: schedule.id, date: isoPlusDays(7) },
  });
  assert.equal(defaultFutureOccurrence.status, 201, JSON.stringify(defaultFutureOccurrence.json));
  assert.equal(defaultFutureOccurrence.json.overrideMask, 0);

  const futureRequest = {
    scope: "this_and_future",
    occurrenceDate: isoPlusDays(0),
    version: schedule.seriesVersion,
    patch: { endTime: "09:30" },
    reason: "P1-B series version regression",
  };
  response = await request(`/api/group-schedules/${encodeURIComponent(schedule.id)}/changes/preview`, {
    method: "POST",
    cookie: adminCookie,
    body: futureRequest,
  });
  assert.equal(response.status, 200, JSON.stringify(response.json));
  assert.equal(response.json.impact.closesSeriesVersion, true);
  assert.equal(response.json.impact.createsSeriesVersion, true);
  assert.equal(response.json.impact.materializedLessonsPreserved, 2);

  const futureIdempotencyKey = `schedule-future-${schedule.id}-${Date.now()}`;
  response = await request(`/api/group-schedules/${encodeURIComponent(schedule.id)}/changes`, {
    method: "POST",
    cookie: adminCookie,
    body: { ...futureRequest, idempotencyKey: futureIdempotencyKey },
  });
  assert.equal(response.status, 200, JSON.stringify(response.json));
  const successor = response.json.schedule;
  assert.equal(successor.seriesId, schedule.seriesId);
  assert.equal(successor.seriesVersion, 2);
  assert.equal(successor.supersedesScheduleId, schedule.id);
  assert.equal(successor.endTime, "09:30");
  assert.equal(response.json.predecessor.status, "inactive");
  const propagatedOverride = getDb()
    .prepare("SELECT schedule_id, base_schedule_id, base_schedule_version, end_time, override_mask FROM lessons WHERE tenant_id = ? AND id = ?")
    .get("tenant_main", occurrenceLessonId);
  assert.equal(propagatedOverride.schedule_id, successor.id);
  assert.equal(propagatedOverride.base_schedule_id, successor.id);
  assert.equal(propagatedOverride.base_schedule_version, 2);
  assert.equal(propagatedOverride.end_time, "09:15", "masked occurrence time must survive the future series change");
  assert.equal(propagatedOverride.override_mask, 2);
  const propagatedDefault = getDb()
    .prepare("SELECT schedule_id, base_schedule_id, base_schedule_version, end_time, override_mask FROM lessons WHERE tenant_id = ? AND id = ?")
    .get("tenant_main", defaultFutureOccurrence.json.id);
  assert.equal(propagatedDefault.schedule_id, successor.id);
  assert.equal(propagatedDefault.base_schedule_id, successor.id);
  assert.equal(propagatedDefault.base_schedule_version, 2);
  assert.equal(propagatedDefault.end_time, "09:30", "unmasked future occurrence must follow successor defaults");
  assert.equal(propagatedDefault.override_mask, 0);

  const unsafeGroupTeacherRewrite = await request(`/api/groups/${encodeURIComponent(group.id)}`, {
    method: "PUT",
    cookie: adminCookie,
    body: { ...group, teacherId: "user_teacher" },
  });
  assert.equal(unsafeGroupTeacherRewrite.status, 409, "group edit must not rewrite an active schedule teacher in place");
  assert.ok(unsafeGroupTeacherRewrite.json.details.scheduleIds.includes(successor.id));
  weekResponse = await request(`/api/schedules/week?date=${encodeURIComponent(isoPlusDays(0))}`, { cookie: adminCookie });
  seriesRows = weekResponse.json.filter((row) => row.schedule_series_id === schedule.seriesId);
  assert.equal(seriesRows.length, 1, "cross-version series key must prevent a duplicate virtual occurrence");
  assert.equal(seriesRows[0].id, occurrenceLessonId);

  const futureReplay = await request(`/api/group-schedules/${encodeURIComponent(schedule.id)}/changes`, {
    method: "POST",
    cookie: adminCookie,
    body: { ...futureRequest, idempotencyKey: futureIdempotencyKey },
  });
  assert.equal(futureReplay.status, 200, JSON.stringify(futureReplay.json));
  assert.equal(futureReplay.json.reused, true, "same idempotency key must replay the original series result");

  response = await request(`/api/group-schedules/${encodeURIComponent(successor.id)}/changes`, {
    method: "POST",
    cookie: adminCookie,
    body: {
      scope: "this_and_future",
      occurrenceDate: isoPlusDays(14),
      version: successor.seriesVersion,
      patch: { status: "inactive" },
      reason: "P1-B controlled series stop",
      idempotencyKey: `schedule-stop-${successor.id}-${Date.now()}`,
    },
  });
  assert.equal(response.status, 200, JSON.stringify(response.json));
  assert.equal(response.json.schedule, null);
  assert.equal(response.json.predecessor.status, "inactive");
  assert.equal(
    getDb().prepare("SELECT COUNT(*) AS count FROM schedules WHERE tenant_id = ? AND series_id = ?").get("tenant_main", schedule.seriesId).count,
    2,
    "series changes must preserve predecessor and successor rows",
  );
  assert.equal(
    getDb().prepare("SELECT COUNT(*) AS count FROM schedule_events WHERE tenant_id = ? AND series_id = ?").get("tenant_main", schedule.seriesId).count,
    3,
    "every applied schedule change must append an audit event",
  );
});

test("Group Lifecycle: blockers are explicit and archive/restore preserves the group row and history", async () => {
  const db = getDb();
  const memberGroup = await createRichGroup({ name: `Audit Member Blocker ${Date.now()}` });
  await createStudent(memberGroup.id, "Audit Archive Blocker Student");
  let response = await request(`/api/groups/${encodeURIComponent(memberGroup.id)}`, {
    method: "DELETE",
    cookie: adminCookie,
    body: { reason: "Should be blocked" },
  });
  assert.equal(response.status, 409, "group with an active member must not be archived");
  assert.equal(db.prepare("SELECT status FROM groups WHERE tenant_id = ? AND id = ?").get("tenant_main", memberGroup.id).status, "active");

  const lessonGroup = await createRichGroup({ name: `Audit Lesson Blocker ${Date.now()}` });
  const futureLesson = await request("/api/lessons", {
    method: "POST",
    cookie: adminCookie,
    body: { groupId: lessonGroup.id, date: isoPlusDays(7), time: "13:00 - 14:00" },
  });
  assert.equal(futureLesson.status, 201, JSON.stringify(futureLesson.json));
  response = await request(`/api/groups/${encodeURIComponent(lessonGroup.id)}`, {
    method: "DELETE",
    cookie: adminCookie,
    body: { reason: "Should also be blocked" },
  });
  assert.equal(response.status, 409, "group with an upcoming lesson must not be archived");
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM lessons WHERE id = ? AND group_id = ?").get(futureLesson.json.id, lessonGroup.id).count, 1);

  const emptyGroup = await createRichGroup({ name: `Audit Soft Archive ${Date.now()}`, note: "Preserve me" });
  response = await request(`/api/groups/${encodeURIComponent(emptyGroup.id)}`, {
    method: "DELETE",
    cookie: adminCookie,
    body: { reason: "Season finished" },
  });
  assert.equal(response.status, 200, JSON.stringify(response.json));
  assert.equal(response.json.id, emptyGroup.id);
  assert.equal(response.json.status, "archived");
  assert.equal(response.json.archiveReason, "Season finished");
  const archivedRow = db.prepare("SELECT id, name, note, status, archived_at, archive_reason FROM groups WHERE tenant_id = ? AND id = ?").get("tenant_main", emptyGroup.id);
  assert.equal(archivedRow.name, emptyGroup.name);
  assert.equal(archivedRow.note, "Preserve me");
  assert.equal(archivedRow.status, "archived");
  assert.ok(archivedRow.archived_at);

  const activeGroups = await request("/api/groups", { cookie: adminCookie });
  const allGroups = await request("/api/groups?includeArchived=1", { cookie: adminCookie });
  assert.ok(!activeGroups.json.groups.some((group) => group.id === emptyGroup.id));
  assert.ok(allGroups.json.groups.some((group) => group.id === emptyGroup.id && group.status === "archived"));

  response = await request("/api/students", {
    method: "POST",
    cookie: adminCookie,
    body: { name: "Archived Group Student", groupId: emptyGroup.id, parentName: "Parent" },
  });
  assert.equal(response.status, 409, "archived group accepted a new student");
  response = await request("/api/lessons", {
    method: "POST",
    cookie: adminCookie,
    body: { groupId: emptyGroup.id, date: isoPlusDays(1), time: "14:00 - 15:00" },
  });
  assert.equal(response.status, 409, "archived group accepted a new lesson");

  response = await request(`/api/groups/${encodeURIComponent(emptyGroup.id)}/restore`, {
    method: "POST",
    cookie: adminCookie,
    body: {},
  });
  assert.equal(response.status, 200, JSON.stringify(response.json));
  assert.equal(response.json.id, emptyGroup.id);
  assert.equal(response.json.name, emptyGroup.name);
  assert.equal(response.json.note, "Preserve me");
  assert.equal(response.json.status, "active");
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM groups WHERE tenant_id = ? AND id = ?").get("tenant_main", emptyGroup.id).count, 1);
});

test("Group Teacher Reassignment: completed history and explicit future substitute are preserved", async () => {
  const db = getDb();
  const group = await createRichGroup({ name: `Audit Teacher History ${Date.now()}`, teacherId: "user_teacher" });
  const completed = await request("/api/lessons", {
    method: "POST",
    cookie: adminCookie,
    body: { groupId: group.id, date: isoPlusDays(-1), time: "10:00 - 11:00" },
  });
  const inheritedFuture = await request("/api/lessons", {
    method: "POST",
    cookie: adminCookie,
    body: { groupId: group.id, date: isoPlusDays(5), time: "11:00 - 12:00" },
  });
  const substituteFuture = await request("/api/lessons", {
    method: "POST",
    cookie: adminCookie,
    body: { groupId: group.id, date: isoPlusDays(6), time: "12:00 - 13:00" },
  });
  assert.deepEqual([completed.status, inheritedFuture.status, substituteFuture.status], [201, 201, 201]);
  db.prepare("UPDATE lessons SET status = 'completed' WHERE tenant_id = ? AND id = ?").run("tenant_main", completed.json.id);
  db.prepare("UPDATE lessons SET teacher_id = ? WHERE tenant_id = ? AND id = ?").run("teacher_jasur", "tenant_main", substituteFuture.json.id);

  const response = await request(`/api/groups/${encodeURIComponent(group.id)}`, {
    method: "PUT",
    cookie: adminCookie,
    body: { ...group, teacherId: "teacher_bekzod" },
  });
  assert.equal(response.status, 200, JSON.stringify(response.json));
  assert.equal(response.json.teacherId, "teacher_bekzod");
  const lessons = db
    .prepare("SELECT id, teacher_id FROM lessons WHERE tenant_id = ? AND id IN (?, ?, ?)")
    .all("tenant_main", completed.json.id, inheritedFuture.json.id, substituteFuture.json.id);
  const teacherByLesson = Object.fromEntries(lessons.map((lesson) => [lesson.id, lesson.teacher_id]));
  assert.equal(teacherByLesson[completed.json.id], "user_teacher", "completed lesson teacher history was rewritten");
  assert.equal(teacherByLesson[inheritedFuture.json.id], "teacher_bekzod", "future inherited lesson did not follow new main teacher");
  assert.equal(teacherByLesson[substituteFuture.json.id], "teacher_jasur", "explicit substitute was overwritten by group reassignment");
  const assignments = db
    .prepare("SELECT teacher_id, status FROM group_teacher_assignments WHERE tenant_id = ? AND group_id = ? ORDER BY created_at, id")
    .all("tenant_main", group.id);
  assert.ok(assignments.some((assignment) => assignment.teacher_id === "user_teacher" && assignment.status === "ended"));
  assert.ok(assignments.some((assignment) => assignment.teacher_id === "teacher_bekzod" && assignment.status === "active"));
});

test("Teacher Management: profile, access, workload, archive and history are real and safe", async () => {
  const db = getDb();
  const withoutAccess = await request("/api/teachers", {
    method: "POST",
    cookie: adminCookie,
    body: { name: "Audit Faculty", phone: "+998901234567", specialization: "English", employmentType: "part_time", maxWeeklyHours: 20, accessEnabled: false },
  });
  assert.equal(withoutAccess.status, 201, JSON.stringify(withoutAccess.json));
  assert.equal(withoutAccess.json.hasAccess, false);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM users WHERE id = ?").get(withoutAccess.json.id).count, 0);

  const username = `audit.teacher.${Date.now()}`;
  const initialPassword = "TeacherPass123";
  const withAccess = await request("/api/teachers", {
    method: "POST",
    cookie: adminCookie,
    body: { name: "Portal Faculty", phone: "+998909999999", specialization: "Math", employmentType: "full_time", maxWeeklyHours: 40, accessEnabled: true, username, password: initialPassword },
  });
  assert.equal(withAccess.status, 201, JSON.stringify(withAccess.json));
  assert.equal(withAccess.json.hasAccess, true);
  const account = db.prepare("SELECT id, password, status FROM users WHERE id = ?").get(withAccess.json.id);
  assert.equal(account.id, withAccess.json.id, "teacher and user IDs must be identical");
  assert.match(account.password, /^pbkdf2_sha256\$/);

  const teacherLogin = await request("/api/login", { method: "POST", body: { username, password: initialPassword } });
  assert.equal(teacherLogin.status, 200);
  const portalCookie = cookieFrom(teacherLogin.headers);
  const forbidden = await request("/api/teachers", { method: "POST", cookie: portalCookie, body: { name: "Forbidden" } });
  assert.equal(forbidden.status, 403, "teacher must not manage another teacher");

  const countBeforeDuplicate = db.prepare("SELECT COUNT(*) AS count FROM teachers WHERE tenant_id = 'tenant_main'").get().count;
  const duplicate = await request("/api/teachers", {
    method: "POST",
    cookie: adminCookie,
    body: { name: "Duplicate Login", employmentType: "full_time", maxWeeklyHours: 40, accessEnabled: true, username, password: "AnotherPass123" },
  });
  assert.equal(duplicate.status, 409);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM teachers WHERE tenant_id = 'tenant_main'").get().count, countBeforeDuplicate, "username conflict left an orphan teacher");

  const updated = await request(`/api/teachers/${encodeURIComponent(withAccess.json.id)}`, {
    method: "PUT",
    cookie: adminCookie,
    body: { ...withAccess.json, name: "Portal Faculty Updated", maxWeeklyHours: 35, accessEnabled: true, username },
  });
  assert.equal(updated.status, 200, JSON.stringify(updated.json));
  assert.equal(db.prepare("SELECT name FROM users WHERE id = ?").get(withAccess.json.id).name, "Portal Faculty Updated");

  const firstHour = await request("/api/teacher-working-hours", {
    method: "POST",
    cookie: adminCookie,
    body: { teacherId: withAccess.json.id, weekday: "1", startTime: "09:00", endTime: "12:00" },
  });
  assert.equal(firstHour.status, 201, JSON.stringify(firstHour.json));
  const overlap = await request("/api/teacher-working-hours", {
    method: "POST",
    cookie: adminCookie,
    body: { teacherId: withAccess.json.id, weekday: "1", startTime: "11:00", endTime: "13:00" },
  });
  assert.equal(overlap.status, 409);
  assert.equal((await request(`/api/teacher-working-hours/${encodeURIComponent(firstHour.json.id)}`, { method: "DELETE", cookie: adminCookie, body: {} })).status, 200);

  const group = await request("/api/groups", {
    method: "POST",
    cookie: adminCookie,
    body: { name: "Faculty History Group", subject: "History", teacherId: withoutAccess.json.id, room: "H1", monthlyFee: 0, startDate: isoPlusDays(-7) },
  });
  assert.equal(group.status, 201);
  const lesson = await request("/api/lessons", { method: "POST", cookie: adminCookie, body: { groupId: group.json.id, date: "2026-07-11", time: "08:00 - 09:00" } });
  assert.equal(lesson.status, 201);
  const reassigned = await request(`/api/groups/${encodeURIComponent(group.json.id)}`, {
    method: "PUT",
    cookie: adminCookie,
    body: { name: group.json.name, subject: group.json.subject, teacherId: "user_teacher", room: group.json.room, monthlyFee: 0 },
  });
  assert.equal(reassigned.status, 200);
  const oneOffLesson = db.prepare("SELECT teacher_id, schedule_id FROM lessons WHERE id = ?").get(lesson.json.id);
  assert.equal(oneOffLesson.teacher_id, withoutAccess.json.id, "historical lesson teacher changed after group reassignment");
  assert.equal(oneOffLesson.schedule_id, null, "one-off lesson unexpectedly created a recurring schedule rule");

  const reset = await request(`/api/teachers/${encodeURIComponent(withAccess.json.id)}/reset-password`, { method: "POST", cookie: adminCookie, body: { newPassword: "NewTeacherPass456" } });
  assert.equal(reset.status, 200);
  assert.equal((await request("/api/me", { cookie: portalCookie })).status, 401, "password reset did not invalidate active session");
  assert.equal((await request("/api/login", { method: "POST", body: { username, password: initialPassword } })).status, 401);
  assert.equal((await request("/api/login", { method: "POST", body: { username, password: "NewTeacherPass456" } })).status, 200);

  const blockedArchive = await request("/api/teachers/user_teacher", { method: "DELETE", cookie: adminCookie, body: {} });
  assert.equal(blockedArchive.status, 409, "teacher with active groups must not be archived");
  const archived = await request(`/api/teachers/${encodeURIComponent(withAccess.json.id)}`, { method: "DELETE", cookie: adminCookie, body: {} });
  assert.equal(archived.status, 200, JSON.stringify(archived.json));
  assert.equal(archived.json.status, "inactive");
  assert.equal(db.prepare("SELECT status FROM users WHERE id = ?").get(withAccess.json.id).status, "inactive");
  assert.equal((await request("/api/login", { method: "POST", body: { username, password: "NewTeacherPass456" } })).status, 403);
});

test("Tenant Isolation: repository JOINs must not expose data from another tenant", async () => {
  const db = getDb();
  const repo = new AppRepository(db);
  db.prepare("INSERT INTO tenants (id, name, type, status, plan, language, telegram_bot, telegram_bot_token, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
    "tenant_audit",
    "Audit Tenant",
    "learning_center",
    "active",
    "standard",
    "uz",
    "",
    "",
    new Date().toISOString(),
  );
  db.prepare("INSERT INTO groups (id, tenant_id, name, subject, teacher_id, room, monthly_fee, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(
    "audit_cross_teacher_group",
    "tenant_audit",
    "Cross Teacher Group",
    "Security",
    "user_teacher",
    "X",
    0,
    1,
  );
  db.prepare("INSERT INTO students (id, tenant_id, name, group_id, parent_name, phone, telegram_chat_id, debt, balance, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
    "audit_cross_student",
    "tenant_audit",
    "Cross Tenant Student",
    "group_english",
    "Parent",
    "",
    "",
    0,
    0,
    "active",
  );
  db.prepare("INSERT INTO students (id, tenant_id, name, group_id, parent_name, phone, telegram_chat_id, debt, balance, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
    "audit_main_student_cross_group",
    "tenant_main",
    "Must Not Leak Into Audit Tenant",
    "audit_cross_teacher_group",
    "Main Tenant Parent",
    "",
    "",
    900000,
    -900000,
    "active",
  );
  db.prepare(
    `INSERT INTO student_group_enrollments
     (id, tenant_id, student_id, group_id, status, start_date, reason, created_by, created_at)
     VALUES (?, ?, ?, ?, 'active', ?, '', 'system', ?)`,
  ).run("audit_cross_enrollment", "tenant_main", "audit_main_student_cross_group", "audit_cross_teacher_group", isoPlusDays(-1), new Date().toISOString());
  db.prepare(
    `INSERT INTO schedules
     (tenant_id, group_id, teacher_id, weekday, start_time, end_time, is_recurring, lesson_type, valid_from, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, 'group', ?, 'active', ?, ?)`,
  ).run("tenant_main", "audit_cross_teacher_group", "user_teacher", "2", "05:00", "06:00", isoPlusDays(-1), new Date().toISOString(), new Date().toISOString());

  const leakedGroup = repo.groups("tenant_audit").find((group) => group.id === "audit_cross_teacher_group");
  const leakedStudent = repo.students("tenant_audit").find((student) => student.id === "audit_cross_student");
  const isolatedProfile = repo.groupProfile("tenant_audit", "audit_cross_teacher_group");

  assert.deepEqual(
    {
      groupTeacherName: leakedGroup.teacherName || "",
      studentGroupName: leakedStudent?.groupName || "",
    },
    {
      groupTeacherName: "",
      studentGroupName: "",
    },
    "Cross-tenant data leaked because groups()/students() JOINs do not consistently enforce tenant_id on joined tables",
  );
  assert.ok(isolatedProfile, "tenant-owned group profile should exist");
  assert.equal(isolatedProfile.group.teacherName || "", "", "profile leaked a teacher from another tenant");
  assert.deepEqual(isolatedProfile.members.active, [], "profile leaked an active member from another tenant");
  assert.deepEqual(isolatedProfile.schedules, [], "profile leaked a schedule from another tenant");
  assert.equal(isolatedProfile.finance.outstanding, 0, "profile leaked another tenant's balance");

  const foreignProfile = await request("/api/groups/audit_cross_teacher_group/profile", { cookie: adminCookie });
  assert.equal(foreignProfile.status, 404, "tenant admin accessed another tenant's group profile through the API");
});

async function main() {
  let failures = 0;
  try {
    adminCookie = await login("admin", "admin123");
    teacherCookie = await login("teacher", "teacher123");
    superCookie = await login("superadmin", "super123");

    for (const item of tests) {
      try {
        await item.fn();
        console.log(`PASS ${item.name}`);
      } catch (error) {
        failures += 1;
        console.log(`FAIL ${item.name}`);
        console.log(`  ${error.message}`);
      }
    }
  } finally {
    try {
      fs.unlinkSync(sqliteFile);
    } catch (_error) {
      // temp DB cleanup best-effort only
    }
  }

  console.log(`RESULT ${tests.length - failures}/${tests.length} passed`);
  if (failures) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`FATAL ${error.stack || error.message}`);
  process.exitCode = 1;
});
