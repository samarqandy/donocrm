const assert = require("node:assert/strict");
const { getPostgresPool } = require("../src/infrastructure/database/postgres/pool");

const BASE_URL = process.env.DONO_UI_BASE_URL || "http://127.0.0.1:8081";
let activePool;

async function request(path, { method = "GET", cookie = "", body } = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json();
  if (response.status >= 400) throw new Error(`${method} ${path} returned ${response.status}: ${JSON.stringify(payload)}`);
  return { status: response.status, body: payload, cookie: response.headers.get("set-cookie")?.split(";")[0] || "" };
}

async function waitFor(check, label, timeoutMs = 15_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value = await check();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function run() {
  const postgres = getPostgresPool();
  if (!postgres) throw new Error("DATABASE_URL is required");
  activePool = postgres;
  const login = await request("/api/login", { method: "POST", body: { username: "admin", password: "admin123" } });
  const cookie = login.cookie;
  const suffix = Date.now().toString(36);

  const teacher = (await request("/api/teachers", {
    method: "POST", cookie,
    body: {
      name: `Reference Teacher ${suffix}`,
      specialization: "Mirror QA",
      employmentType: "part_time",
      maxWeeklyHours: 20,
      accessEnabled: false,
    },
  })).body;
  const group = (await request("/api/groups", {
    method: "POST", cookie,
    body: {
      name: `Reference Group ${suffix}`,
      subject: "Reference Mirror",
      teacherId: teacher.id,
      room: `Mirror-${suffix}`,
      monthlyFee: 1000,
      capacity: 10,
      status: "active",
    },
  })).body;
  const student = (await request("/api/students", {
    method: "POST", cookie,
    body: {
      name: `Reference Student ${suffix}`,
      parentName: "Reference Parent",
      phone: "+998900000777",
      groupId: group.id,
      debt: 0,
    },
  })).body;
  const lesson = (await request("/api/lessons", {
    method: "POST", cookie,
    body: { groupId: group.id, date: new Date().toLocaleDateString("en-CA"), time: "16:00 - 17:00" },
  })).body;

  await waitFor(async () => {
    const { rows } = await postgres.query(`
      SELECT
        EXISTS(SELECT 1 FROM teachers WHERE tenant_id = 'tenant_main' AND id = $1) AS teacher,
        EXISTS(SELECT 1 FROM groups WHERE tenant_id = 'tenant_main' AND id = $2) AS group_row,
        EXISTS(SELECT 1 FROM students WHERE tenant_id = 'tenant_main' AND id = $3) AS student,
        EXISTS(SELECT 1 FROM lessons WHERE tenant_id = 'tenant_main' AND id = $4) AS lesson,
        EXISTS(SELECT 1 FROM student_group_enrollments
               WHERE tenant_id = 'tenant_main' AND student_id = $3 AND group_id = $2 AND status = 'active') AS enrollment
    `, [teacher.id, group.id, student.id, lesson.id]);
    return Object.values(rows[0]).every(Boolean);
  }, "initial reference chain in PostgreSQL");

  let roster = (await request(`/api/lessons/${encodeURIComponent(lesson.id)}/students`, { cookie })).body;
  assert.ok(roster.students.some((row) => row.id === student.id), "new student is missing from PostgreSQL roster");

  const updatedTeacherName = `${teacher.name} Updated`;
  const updatedGroupName = `${group.name} Updated`;
  const updatedStudentName = `${student.name} Updated`;
  await request(`/api/teachers/${encodeURIComponent(teacher.id)}`, {
    method: "PUT", cookie,
    body: {
      name: updatedTeacherName,
      specialization: "Mirror QA Updated",
      employmentType: "part_time",
      maxWeeklyHours: 20,
      accessEnabled: false,
    },
  });
  await request(`/api/groups/${encodeURIComponent(group.id)}`, {
    method: "PUT", cookie,
    body: { ...group, name: updatedGroupName, teacherId: teacher.id, room: `Mirror-${suffix}-updated`, monthlyFee: 2000 },
  });
  await request(`/api/students/${encodeURIComponent(student.id)}`, {
    method: "PUT", cookie,
    body: {
      ...student,
      name: updatedStudentName,
      parentName: "Reference Parent Updated",
      groupId: group.id,
      status: "active",
    },
  });
  await request(`/api/lessons/${encodeURIComponent(lesson.id)}`, {
    method: "PUT", cookie,
    body: { version: lesson.version, topic: "Reference mirror updated topic" },
  });

  await waitFor(async () => {
    const { rows } = await postgres.query(`
      SELECT teacher.name AS teacher_name, group_row.name AS group_name,
             student.name AS student_name, lesson.topic
      FROM lessons lesson
      JOIN groups group_row ON group_row.tenant_id = lesson.tenant_id AND group_row.id = lesson.group_id
      JOIN teachers teacher ON teacher.tenant_id = group_row.tenant_id AND teacher.id = group_row.teacher_id
      JOIN students student ON student.tenant_id = group_row.tenant_id AND student.group_id = group_row.id
      WHERE lesson.tenant_id = 'tenant_main' AND lesson.id = $1 AND student.id = $2
    `, [lesson.id, student.id]);
    const row = rows[0];
    return row?.teacher_name === updatedTeacherName
      && row?.group_name === updatedGroupName
      && row?.student_name === updatedStudentName
      && row?.topic === "Reference mirror updated topic";
  }, "updated reference snapshots in PostgreSQL");

  await request(`/api/students/${encodeURIComponent(student.id)}`, { method: "DELETE", cookie, body: { reason: "Mirror archive drill" } });
  await waitFor(async () => {
    const { rows } = await postgres.query(`
      SELECT student.status,
             COUNT(*) FILTER (WHERE enrollment.status = 'active')::int AS active_enrollments
      FROM students student
      LEFT JOIN student_group_enrollments enrollment
        ON enrollment.tenant_id = student.tenant_id AND enrollment.student_id = student.id
      WHERE student.tenant_id = 'tenant_main' AND student.id = $1
      GROUP BY student.status
    `, [student.id]);
    return rows[0]?.status === "left" && Number(rows[0].active_enrollments) === 0;
  }, "archived student and closed enrollment in PostgreSQL");

  roster = (await request(`/api/lessons/${encodeURIComponent(lesson.id)}/students`, { cookie })).body;
  assert.ok(!roster.students.some((row) => row.id === student.id), "archived student remains in PostgreSQL roster");

  await request(`/api/students/${encodeURIComponent(student.id)}/restore`, { method: "POST", cookie, body: {} });
  await waitFor(async () => {
    const { rows } = await postgres.query(`
      SELECT EXISTS(
        SELECT 1 FROM student_group_enrollments
        WHERE tenant_id = 'tenant_main' AND student_id = $1 AND status = 'active'
      ) AS restored
    `, [student.id]);
    return rows[0].restored;
  }, "restored enrollment in PostgreSQL");
  roster = (await request(`/api/lessons/${encodeURIComponent(lesson.id)}/students`, { cookie })).body;
  assert.ok(roster.students.some((row) => row.id === student.id && row.name === updatedStudentName));

  const { rows: relayRows } = await postgres.query(`
    SELECT COUNT(*)::int AS mirrored
    FROM attendance_reference_mirror_versions
    WHERE tenant_id = 'tenant_main'
      AND aggregate_id = ANY($1::text[])
  `, [[teacher.id, group.id, student.id, lesson.id]]);
  assert.equal(Number(relayRows[0].mirrored), 4);
  console.log(JSON.stringify({
    ok: true,
    teacherId: teacher.id,
    groupId: group.id,
    studentId: student.id,
    lessonId: lesson.id,
    rosterCreateUpdateArchiveRestore: true,
  }, null, 2));
}

run()
  .catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (activePool) await activePool.end();
  });
