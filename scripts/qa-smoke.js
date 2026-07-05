#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { DatabaseSync } = require("node:sqlite");

const sqliteFile = path.join(os.tmpdir(), `dono-qa-${process.pid}-${Date.now()}.sqlite`);
process.env.SQLITE_FILE = sqliteFile;
process.env.PORT = "0";

const { createServer } = require("../src/http/server");

function pass(label) {
  console.log(`PASS ${label}`);
}

function cookieFrom(headers) {
  const raw = headers.get("set-cookie") || "";
  return raw.split(";")[0];
}

async function request(baseUrl, pathname, options = {}) {
  const headers = { ...(options.headers || {}) };
  let body = options.body;
  if (body && typeof body === "object" && !Buffer.isBuffer(body)) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(body);
  }
  if (options.cookie) headers.Cookie = options.cookie;

  const response = await fetch(`${baseUrl}${pathname}`, {
    method: options.method || "GET",
    headers,
    body,
  });
  const text = await response.text();
  const contentType = response.headers.get("content-type") || "";
  const json = contentType.includes("application/json") && text ? JSON.parse(text) : null;
  return { status: response.status, headers: response.headers, text, json };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

async function runFrontendRenderChecks(fixture) {
  const appNode = { innerHTML: "" };
  const context = {
    console,
    clearTimeout,
    setTimeout,
    document: {
      getElementById(id) {
        assert.equal(id, "app");
        return appNode;
      },
    },
    fetch: async () => {
      throw new Error("offline");
    },
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../app.js"), "utf8"), context);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.match(appNode.innerHTML, /login-card/);

  const data = clone(fixture);
  data.dashboard.tenant.name = '<Tenant "QA">';
  data.dashboard.tenant.telegramBot = "@<qa_bot>";
  data.students.unshift({
    id: "mal_student",
    tenantId: "tenant_main",
    name: "<img src=x onerror=alert(1)>",
    groupId: data.groups[0].id,
    parentName: "<script>alert(1)</script>",
    phone: "+998 90 000 00 00",
    telegramChatId: "",
    debt: 123,
    groupName: "<Group Name>",
  });
  data.groups.unshift({
    id: "mal_group",
    tenantId: "tenant_main",
    name: "<Group>",
    subject: "<Subject>",
    teacherId: "user_teacher",
    teacherName: "<Teacher>",
    room: "<Room>",
    monthlyFee: 123,
    active: true,
    studentsCount: 1,
  });
  data.lessons.unshift({
    id: "mal_lesson",
    tenantId: "tenant_main",
    groupId: data.groups[0].id,
    date: "2026-07-05",
    time: "09:00 - 10:00",
    status: "waiting",
    groupName: "<Lesson Group>",
    subject: "<Lesson Subject>",
    room: "<Lesson Room>",
    teacherId: "user_teacher",
    teacherName: "<Lesson Teacher>",
  });
  data.payments.unshift({
    id: "mal_payment",
    tenantId: "tenant_main",
    studentId: "mal_student",
    studentName: "<Payee>",
    amount: 1000,
    type: "cash",
    createdAt: "2026-07-05T00:00:00.000Z",
  });
  data.messages.unshift({
    id: "mal_message",
    tenantId: "tenant_main",
    to: "<Recipient>",
    channel: "telegram",
    text: "<script>alert(1)</script>",
    status: "queued",
    attempts: 0,
    createdAt: "2026-07-05T00:00:00.000Z",
    sentAt: null,
  });
  data.leads.unshift({
    id: "mal_lead",
    tenantId: "tenant_main",
    name: "<Lead>",
    phone: "<Phone>",
    source: "<Source>",
    status: "new",
    note: "<Note>",
    createdAt: "2026-07-05T00:00:00.000Z",
  });
  data.auditLogs.unshift({
    id: "mal_log",
    tenantId: "tenant_main",
    userId: "user_admin",
    role: "<Role>",
    action: "<Action>",
    entity: "<Entity>",
    entityId: "mal",
    createdAt: "2026-07-05T00:00:00.000Z",
  });
  data.dashboard.lessons = data.lessons;
  data.dashboard.debtors = data.students.filter((student) => student.debt > 0);
  data.dashboard.messages = data.messages.slice(0, 8);

  context.setUser({ id: "user_admin", tenantId: "tenant_main", username: "admin", name: "<Admin>", role: "admin" });
  for (const pageName of ["dashboard", "students", "groups", "lessons", "attendance", "payments", "messages", "leads", "reports", "settings"]) {
    context.setState({ data, loading: false, page: pageName, search: "" });
    assert.doesNotMatch(appNode.innerHTML, /<script>alert\(1\)<\/script>/, pageName);
    assert.doesNotMatch(appNode.innerHTML, /<img src=x onerror=alert\(1\)>/, pageName);
    assert.doesNotMatch(appNode.innerHTML, /<Tenant "QA">/, pageName);
    assert.doesNotMatch(appNode.innerHTML, /<Admin>/, pageName);
  }

  context.setUser({ id: "user_teacher", tenantId: "tenant_main", username: "teacher", name: "<Teacher User>", role: "teacher" });
  for (const pageName of ["dashboard", "lessons", "attendance", "settings"]) {
    context.setState({ data, loading: false, page: pageName, search: "" });
    assert.doesNotMatch(appNode.innerHTML, /<Teacher User>/, pageName);
    assert.doesNotMatch(appNode.innerHTML, /<script>alert\(1\)<\/script>/, pageName);
  }

  pass("frontend render and escaping checks");
}

async function main() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    let res = await request(baseUrl, "/healthz");
    assert.equal(res.status, 200);
    assert.deepEqual(res.json, { ok: true });
    pass("health endpoint");

    res = await request(baseUrl, "/readyz");
    assert.equal(res.status, 200);
    assert.equal(res.json.database, "ready");
    pass("readiness endpoint");

    res = await request(baseUrl, "/");
    assert.equal(res.status, 200);
    assert.match(res.text, /<title>Dono<\/title>/);
    pass("index served");

    for (const blockedPath of ["/README.md", "/MARKET_EXECUTION.md", "/data/dono.sqlite", "/src/http/api.js"]) {
      res = await request(baseUrl, blockedPath);
      assert.equal(res.status, 404, blockedPath);
    }
    pass("private files blocked by static server");

    res = await request(baseUrl, "/api/bootstrap");
    assert.equal(res.status, 401);
    pass("bootstrap requires auth");

    res = await request(baseUrl, "/api/login", { method: "POST", body: { username: "admin", password: "wrong" } });
    assert.equal(res.status, 401);
    pass("bad login rejected");

    res = await request(baseUrl, "/api/login", { method: "POST", body: { username: "admin", password: "admin123" } });
    assert.equal(res.status, 200);
    assert.equal(res.json.user.role, "admin");
    const adminCookie = cookieFrom(res.headers);
    assert.match(adminCookie, /^dono_session=/);
    pass("admin login");

    res = await request(baseUrl, "/api/me", { cookie: adminCookie });
    assert.equal(res.status, 200);
    assert.equal(res.json.user.username, "admin");
    pass("session lookup");

    res = await request(baseUrl, "/api/bootstrap", { cookie: adminCookie });
    assert.equal(res.status, 200);
    const initial = res.json;
    assert.equal(initial.students.length, 6);
    assert.equal(initial.groups.length, 5);
    assert.equal(initial.teachers.length, 4);
    assert.equal(initial.lessons.length, 4);
    pass("admin bootstrap");

    await runFrontendRenderChecks(initial);

    const teacher = initial.teachers.find((item) => item.id === "user_teacher");
    const englishGroup = initial.groups.find((item) => item.id === "group_english");
    const teacherLesson = initial.lessons.find((lesson) => lesson.teacherId === "user_teacher" && lesson.groupId === "group_itbasic");
    const otherTeacherLesson = initial.lessons.find((lesson) => lesson.teacherId !== "user_teacher");
    const englishStudent = initial.students.find((student) => student.groupId === "group_english");
    const teacherStudent = initial.students.find((student) => student.groupId === teacherLesson.groupId);
    assert.ok(teacher);
    assert.ok(englishGroup);
    assert.ok(teacherLesson);
    assert.ok(otherTeacherLesson);
    assert.ok(englishStudent);
    assert.ok(teacherStudent);

    res = await request(baseUrl, "/api/groups", {
      method: "POST",
      cookie: adminCookie,
      body: { name: "QA Missing Teacher", subject: "Test", teacherId: "missing_teacher" },
    });
    assert.equal(res.status, 404);
    pass("group validates teacher");

    res = await request(baseUrl, "/api/groups", {
      method: "POST",
      cookie: adminCookie,
      body: { name: "QA Group", subject: "QA", teacherId: teacher.id, room: "QA", monthlyFee: 123000 },
    });
    assert.equal(res.status, 201);
    const qaGroup = res.json;
    assert.equal(qaGroup.name, "QA Group");
    pass("admin creates group");

    res = await request(baseUrl, "/api/students", {
      method: "POST",
      cookie: adminCookie,
      body: { name: "QA Missing Group", groupId: "missing_group", parentName: "Parent" },
    });
    assert.equal(res.status, 404);
    pass("student validates group");

    res = await request(baseUrl, "/api/students", {
      method: "POST",
      cookie: adminCookie,
      body: { name: "<QA Student>", groupId: qaGroup.id, parentName: "QA Parent", phone: "+998 90 000 00 01", debt: 50000 },
    });
    assert.equal(res.status, 201);
    const qaStudent = res.json;
    assert.equal(qaStudent.name, "<QA Student>");
    pass("admin creates student");

    res = await request(baseUrl, "/api/lessons", {
      method: "POST",
      cookie: adminCookie,
      body: { groupId: "missing_group", time: "10:00 - 11:00" },
    });
    assert.equal(res.status, 404);
    pass("lesson validates group");

    res = await request(baseUrl, "/api/lessons", {
      method: "POST",
      cookie: adminCookie,
      body: { groupId: qaGroup.id, time: "10:00 - 11:00" },
    });
    assert.equal(res.status, 201);
    const qaLesson = res.json;
    assert.match(qaLesson.date, /^\d{4}-\d{2}-\d{2}$/);
    pass("admin creates lesson with default date");

    res = await request(baseUrl, "/api/payments", {
      method: "POST",
      cookie: adminCookie,
      body: { studentId: qaStudent.id, amount: 0, type: "cash" },
    });
    assert.equal(res.status, 422);
    pass("payment rejects non-positive amount");

    res = await request(baseUrl, "/api/payments", {
      method: "POST",
      cookie: adminCookie,
      body: { studentId: qaStudent.id, amount: 20000, type: "card" },
    });
    assert.equal(res.status, 201);
    assert.equal(res.json.amount, 20000);
    pass("admin creates payment");

    res = await request(baseUrl, "/api/bootstrap", { cookie: adminCookie });
    const paidStudent = res.json.students.find((student) => student.id === qaStudent.id);
    assert.equal(paidStudent.debt, 30000);
    assert.ok(res.json.messages.some((message) => message.text.includes("To'lov qabul qilindi")));
    pass("payment reduces debt and queues Telegram message");

    res = await request(baseUrl, "/api/messages", {
      method: "POST",
      cookie: adminCookie,
      body: { to: "QA recipient", text: "QA message" },
    });
    assert.equal(res.status, 201);
    assert.equal(res.json.status, "queued");
    pass("admin queues manual message");

    res = await request(baseUrl, "/api/leads", {
      method: "POST",
      cookie: adminCookie,
      body: { name: "QA Lead", phone: "+998 90 000 00 02", source: "Referral", status: "converted", note: "Ready" },
    });
    assert.equal(res.status, 201);
    assert.equal(res.json.status, "converted");
    pass("admin creates lead");

    res = await request(baseUrl, "/api/leads", {
      method: "POST",
      cookie: adminCookie,
      body: { name: "Bad Lead", status: "lost" },
    });
    assert.equal(res.status, 422);
    pass("lead status validation");

    res = await request(baseUrl, "/api/settings/telegram", {
      method: "POST",
      cookie: adminCookie,
      body: { telegramBot: "@qa_bot", telegramBotToken: "bad-token" },
    });
    assert.equal(res.status, 422);
    pass("invalid Telegram token rejected");

    res = await request(baseUrl, "/api/settings/telegram", {
      method: "POST",
      cookie: adminCookie,
      body: { telegramBot: "@qa_bot", telegramBotToken: "123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZ" },
    });
    assert.equal(res.status, 200);
    assert.equal(res.json.telegramBot, "@qa_bot");
    assert.equal(res.json.telegramBotTokenSet, true);
    pass("Telegram settings saved");

    res = await request(baseUrl, "/api/import/students", {
      method: "POST",
      cookie: adminCookie,
      body: { csv: `QA Import,+998900000003,Import Parent,${qaGroup.id},1000` },
    });
    assert.equal(res.status, 201);
    assert.equal(res.json.imported, 1);
    pass("student CSV import");

    res = await request(baseUrl, "/api/import/students", {
      method: "POST",
      cookie: adminCookie,
      body: { csv: "Bad Import,+998900000004,Import Parent,missing_group,1000" },
    });
    assert.equal(res.status, 422);
    pass("student CSV import validates group");

    res = await request(baseUrl, "/api/attendance", {
      method: "POST",
      cookie: adminCookie,
      body: { lessonId: qaLesson.id, records: [{ studentId: qaStudent.id, status: "late", note: "Traffic" }] },
    });
    assert.equal(res.status, 200);
    pass("admin saves attendance");

    res = await request(baseUrl, "/api/attendance", {
      method: "POST",
      cookie: adminCookie,
      body: { lessonId: qaLesson.id, records: [{ studentId: englishStudent.id, status: "present" }] },
    });
    assert.equal(res.status, 422);
    pass("attendance rejects wrong-group student");

    res = await request(baseUrl, "/api/login", { method: "POST", body: { username: "teacher", password: "teacher123" } });
    assert.equal(res.status, 200);
    assert.equal(res.json.user.role, "teacher");
    const teacherCookie = cookieFrom(res.headers);
    pass("teacher login");

    for (const [label, endpoint, body] of [
      ["teacher create student", "/api/students", { name: "No", groupId: englishGroup.id, parentName: "No" }],
      ["teacher create payment", "/api/payments", { studentId: englishStudent.id, amount: 1000, type: "cash" }],
      ["teacher create message", "/api/messages", { to: "No", text: "No" }],
      ["teacher process queue", "/api/messages/process", {}],
      ["teacher update settings", "/api/settings/telegram", { telegramBot: "@no_bot", telegramBotToken: "123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZ" }],
      ["teacher import", "/api/import/students", { csv: `No,+998,No,${englishGroup.id},0` }],
    ]) {
      res = await request(baseUrl, endpoint, { method: "POST", cookie: teacherCookie, body });
      assert.equal(res.status, 403, label);
    }
    pass("teacher admin actions forbidden");

    res = await request(baseUrl, "/api/attendance", {
      method: "POST",
      cookie: teacherCookie,
      body: { lessonId: otherTeacherLesson.id, records: [{ studentId: englishStudent.id, status: "present" }] },
    });
    assert.equal(res.status, 403);
    pass("teacher cannot save another teacher lesson");

    res = await request(baseUrl, "/api/attendance", {
      method: "POST",
      cookie: teacherCookie,
      body: { lessonId: teacherLesson.id, records: [{ studentId: teacherStudent.id, status: "present" }] },
    });
    assert.equal(res.status, 200);
    pass("teacher saves assigned lesson attendance");

    res = await request(baseUrl, "/api/bootstrap", { cookie: teacherCookie });
    assert.equal(res.status, 200);
    assert.ok(res.json.lessons.length > 0);
    assert.ok(res.json.lessons.every((lesson) => lesson.teacherId === "user_teacher"));
    assert.ok(res.json.groups.every((group) => group.teacherId === "user_teacher" && group.monthlyFee === 0));
    assert.ok(res.json.students.every((student) => student.debt === 0 && student.telegramChatId === ""));
    assert.equal(res.json.payments.length, 0);
    assert.equal(res.json.messages.length, 0);
    assert.equal(res.json.leads.length, 0);
    assert.equal(res.json.dashboard.debtors.length, 0);
    assert.equal(res.json.dashboard.stats.debtTotal, 0);
    assert.equal(res.json.dashboard.stats.revenueToday, 0);
    pass("teacher bootstrap is server-scoped");

    res = await request(baseUrl, "/api/messages/process", { method: "POST", cookie: adminCookie, body: {} });
    assert.equal(res.status, 200);
    assert.ok(res.json.processed >= 1);
    pass("admin processes queue");

    res = await request(baseUrl, "/api/logout", { method: "POST", cookie: adminCookie, body: {} });
    assert.equal(res.status, 200);
    res = await request(baseUrl, "/api/me", { cookie: adminCookie });
    assert.equal(res.status, 401);
    pass("logout invalidates session");

    const db = new DatabaseSync(sqliteFile);
    const passwords = db.prepare("SELECT username, password FROM users ORDER BY username").all();
    assert.ok(passwords.every((user) => String(user.password).startsWith("pbkdf2_sha256$")));
    db.close();
    pass("passwords are hashed");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    for (const suffix of ["", "-shm", "-wal", "-journal"]) {
      fs.rmSync(`${sqliteFile}${suffix}`, { force: true });
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
