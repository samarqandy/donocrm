#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { DatabaseSync } = require("node:sqlite");

const sqliteFile = path.join(os.tmpdir(), `dono-qa-${process.pid}-${Date.now()}.sqlite`);
process.env.NODE_ENV = "test";
process.env.DONO_SEED_DEMO = "true";
process.env.DONO_TELEGRAM_SKIP_REMOTE_VALIDATION = "true";
process.env.SQLITE_FILE = sqliteFile;
process.env.PORT = "0";

const { createServer } = require("../src/http/server");
const { getDb } = require("../src/db/client");
const { today: localToday } = require("../src/utils/time");

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

function isoPlusDays(days) {
  const anchor = new Date(`${localToday()}T12:00:00.000Z`);
  anchor.setUTCDate(anchor.getUTCDate() + days);
  return anchor.toISOString().slice(0, 10);
}

async function fetchJson(baseUrl, pathname, cookie) {
  const res = await request(baseUrl, pathname, { cookie });
  assert.equal(res.status, 200, pathname);
  return res.json;
}

async function hydrateAdminData(baseUrl, cookie, bootstrap) {
  const [students, groups, teachers, lessons, attendanceRecords, payments, messages, leads] = await Promise.all([
    fetchJson(baseUrl, "/api/students", cookie),
    fetchJson(baseUrl, "/api/groups", cookie),
    fetchJson(baseUrl, "/api/teachers", cookie),
    fetchJson(baseUrl, "/api/lessons", cookie),
    fetchJson(baseUrl, "/api/attendance-records", cookie),
    fetchJson(baseUrl, "/api/payments", cookie),
    fetchJson(baseUrl, "/api/messages", cookie),
    fetchJson(baseUrl, "/api/leads", cookie),
  ]);
  return {
    ...bootstrap,
    students: students.students,
    groups: groups.groups,
    teachers: teachers.teachers,
    lessons: lessons.lessons,
    attendanceRecords: attendanceRecords.attendanceRecords,
    payments: payments.payments,
    messages: messages.messages,
    leads: leads.leads,
  };
}

