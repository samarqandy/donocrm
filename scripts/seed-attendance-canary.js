const { getDb } = require("../src/db/client");
const { now, today } = require("../src/utils/time");

const TENANT_ID = "tenant_main";
const GROUP_ID = "group_itbasic";
const FIXTURE_COUNT = 15;

function timeAt(index) {
  const startMinutes = 6 * 60 + index * 35;
  const endMinutes = startMinutes + 30;
  const format = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  return { start: format(startMinutes), end: format(endMinutes) };
}

function run() {
  const db = getDb();
  const group = db.prepare(`
    SELECT id, teacher_id, branch_id, room FROM groups
    WHERE tenant_id = ? AND id = ? AND status = 'active'
  `).get(TENANT_ID, GROUP_ID);
  if (!group) throw new Error(`Active fixture group not found: ${GROUP_ID}`);
  const roster = db.prepare(`
    SELECT COUNT(*) AS count FROM student_group_enrollments
    WHERE tenant_id = ? AND group_id = ? AND status = 'active'
      AND start_date <= ? AND (end_date IS NULL OR end_date = '' OR ? < end_date)
  `).get(TENANT_ID, GROUP_ID, today(), today());
  if (Number(roster.count) < 2) throw new Error("Attendance canary requires at least two active students");

  const insert = db.prepare(`
    INSERT OR IGNORE INTO lessons
      (id, tenant_id, group_id, date, time, status, branch_id, teacher_id,
       room_name, start_time, end_time, lesson_type, is_trial, topic, note,
       created_by, created_at, updated_by, updated_at, attendance_version,
       version, financial_status, financial_version)
    VALUES (?, ?, ?, ?, ?, 'waiting', ?, ?, ?, ?, ?, 'group', 0, ?, ?,
            'canary-fixture', ?, 'canary-fixture', ?, 0, 1, 'unposted', 0)
  `);
  const timestamp = now();
  let created = 0;
  db.exec("BEGIN IMMEDIATE");
  try {
    for (let index = 0; index < FIXTURE_COUNT; index += 1) {
      const sequence = String(index + 1).padStart(2, "0");
      const time = timeAt(index);
      const result = insert.run(
        `ui_attendance_canary_${sequence}`,
        TENANT_ID,
        GROUP_ID,
        today(),
        `${time.start} - ${time.end}`,
        group.branch_id || null,
        group.teacher_id,
        group.room || null,
        time.start,
        time.end,
        `UI Canary ${sequence}`,
        "Playwright attendance canary fixture",
        timestamp,
        timestamp,
      );
      created += Number(result.changes || 0);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  const total = db.prepare("SELECT COUNT(*) AS count FROM lessons WHERE tenant_id = ? AND id LIKE 'ui_attendance_canary_%'").get(TENANT_ID).count;
  console.log(JSON.stringify({ ok: true, tenantId: TENANT_ID, groupId: GROUP_ID, created, total, roster: Number(roster.count) }, null, 2));
}

try {
  run();
} catch (error) {
  console.error(error.stack || error.message);
  process.exitCode = 1;
}