function allLazyLoaded() {
  return {
    students: true,
    groups: true,
    teachers: true,
    lessons: true,
    attendanceRecords: true,
    payments: true,
    messages: true,
    leads: true,
    tasks: true,
    branches: true,
    roles: true,
    subscriptions: true,
    attendanceReasonsAdmin: true,
    financeAccounts: true,
    financeCategories: true,
    financePeriods: true,
  };
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
  Object.assign(data, {
    tasks: [],
    branches: [],
    roles: [],
    subscriptions: [],
    attendanceReasonsAdmin: [],
    financeAccounts: [],
    financeCategories: [],
    financePeriods: [],
  });
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
    description: "<Group Description>",
    level: "<A1>",
    teacherId: "user_teacher",
    teacherName: "<Teacher>",
    room: "<Room>",
    monthlyFee: 123,
    capacity: 12,
    startDate: "2026-07-01",
    endDate: "2026-12-31",
    status: "active",
    color: "#2563EB",
    note: "<Group Note>",
    active: true,
    studentsCount: 1,
    schedulesCount: 1,
    scheduleSummary: "3 09:00–10:00",
    completedLessons: 1,
    plannedLessons: 2,
    attendanceRate: 100,
  });
  data.teachers.unshift({
    id: "mal_teacher",
    tenantId: "tenant_main",
    name: "<Teacher Name>",
    phone: "<Teacher Phone>",
    email: "teacher@example.com",
    specialization: "<Teacher Subject>",
    employmentType: "full_time",
    status: "active",
    maxWeeklyMinutes: 2400,
    weeklyMinutes: 300,
    workloadPercent: 13,
    groupsCount: 1,
    studentsCount: 2,
    hasAccess: false,
    accessStatus: "not_granted",
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
  for (const pageName of ["dashboard", "students", "groups", "teachers", "lessons", "attendance", "payments", "messages", "leads", "tasks", "management", "reports", "settings"]) {
    context.setState({ data, loading: false, page: pageName, search: "", lazyLoaded: allLazyLoaded(), lazyLoading: {} });
    assert.doesNotMatch(appNode.innerHTML, /<script>alert\(1\)<\/script>/, pageName);
    assert.doesNotMatch(appNode.innerHTML, /<img src=x onerror=alert\(1\)>/, pageName);
    assert.doesNotMatch(appNode.innerHTML, /<Tenant "QA">/, pageName);
    assert.doesNotMatch(appNode.innerHTML, /<Admin>/, pageName);
  }

  for (const functionName of [
    "tasksPage",
    "taskModal",
    "managementPage",
    "branchesManagement",
    "attendanceReasonsManagement",
    "financeDictionariesManagement",
    "financePeriodsManagement",
    "subscriptionsManagement",
    "rolesManagement",
    "subscriptionModal",
    "importStudentsModal",
    "leadConversionModal",
    "openPlatformTenantEditModal",
  ]) {
    assert.equal(vm.runInContext(`typeof ${functionName}`, context), "function", `undefined backend UI function: ${functionName}`);
  }

  for (const functionName of [
    "groupsPage",
    "setGroupFilter",
    "openGroupDrawer",
    "closeGroupDrawer",
    "setGroupDrawerTab",
    "editGroupFromDrawer",
    "archiveGroupFromDrawer",
    "restoreGroup",
    "addStudentFromGroupDrawer",
    "toggleGroupScheduleForm",
    "setGroupScheduleChangeScope",
    "saveGroupSchedule",
    "confirmGroupScheduleChange",
    "disableGroupSchedule",
    "groupDrawer",
    "groupDrawerBody",
    "groupOverviewTab",
    "groupMembersTab",
    "groupScheduleTab",
    "groupLessonsTab",
    "groupFinanceTab",
  ]) {
    assert.equal(vm.runInContext(`typeof ${functionName}`, context), "function", `undefined group UI function: ${functionName}`);
  }

  const groupProfileFixture = {
    group: data.groups[0],
    members: {
      active: [data.students[0]],
      history: [{ studentId: "former", studentName: "<Former Member>", status: "transferred", startDate: "2026-01-01", endDate: "2026-06-01", reason: "<Reason>" }],
    },
    schedules: [{ id: "schedule-mal", groupId: data.groups[0].id, teacherId: "user_teacher", teacherName: "<Teacher>", weekday: 3, startTime: "09:00", endTime: "10:00", validFrom: "2026-07-01", validUntil: "2026-12-31", status: "active" }],
    lessons: {
      summary: { planned: 2, completed: 1, cancelled: 0 },
      upcoming: [data.lessons[0]],
      recent: [],
    },
    attendance: { summary: { present: 1, absent: 0, late: 0, excused: 0, rate: 100 }, records: [] },
    finance: { monthlyPotential: 123, charged: 100, paid: 50, outstanding: 50, debtors: [{ ...data.students[0], debt: 50 }] },
    teacherAssignments: [{ id: "assignment-mal", teacherId: "user_teacher", teacherName: "<Teacher>", status: "active", startDate: "2026-07-01", endDate: "" }],
    rooms: [],
  };
  for (const tab of ["overview", "members", "schedule", "lessons", "finance"]) {
    context.setState({
      data,
      loading: false,
      page: "groups",
      search: "",
      lazyLoaded: allLazyLoaded(),
      lazyLoading: {},
      groupDrawer: { groupId: data.groups[0].id, tab, loading: false, saving: false, scheduleForm: null, ...groupProfileFixture },
    });
    assert.match(appNode.innerHTML, /group-profile-drawer/, `group drawer did not render tab ${tab}`);
    assert.doesNotMatch(appNode.innerHTML, /<Group Description>|<Group Note>|<Former Member>|<Reason>/, `unsafe group profile output in ${tab}`);
  }
  context.setState({
    groupDrawer: {
      groupId: data.groups[0].id,
      tab: "schedule",
      loading: false,
      saving: false,
      ...groupProfileFixture,
      scheduleForm: { teacherId: "user_teacher", weekday: 3, startTime: "09:00", endTime: "10:00", status: "active" },
    },
  });
  assert.match(appNode.innerHTML, /onsubmit="saveGroupSchedule\(event\)"/, "group schedule form is disconnected from its save handler");
  context.setState({
    groupDrawer: {
      groupId: data.groups[0].id,
      tab: "schedule",
      loading: false,
      saving: false,
      ...groupProfileFixture,
      scheduleForm: {
        ...groupProfileFixture.schedules[0],
        seriesId: "schedule-series:tenant_main:schedule-mal",
        seriesVersion: 1,
        occurrenceDate: "2026-07-15",
        scope: "this_occurrence",
        reason: "",
      },
    },
  });
  assert.match(appNode.innerHTML, /id="groupScheduleOccurrenceDate"/, "scoped schedule edit is missing occurrence date");
  assert.match(appNode.innerHTML, /id="groupScheduleScope"/, "scoped schedule edit is missing scope");
  assert.match(appNode.innerHTML, /id="groupScheduleReason"/, "scoped schedule edit is missing audit reason");
  context.setState({ groupDrawer: null });

  context.setUser({ id: "user_teacher", tenantId: "tenant_main", username: "teacher", name: "<Teacher User>", role: "teacher" });
  const teacherSelfProfile = {
    teacher: data.teachers.find((teacher) => teacher.id === "user_teacher"),
    groups: data.groups.filter((group) => group.teacherId === "user_teacher").map(({ monthlyFee, ...group }) => group),
    workingHours: [{ id: "teacher-hour", weekday: "1", startTime: "09:00", endTime: "18:00" }],
    upcomingLessons: data.lessons.filter((lesson) => lesson.teacherId === "user_teacher"),
  };
  for (const pageName of ["dashboard", "lessons", "groups", "students", "attendance", "settings"]) {
    context.setState({ data, loading: false, page: pageName, search: "", lazyLoaded: allLazyLoaded(), lazyLoading: {}, teacherSelfProfile, teacherSelfProfileLoaded: true, teacherSelfProfileLoading: false });
    assert.doesNotMatch(appNode.innerHTML, /<Teacher User>/, pageName);
    assert.doesNotMatch(appNode.innerHTML, /<script>alert\(1\)<\/script>/, pageName);
  }
  context.setState({ data, loading: false, page: "groups", search: "", lazyLoaded: allLazyLoaded(), lazyLoading: {} });
  assert.match(appNode.innerHTML, /teacher-entity-card/, "teacher groups UI is missing");
  assert.doesNotMatch(appNode.innerHTML, /openModal\('group'\)/, "teacher groups UI exposes create action");
  assert.doesNotMatch(appNode.innerHTML, /monthlyFee|monthlyPotential/, "teacher groups UI exposes finance fields");
  context.setState({ data, loading: false, page: "students", search: "", lazyLoaded: allLazyLoaded(), lazyLoading: {} });
  assert.match(appNode.innerHTML, /teacher-student-list/, "teacher students UI is missing");
  assert.doesNotMatch(appNode.innerHTML, /export\/students|openImportStudentsModal|openModal\('student'\)/, "teacher students UI exposes admin actions");

  const teacherSafeStudent = { ...data.students.find((student) => student.groupId === "group_itbasic") };
  delete teacherSafeStudent.balance;
  delete teacherSafeStudent.debt;
  delete teacherSafeStudent.telegramChatId;
  context.setState({
    page: "students",
    drawer: { studentId: teacherSafeStudent.id, tab: "overview", loading: false, student: teacherSafeStudent, guardians: [], attendance: { summary: { total: 2, rate: 50 }, records: [] }, enrollments: [] },
  });
  assert.match(appNode.innerHTML, /Ko&#039;rish rejimi|Режим просмотра/, "teacher student drawer is not read-only");
  assert.doesNotMatch(appNode.innerHTML, /studentFinanceTab|telegram-connect-panel|archiveStudentFromDrawer|editStudentFromDrawer/, "teacher student drawer exposes private/admin controls");
  context.setState({ drawer: null });

  const calendarDate = "2026-07-08";
  context.setUser({ id: "user_admin", tenantId: "tenant_main", username: "admin", name: "Admin", role: "admin" });
  context.setState({
    data,
    loading: false,
    page: "lessons",
    lazyLoaded: allLazyLoaded(),
    lazyLoading: {},
    calendarDate,
    calendarLoadedDate: calendarDate,
    calendarLoading: false,
    calendarWidth: 760,
    calendarLessons: [
      { id: "overlap_a", group_name: "A", teacher_name: "T1", room_name: "R1", weekday: 3, start_time: "10:00", end_time: "11:30" },
      { id: "overlap_b", group_name: "B", teacher_name: "T2", room_name: "R2", weekday: 3, start_time: "10:30", end_time: "12:00" },
    ],
  });
  const lessonStyles = [...appNode.innerHTML.matchAll(/class="calendar-lesson[^"]*" style="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(lessonStyles.length, 2);
  assert.notEqual(lessonStyles[0].match(/left:([^;]+)/)?.[1], lessonStyles[1].match(/left:([^;]+)/)?.[1]);

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
    assert.match(res.text, /<title>donocrm<\/title>/);
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
    const bootstrap = res.json;
    assert.equal(bootstrap.students.length, 0);
    assert.equal(bootstrap.groups.length, 0);
    assert.equal(bootstrap.teachers.length, 0);
    assert.equal(bootstrap.lessons.length, 0);
    assert.equal(bootstrap.payments.length, 0);
    assert.equal(bootstrap.messages.length, 0);
    assert.equal(bootstrap.leads.length, 0);
    pass("admin bootstrap starts with lazy list state");

    const initial = await hydrateAdminData(baseUrl, adminCookie, bootstrap);
    assert.equal(initial.students.length, 6);
    assert.equal(initial.groups.length, 5);
    assert.equal(initial.teachers.length, 4);
    assert.equal(initial.lessons.length, 4);
    pass("admin lazy list endpoints");

    const todayIso = isoPlusDays(0);
    res = await request(baseUrl, `/api/schedules/week?date=${todayIso}`, { cookie: adminCookie });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.json));
    assert.ok(res.json.length >= 4);
    assert.ok(res.json.every((lesson) => lesson.group_name && lesson.teacher_name && lesson.weekday && lesson.start_time && lesson.end_time));
    pass("admin fetches weekly schedule");

    res = await request(baseUrl, "/api/schedules/week?date=bad-date", { cookie: adminCookie });
    assert.equal(res.status, 422);
    pass("weekly schedule validates date");

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
      body: {
        name: "QA Group",
        subject: "QA",
        description: "QA rich group",
        level: "A2",
        teacherId: teacher.id,
        room: "QA",
        capacity: 10,
        monthlyFee: 123000,
        startDate: todayIso,
        endDate: isoPlusDays(90),
        status: "active",
        color: "#2563EB",
        note: "QA lifecycle",
      },
    });
    assert.equal(res.status, 201);
    const qaGroup = res.json;
    assert.equal(qaGroup.name, "QA Group");
    assert.equal(qaGroup.capacity, 10);
    assert.equal(qaGroup.level, "A2");
    pass("admin creates rich group");

    res = await request(baseUrl, `/api/groups/${encodeURIComponent(qaGroup.id)}`, {
      method: "PUT",
      cookie: adminCookie,
      body: { ...qaGroup, name: "QA Group", subject: "QA Updated", teacherId: teacher.id, room: "QA-2", monthlyFee: 124000 },
    });
    assert.equal(res.status, 200);
    assert.equal(res.json.subject, "QA Updated");
    assert.equal(res.json.room, "QA-2");
    pass("admin updates group");

    res = await request(baseUrl, "/api/groups", {
      method: "POST",
      cookie: adminCookie,
      body: { name: "QA Empty Group", subject: "Temp", teacherId: teacher.id, room: "T", monthlyFee: 1 },
    });
    assert.equal(res.status, 201);
    const emptyGroup = res.json;
    res = await request(baseUrl, `/api/groups/${encodeURIComponent(emptyGroup.id)}`, {
      method: "DELETE",
      cookie: adminCookie,
      body: { reason: "QA season finished" },
    });
    assert.equal(res.status, 200);
    assert.equal(res.json.id, emptyGroup.id);
    assert.equal(res.json.status, "archived");
    assert.equal(res.json.archiveReason, "QA season finished");
    assert.equal(getDb().prepare("SELECT COUNT(*) AS count FROM groups WHERE tenant_id = ? AND id = ?").get("tenant_main", emptyGroup.id).count, 1);
    res = await request(baseUrl, "/api/groups", { cookie: adminCookie });
    assert.ok(!res.json.groups.some((group) => group.id === emptyGroup.id));
    res = await request(baseUrl, "/api/groups?includeArchived=1", { cookie: adminCookie });
    assert.ok(res.json.groups.some((group) => group.id === emptyGroup.id && group.status === "archived"));
    res = await request(baseUrl, `/api/groups/${encodeURIComponent(emptyGroup.id)}/restore`, {
      method: "POST",
      cookie: adminCookie,
      body: {},
    });
    assert.equal(res.status, 200);
    assert.equal(res.json.id, emptyGroup.id);
    assert.equal(res.json.status, "active");
    pass("admin archives and restores empty group without hard delete");

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

    res = await request(baseUrl, `/api/students/${encodeURIComponent(qaStudent.id)}`, {
      method: "PUT",
      cookie: adminCookie,
      body: { name: "<QA Student>", groupId: qaGroup.id, parentName: "QA Parent Updated", phone: "+998 90 000 00 02", status: "frozen" },
    });
    assert.equal(res.status, 200);
    assert.equal(res.json.parentName, "QA Parent Updated");
    assert.equal(res.json.status, "frozen");
    pass("admin updates student");

    res = await request(baseUrl, "/api/students", {
      method: "POST",
      cookie: adminCookie,
      body: { name: "QA Temp Student", groupId: qaGroup.id, parentName: "Temp Parent", phone: "+998 90 000 00 09", debt: 0 },
    });
    assert.equal(res.status, 201);
    const tempStudent = res.json;
    res = await request(baseUrl, `/api/students/${encodeURIComponent(tempStudent.id)}`, {
      method: "DELETE",
      cookie: adminCookie,
      body: {},
    });
    assert.equal(res.status, 200);
    assert.equal(res.json.id, tempStudent.id);
    pass("admin deletes student");

    res = await request(baseUrl, `/api/groups/${encodeURIComponent(qaGroup.id)}`, {
      method: "DELETE",
      cookie: adminCookie,
      body: {},
    });
    assert.equal(res.status, 409);
    pass("group archive protects active membership");

    res = await request(baseUrl, `/api/students/${encodeURIComponent(qaStudent.id)}/chat-id`, {
      method: "POST",
      cookie: adminCookie,
      body: { chat_id: "987654321" },
    });
    assert.equal(res.status, 200);
    assert.equal(res.json.telegramChatId, "987654321");
    pass("admin links student Telegram chat ID");

    res = await request(baseUrl, "/api/students?search=QA%20Student", { cookie: adminCookie });
    assert.equal(res.status, 200);
    assert.ok(res.json.students.some((student) => student.id === qaStudent.id));
    pass("admin searches students for message recipient");

    res = await request(baseUrl, `/api/students/${encodeURIComponent(qaStudent.id)}/chat-id`, {
      method: "POST",
      cookie: adminCookie,
      body: { chat_id: "" },
    });
    assert.equal(res.status, 200);
    assert.equal(res.json.telegramChatId, "");
    pass("admin clears student Telegram chat ID");

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
      body: { groupId: qaGroup.id, time: "bad-time" },
    });
    assert.equal(res.status, 422);
    pass("lesson validates time format");

    res = await request(baseUrl, "/api/lessons", {
      method: "POST",
      cookie: adminCookie,
      body: { groupId: qaGroup.id, time: "10:00 - 11:00", date: "2026-02-31" },
    });
    assert.equal(res.status, 422);
    pass("lesson validates date format");

    res = await request(baseUrl, "/api/lessons", {
      method: "POST",
      cookie: adminCookie,
      body: { groupId: qaGroup.id, time: "10:00 - 11:00" },
    });
    assert.equal(res.status, 201);
    const qaLesson = res.json;
    assert.match(qaLesson.date, /^\d{4}-\d{2}-\d{2}$/);
    pass("admin creates lesson with default date");

    res = await request(baseUrl, "/api/lessons", {
      method: "POST",
      cookie: adminCookie,
      body: { groupId: qaGroup.id, time: "10:00 - 11:00", date: qaLesson.date },
    });
    assert.equal(res.status, 409);
    pass("lesson duplicate slot is rejected");

    res = await request(baseUrl, `/api/schedules/week?date=${qaLesson.date}`, { cookie: adminCookie });
    assert.equal(res.status, 200);
    assert.ok(res.json.some((lesson) => lesson.group_name === "QA Group" && lesson.start_time === "10:00" && lesson.end_time === "11:00"));
    pass("created lesson appears in weekly schedule");

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
      body: { studentId: qaStudent.id, amount: 20000, type: "card", idempotencyKey: "qa-payment-main" },
    });
    assert.equal(res.status, 201);
    const qaPayment = res.json;
    assert.equal(qaPayment.amount, 20000);
    pass("admin creates payment");

    res = await request(baseUrl, `/api/payments/${encodeURIComponent(qaPayment.id)}`, {
      method: "PUT",
      cookie: adminCookie,
      body: { studentId: qaStudent.id, amount: 25000, type: "cash" },
    });
    assert.equal(res.status, 200);
    assert.equal(res.json.amount, 25000);
    assert.equal(res.json.type, "cash");
    pass("admin updates payment");

    res = await request(baseUrl, "/api/payments", {
      method: "POST",
      cookie: adminCookie,
      body: { studentId: qaStudent.id, amount: 5000, type: "transfer", idempotencyKey: "qa-payment-temp" },
    });
    assert.equal(res.status, 201);
    const tempPayment = res.json;
    res = await request(baseUrl, `/api/payments/${encodeURIComponent(tempPayment.id)}`, {
      method: "DELETE",
      cookie: adminCookie,
      body: {},
    });
    assert.equal(res.status, 200);
    assert.equal(res.json.id, tempPayment.id);
    const voidedPayment = getDb().prepare("SELECT status FROM payments WHERE tenant_id = ? AND id = ?").get("tenant_main", tempPayment.id);
    const voidedTransaction = getDb()
      .prepare("SELECT status FROM invoices_transactions WHERE tenant_id = ? AND description LIKE ? LIMIT 1")
      .get("tenant_main", `%payment:${tempPayment.id}%`);
    assert.equal(voidedPayment.status, "voided");
    assert.equal(voidedTransaction.status, "voided");
    pass("admin voids payment without hard delete");

    res = await request(baseUrl, "/api/students", { cookie: adminCookie });
    assert.equal(res.status, 200);
    const paidStudent = res.json.students.find((student) => student.id === qaStudent.id);
    assert.equal(paidStudent.debt, 25000);
    const paymentOutbox = getDb()
      .prepare("SELECT status, payload_json FROM outbox WHERE tenant_id = ? AND aggregate_type = 'payment' AND aggregate_id = ? LIMIT 1")
      .get("tenant_main", qaPayment.id);
    assert.equal(paymentOutbox.status, "pending");
    assert.equal(JSON.parse(paymentOutbox.payload_json).studentId, qaStudent.id);
    pass("payment reduces debt and atomically queues Telegram outbox event");

    res = await request(baseUrl, `/api/students/${encodeURIComponent(qaStudent.id)}/ledger`, { cookie: adminCookie });
    assert.equal(res.status, 200);
    assert.equal(res.json.balance, -25000);
    assert.ok(res.json.ledger.some((transaction) => transaction.type === "charge"));
    assert.ok(res.json.ledger.some((transaction) => transaction.type === "payment"));
    pass("student ledger calculates balance from transactions");

    res = await request(baseUrl, `/api/students/${encodeURIComponent(qaStudent.id)}/transactions`, {
      method: "POST",
      cookie: adminCookie,
      body: { type: "payment", amount: 10000, description: "QA wallet payment", method: "click", idempotencyKey: "qa-wallet-payment" },
    });
    assert.equal(res.status, 201);
    assert.equal(res.json.balance, -15000);
    assert.equal(res.json.transaction.type, "payment");
    assert.equal(res.json.payment.amount, 10000);
    pass("admin adds wallet transaction");

    res = await request(baseUrl, "/api/students", { cookie: adminCookie });
    assert.equal(res.status, 200);
    const walletStudent = res.json.students.find((student) => student.id === qaStudent.id);
    assert.equal(walletStudent.debt, 15000);
    assert.equal(walletStudent.balance, -15000);
    pass("wallet transaction syncs student debt cache");

    res = await request(baseUrl, "/api/messages", {
      method: "POST",
      cookie: adminCookie,
      body: { to: "QA recipient", text: "QA message" },
    });
    assert.equal(res.status, 201);
    assert.equal(res.json.status, "queued");
    pass("admin queues manual message");

    res = await request(baseUrl, "/api/messages", {
      method: "POST",
      cookie: adminCookie,
      body: { to: `${qaStudent.name} (${qaStudent.phone})`, student_id: qaStudent.id, text: "QA linked message" },
    });
    assert.equal(res.status, 201);
    assert.equal(res.json.studentId, qaStudent.id);
    pass("admin queues linked student message");

    res = await request(baseUrl, "/api/leads", {
      method: "POST",
      cookie: adminCookie,
      body: { name: "QA Lead", phone: "+998 90 000 00 02", source: "Referral", status: "converted", note: "Ready" },
    });
    assert.equal(res.status, 201);
    const qaLead = res.json;
    assert.equal(res.json.status, "converted");
    assert.equal(res.json.stage, "paid");
    pass("admin creates lead");

    res = await request(baseUrl, "/api/leads", { cookie: adminCookie });
    assert.equal(res.status, 200);
    assert.ok(res.json.leads.some((lead) => lead.id === qaLead.id));
    assert.equal(res.json.leads.find((lead) => lead.id === qaLead.id).stageName, "To'lov qildi");
    assert.ok(res.json.leads.every((lead, index, leads) => index === 0 || leads[index - 1].createdAt >= lead.createdAt));
    pass("admin lists leads ordered by created date with stage names");

    res = await request(baseUrl, "/api/pipeline-stages", { cookie: adminCookie });
    assert.equal(res.status, 200);
    assert.ok(res.json.stages.some((stage) => stage.id === "new" && stage.isSystem));
    assert.ok(res.json.stages.some((stage) => stage.id === "paid" && stage.isSystem));
    pass("admin lists pipeline stages");

    res = await request(baseUrl, "/api/pipeline-stages", {
      method: "POST",
      cookie: adminCookie,
      body: { name: "QA Stage" },
    });
    assert.equal(res.status, 201);
    const qaStage = res.json;
    assert.equal(qaStage.name, "QA Stage");
    assert.equal(qaStage.isSystem, false);
    assert.ok(qaStage.createdAt);
    pass("admin creates pipeline stage");

    res = await request(baseUrl, `/api/pipeline-stages/${encodeURIComponent(qaStage.id)}`, {
      method: "PUT",
      cookie: adminCookie,
      body: { name: "QA Stage Updated" },
    });
    assert.equal(res.status, 200);
    assert.equal(res.json.name, "QA Stage Updated");
    pass("admin updates pipeline stage");

    res = await request(baseUrl, "/api/leads", {
      method: "POST",
      cookie: adminCookie,
      body: { name: "QA Custom Stage Lead", phone: "+998 90 000 00 03", source: "Manual", stage: qaStage.id },
    });
    assert.equal(res.status, 201);
    const customStageLead = res.json;
    assert.equal(customStageLead.stage, qaStage.id);
    assert.equal(customStageLead.status, "contacted");
    pass("admin creates lead in custom stage");

    res = await request(baseUrl, `/api/pipeline-stages/${encodeURIComponent(qaStage.id)}`, {
      method: "DELETE",
      cookie: adminCookie,
      body: {},
    });
    assert.equal(res.status, 200);
    assert.equal(res.json.movedTo, "new");
    res = await request(baseUrl, "/api/leads", { cookie: adminCookie });
    assert.equal(res.status, 200);
    assert.equal(res.json.leads.find((lead) => lead.id === customStageLead.id).stage, "new");
    pass("deleting custom pipeline stage moves leads to new");

    res = await request(baseUrl, `/api/leads/${encodeURIComponent(qaLead.id)}/stage`, {
      method: "PATCH",
      cookie: adminCookie,
      body: { stage: "trial_set" },
    });
    assert.equal(res.status, 200);
    assert.equal(res.json.stage, "trial_set");
    assert.equal(res.json.stageName, "Sinov belgilandi");
    assert.equal(res.json.status, "contacted");
    pass("admin updates lead stage");

    res = await request(baseUrl, `/api/leads/${encodeURIComponent(qaLead.id)}/stage`, {
      method: "PATCH",
      cookie: adminCookie,
      body: { stage: "bad_stage" },
    });
    assert.equal(res.status, 422);
    pass("lead stage validation");

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

    res = await request(baseUrl, "/api/telegram/test", {
      method: "POST",
      cookie: adminCookie,
      body: { chat_id: "123456789" },
    });
    assert.equal(res.status, 200);
    assert.equal(res.json.success, false);
    pass("Telegram test endpoint handles missing token");

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

    res = await request(baseUrl, `/api/students/${encodeURIComponent(qaStudent.id)}/chat-id`, {
      method: "POST",
      cookie: adminCookie,
      body: { chat_id: "987654321" },
    });
    assert.equal(res.status, 200);

    res = await request(baseUrl, "/api/messages", { cookie: adminCookie });
    assert.equal(res.status, 200);
    const messagesBeforeAttendance = res.json.messages.length;

    const qaLessonRoster = await request(baseUrl, `/api/lessons/${encodeURIComponent(qaLesson.id)}/students`, { cookie: adminCookie });
    assert.equal(qaLessonRoster.status, 200);
    res = await request(baseUrl, "/api/attendance", {
      method: "POST",
      cookie: adminCookie,
      body: {
        lessonId: qaLesson.id,
        topic: "QA attendance topic",
        homework: "QA homework",
        lessonNote: "QA lesson summary",
        records: qaLessonRoster.json.students.map((student) => ({
          studentId: student.id,
          status: student.id === qaStudent.id ? "late" : "present",
          note: student.id === qaStudent.id ? "Traffic" : "",
        })),
      },
    });
    assert.equal(res.status, 200);
    assert.equal(res.json.lesson.topic, "QA attendance topic");
    assert.equal(res.json.lesson.homework, "QA homework");
    const savedQaLessonRoster = await request(baseUrl, `/api/lessons/${encodeURIComponent(qaLesson.id)}/students`, { cookie: adminCookie });
    assert.equal(savedQaLessonRoster.status, 200);
    const savedQaStudent = savedQaLessonRoster.json.students.find((student) => student.id === qaStudent.id);
    assert.equal(savedQaStudent.attendanceNote, "Traffic");
    assert.ok(savedQaStudent.attendanceReasonName);
    res = await request(baseUrl, "/api/messages", { cookie: adminCookie });
    assert.equal(res.status, 200);
    assert.equal(res.json.messages.length, messagesBeforeAttendance);
    res = await request(baseUrl, "/api/bootstrap", { cookie: adminCookie });
    assert.equal(res.status, 200);
    assert.ok(Number(res.json.dashboard.stats.late || 0) >= 1);
    assert.ok(Number.isFinite(Number(res.json.dashboard.stats.excused || 0)));
    pass("attendance save does not auto-queue Telegram message");

    res = await request(baseUrl, `/api/lessons/${encodeURIComponent(qaLesson.id)}/send-attendance-alerts`, {
      method: "POST",
      cookie: adminCookie,
      body: {},
    });
    assert.equal(res.status, 200);
    assert.equal(res.json.success, true);
    assert.equal(res.json.sent_count, 1);
    assert.equal(res.json.skipped_count, 0);
    res = await request(baseUrl, "/api/messages", { cookie: adminCookie });
    assert.equal(res.status, 200);
    assert.ok(
      res.json.messages.some(
        (message) =>
          message.studentId === qaStudent.id &&
          message.text.includes("QA Updated guruhidan") &&
          message.text.includes("Azizbek") &&
          message.text.includes("<QA Student>") &&
          message.text.includes("10:00") &&
          message.text.includes("kechikdi"),
      ),
    );
    pass("manual attendance alert queues personalized Telegram message");

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
      ["teacher add wallet transaction", `/api/students/${englishStudent.id}/transactions`, { type: "payment", amount: 1000 }],
      ["teacher update student chat ID", `/api/students/${englishStudent.id}/chat-id`, { chat_id: "1" }],
      ["teacher create message", "/api/messages", { to: "No", text: "No" }],
      ["teacher process queue", "/api/messages/process", {}],
      ["teacher test Telegram", "/api/telegram/test", { chat_id: "1" }],
      ["teacher update settings", "/api/settings/telegram", { telegramBot: "@no_bot", telegramBotToken: "123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZ" }],
      ["teacher create pipeline stage", "/api/pipeline-stages", { name: "No" }],
      ["teacher import", "/api/import/students", { csv: `No,+998,No,${englishGroup.id},0` }],
    ]) {
      res = await request(baseUrl, endpoint, { method: "POST", cookie: teacherCookie, body });
      assert.equal(res.status, 403, label);
    }
    pass("teacher admin actions forbidden");

    for (const [label, method, endpoint, body] of [
      ["teacher update student", "PUT", `/api/students/${qaStudent.id}`, { name: "No", groupId: qaGroup.id, parentName: "No", status: "active" }],
      ["teacher archive student", "DELETE", `/api/students/${qaStudent.id}`, {}],
      ["teacher update group", "PUT", `/api/groups/${qaGroup.id}`, { name: "No", subject: "No", teacherId: teacher.id }],
      ["teacher archive group", "DELETE", `/api/groups/${qaGroup.id}`, {}],
      ["teacher update payment", "PUT", `/api/payments/${qaPayment.id}`, { studentId: qaStudent.id, amount: 1, type: "cash" }],
      ["teacher delete payment", "DELETE", `/api/payments/${qaPayment.id}`, {}],
    ]) {
      res = await request(baseUrl, endpoint, { method, cookie: teacherCookie, body });
      assert.equal(res.status, 403, label);
    }
    pass("teacher update-archive actions forbidden");

    res = await request(baseUrl, `/api/leads/${encodeURIComponent(qaLead.id)}/stage`, {
      method: "PATCH",
      cookie: teacherCookie,
      body: { stage: "lost" },
    });
    assert.equal(res.status, 403);
    pass("teacher cannot update lead stage");

    res = await request(baseUrl, "/api/attendance", {
      method: "POST",
      cookie: teacherCookie,
      body: { lessonId: otherTeacherLesson.id, records: [{ studentId: englishStudent.id, status: "present" }] },
    });
    assert.equal(res.status, 403);
    pass("teacher cannot save another teacher lesson");

    res = await request(baseUrl, `/api/lessons/${encodeURIComponent(otherTeacherLesson.id)}/send-attendance-alerts`, {
      method: "POST",
      cookie: teacherCookie,
      body: {},
    });
    assert.equal(res.status, 403);
    pass("teacher cannot send another teacher attendance alerts");

    res = await request(baseUrl, "/api/attendance", {
      method: "POST",
      cookie: teacherCookie,
      body: { lessonId: teacherLesson.id, records: [{ studentId: teacherStudent.id, status: "present" }] },
    });
    assert.equal(res.status, 200);
    pass("teacher saves assigned lesson attendance");

    res = await request(baseUrl, "/api/bootstrap", { cookie: teacherCookie });
    assert.equal(res.status, 200);
    assert.equal(res.json.lessons.length, 0);
    assert.equal(res.json.groups.length, 0);
    assert.equal(res.json.students.length, 0);
    assert.equal(res.json.payments.length, 0);
    assert.equal(res.json.messages.length, 0);
    assert.equal(res.json.leads.length, 0);
    assert.equal(res.json.dashboard.debtors.length, 0);
    assert.ok(!Object.prototype.hasOwnProperty.call(res.json.dashboard.stats, "debtTotal"));
    assert.ok(!Object.prototype.hasOwnProperty.call(res.json.dashboard.stats, "revenueToday"));
    pass("teacher bootstrap is server-scoped");

    const teacherLessonsList = await fetchJson(baseUrl, "/api/lessons", teacherCookie);
    assert.ok(teacherLessonsList.lessons.length > 0);
    assert.ok(teacherLessonsList.lessons.every((lesson) => lesson.teacherId === "user_teacher"));
    const teacherGroupsList = await fetchJson(baseUrl, "/api/groups", teacherCookie);
    assert.ok(teacherGroupsList.groups.every((group) => group.teacherId === "user_teacher" && !Object.prototype.hasOwnProperty.call(group, "monthlyFee")));
    const teacherStudentsList = await fetchJson(baseUrl, "/api/students", teacherCookie);
    assert.ok(teacherStudentsList.students.every((student) => !Object.prototype.hasOwnProperty.call(student, "debt") && !Object.prototype.hasOwnProperty.call(student, "balance") && !Object.prototype.hasOwnProperty.call(student, "telegramChatId")));
    pass("teacher lazy lists are server-scoped");

    res = await request(baseUrl, "/api/teachers/user_teacher", { cookie: teacherCookie });
    assert.equal(res.status, 200);
    assert.equal(res.json.teacher.id, "user_teacher");
    assert.ok(Array.isArray(res.json.groups));
    assert.ok(Array.isArray(res.json.workingHours));
    assert.ok(Array.isArray(res.json.upcomingLessons));
    assert.ok(!Object.prototype.hasOwnProperty.call(res.json.teacher, "username"));

    const ownGroup = teacherGroupsList.groups[0];
    const ownStudent = teacherStudentsList.students[0];
    assert.ok(ownGroup);
    assert.ok(ownStudent);
    res = await request(baseUrl, `/api/groups/${encodeURIComponent(ownGroup.id)}/profile`, { cookie: teacherCookie });
    assert.equal(res.status, 200);
    assert.ok(!Object.prototype.hasOwnProperty.call(res.json, "finance"));
    assert.ok(!Object.prototype.hasOwnProperty.call(res.json.group, "monthlyFee"));
    res = await request(baseUrl, `/api/students/${encodeURIComponent(ownStudent.id)}/profile`, { cookie: teacherCookie });
    assert.equal(res.status, 200);
    assert.ok(!Object.prototype.hasOwnProperty.call(res.json, "ledger"));
    assert.ok(!Object.prototype.hasOwnProperty.call(res.json, "balance"));
    const unassignedGroup = initial.groups.find((group) => group.teacherId !== "user_teacher");
    const unassignedStudent = initial.students.find((student) => student.groupId === unassignedGroup?.id);
    assert.ok(unassignedGroup);
    assert.ok(unassignedStudent);
    res = await request(baseUrl, `/api/groups/${encodeURIComponent(unassignedGroup.id)}/profile`, { cookie: teacherCookie });
    assert.equal(res.status, 403);
    res = await request(baseUrl, `/api/students/${encodeURIComponent(unassignedStudent.id)}/profile`, { cookie: teacherCookie });
    assert.equal(res.status, 403);
    pass("teacher self-service profiles are scoped and finance-safe");

    res = await request(baseUrl, `/api/schedules/week?date=${todayIso}`, { cookie: teacherCookie });
    assert.equal(res.status, 200);
    assert.ok(res.json.length > 0);
    assert.ok(res.json.every((lesson) => lesson.teacher_name === "Azizbek"));
    pass("teacher weekly schedule is scoped");

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
