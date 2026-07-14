#!/usr/bin/env node

const { DatabaseSync } = require("node:sqlite");
const { sqliteFile } = require("../src/config/app");
const { id } = require("../src/utils/id");
const { now } = require("../src/utils/time");
const { addDays, isoDate, weekRange } = require("../src/utils/schedule");

const TENANT_ID = process.env.DEFAULT_TENANT_ID || "tenant_main";
const PREFIX = "demo_full_";

function stageStatus(stage) {
  if (stage === "paid") return "converted";
  if (stage !== "new" && stage !== "lost") return "contacted";
  return "new";
}

function syncStudentBalance(db, studentId) {
  const balance = Number(
    db
      .prepare(
        `SELECT COALESCE(SUM(CASE WHEN effect = 'credit' THEN amount WHEN effect = 'debit' THEN -amount WHEN type IN ('payment', 'discount') THEN amount ELSE -amount END), 0) AS balance
         FROM invoices_transactions
         WHERE tenant_id = ? AND student_id = ?`,
      )
      .get(TENANT_ID, studentId).balance || 0,
  );
  db.prepare("UPDATE students SET balance = ?, debt = ? WHERE tenant_id = ? AND id = ?").run(
    balance,
    balance < 0 ? Math.round(Math.abs(balance)) : 0,
    TENANT_ID,
    studentId,
  );
}

function insertOnce(db, sql, keySql, keyParams, insertParams) {
  const existing = db.prepare(keySql).get(...keyParams);
  if (existing) return existing;
  db.prepare(sql).run(...insertParams);
  return db.prepare(keySql).get(...keyParams);
}

function insertLedgerOnce(db, studentId, type, amount, description, invoiceDate, createdAt) {
  const existing = db
    .prepare(
      `SELECT id FROM invoices_transactions
       WHERE tenant_id = ? AND student_id = ? AND type = ? AND amount = ? AND description = ? AND invoice_date = ?
       LIMIT 1`,
    )
    .get(TENANT_ID, studentId, type, amount, description, invoiceDate);
  if (existing) return;
  db.prepare(
    `INSERT INTO invoices_transactions (tenant_id, student_id, type, amount, description, invoice_date, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(TENANT_ID, studentId, type, amount, description, invoiceDate, createdAt);
}

function lessonTime(start, end) {
  return `${start} - ${end}`;
}

function cleanup(db) {
  db.exec("BEGIN");
  try {
    db.prepare(`DELETE FROM attendance WHERE tenant_id = ? AND (id LIKE ? OR lesson_id LIKE ? OR student_id LIKE ?)`).run(TENANT_ID, `${PREFIX}%`, `${PREFIX}%`, `${PREFIX}%`);
    db.prepare(`DELETE FROM messages WHERE tenant_id = ? AND (id LIKE ? OR student_id LIKE ? OR recipient LIKE '[DEMO] %')`).run(TENANT_ID, `${PREFIX}%`, `${PREFIX}%`);
    db.prepare(`DELETE FROM payments WHERE tenant_id = ? AND (id LIKE ? OR student_id LIKE ?)`).run(TENANT_ID, `${PREFIX}%`, `${PREFIX}%`);
    db.prepare(`DELETE FROM invoices_transactions WHERE tenant_id = ? AND (student_id LIKE ? OR description LIKE '[DEMO]%')`).run(TENANT_ID, `${PREFIX}%`);
    db.prepare(`DELETE FROM lessons WHERE tenant_id = ? AND (id LIKE ? OR group_id LIKE ?)`).run(TENANT_ID, `${PREFIX}%`, `${PREFIX}%`);
    db.prepare(`DELETE FROM schedules WHERE tenant_id = ? AND (group_id LIKE ? OR lesson_link LIKE '[demo_full]%')`).run(TENANT_ID, `${PREFIX}%`);
    db.prepare(`DELETE FROM leads WHERE tenant_id = ? AND id LIKE ?`).run(TENANT_ID, `${PREFIX}%`);
    db.prepare(`DELETE FROM audit_logs WHERE tenant_id = ? AND id LIKE ?`).run(TENANT_ID, `${PREFIX}%`);
    db.prepare(`DELETE FROM students WHERE tenant_id = ? AND id LIKE ?`).run(TENANT_ID, `${PREFIX}%`);
    db.prepare(`DELETE FROM groups WHERE tenant_id = ? AND id LIKE ?`).run(TENANT_ID, `${PREFIX}%`);
    db.prepare(`DELETE FROM teachers WHERE tenant_id = ? AND id LIKE ?`).run(TENANT_ID, `${PREFIX}%`);
    db.prepare(`DELETE FROM rooms WHERE tenant_id = ? AND id LIKE ?`).run(TENANT_ID, `${PREFIX}%`);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function seed(db) {
  const timestamp = now();
  const range = weekRange(new Date().toISOString().slice(0, 10));
  const weekStart = new Date(`${range.startDate}T00:00:00.000Z`);
  const dates = Array.from({ length: 7 }, (_, index) => isoDate(addDays(weekStart, index)));

  const teachers = [
    [`${PREFIX}teacher_nodira`, "Nodira Rahmonova", "+998 90 610 10 10"],
    [`${PREFIX}teacher_timur`, "Timur Sobirov", "+998 90 620 20 20"],
  ];
  const rooms = [
    [`${PREFIX}room_1`, "A-101"],
    [`${PREFIX}room_2`, "B-202"],
    [`${PREFIX}room_online`, "Online"],
  ];
  const groups = [
    [`${PREFIX}group_ielts`, "IELTS Intensive", "Ingliz tili", `${PREFIX}teacher_nodira`, "A-101", 850000],
    [`${PREFIX}group_frontend`, "Frontend Foundation", "Dasturlash", `${PREFIX}teacher_timur`, "B-202", 900000],
    [`${PREFIX}group_kids`, "Kids English", "Ingliz tili", "user_teacher", "A-101", 500000],
  ];
  const students = [
    [`${PREFIX}student_ali`, "Ali Mansurov", `${PREFIX}group_ielts`, "Dilbar Mansurova", "+998 90 700 10 01", "1007001001", "active"],
    [`${PREFIX}student_dilnoza`, "Dilnoza Ortiqova", `${PREFIX}group_ielts`, "Shahnoza Ortiqova", "+998 90 700 10 02", "1007001002", "active"],
    [`${PREFIX}student_sardor`, "Sardor Nabiyev", `${PREFIX}group_frontend`, "Bahrom Nabiyev", "+998 90 700 10 03", "1007001003", "active"],
    [`${PREFIX}student_madina`, "Madina Qodirova", `${PREFIX}group_frontend`, "Gulnora Qodirova", "+998 90 700 10 04", "", "frozen"],
    [`${PREFIX}student_bekzod`, "Bekzod Karimov", `${PREFIX}group_kids`, "Malika Karimova", "+998 90 700 10 05", "1007001005", "active"],
    [`${PREFIX}student_zarina`, "Zarina Rasulova", `${PREFIX}group_kids`, "Aziz Rasulov", "+998 90 700 10 06", "", "left"],
  ];
  const schedules = [
    [`${PREFIX}group_ielts`, `${PREFIX}teacher_nodira`, `${PREFIX}room_1`, "1", "09:00", "10:30"],
    [`${PREFIX}group_ielts`, `${PREFIX}teacher_nodira`, `${PREFIX}room_1`, "3", "09:00", "10:30"],
    [`${PREFIX}group_frontend`, `${PREFIX}teacher_timur`, `${PREFIX}room_2`, "2", "15:00", "16:30"],
    [`${PREFIX}group_frontend`, `${PREFIX}teacher_timur`, `${PREFIX}room_2`, "4", "15:00", "16:30"],
    [`${PREFIX}group_kids`, "user_teacher", `${PREFIX}room_1`, "5", "17:00", "18:00"],
    [`${PREFIX}group_kids`, "user_teacher", `${PREFIX}room_online`, "6", "11:00", "12:00"],
  ];
  const lessons = [
    [`${PREFIX}lesson_ielts_mon`, `${PREFIX}group_ielts`, dates[0], "09:00", "10:30", "completed"],
    [`${PREFIX}lesson_front_tue`, `${PREFIX}group_frontend`, dates[1], "15:00", "16:30", "waiting"],
    [`${PREFIX}lesson_ielts_wed`, `${PREFIX}group_ielts`, dates[2], "09:00", "10:30", "waiting"],
    [`${PREFIX}lesson_front_thu`, `${PREFIX}group_frontend`, dates[3], "15:00", "16:30", "cancelled"],
    [`${PREFIX}lesson_kids_fri`, `${PREFIX}group_kids`, dates[4], "17:00", "18:00", "waiting"],
    [`${PREFIX}lesson_kids_sat`, `${PREFIX}group_kids`, dates[5], "11:00", "12:00", "waiting"],
  ];
  const ledger = [
    [`${PREFIX}student_ali`, "charge", 850000, "[DEMO] IELTS oylik to'lov", dates[0]],
    [`${PREFIX}student_ali`, "payment", 500000, "[DEMO] Click orqali to'lov", dates[0]],
    [`${PREFIX}student_dilnoza`, "charge", 850000, "[DEMO] IELTS oylik to'lov", dates[0]],
    [`${PREFIX}student_dilnoza`, "discount", 100000, "[DEMO] Oilaviy chegirma", dates[1]],
    [`${PREFIX}student_dilnoza`, "payment", 850000, "[DEMO] Naqd to'lov", dates[1]],
    [`${PREFIX}student_sardor`, "charge", 900000, "[DEMO] Frontend oylik to'lov", dates[1]],
    [`${PREFIX}student_sardor`, "payment", 300000, "[DEMO] Bank orqali to'lov", dates[2]],
    [`${PREFIX}student_madina`, "charge", 900000, "[DEMO] Frontend oylik to'lov", dates[1]],
    [`${PREFIX}student_bekzod`, "charge", 500000, "[DEMO] Kids English oylik to'lov", dates[4]],
    [`${PREFIX}student_bekzod`, "payment", 500000, "[DEMO] Payme orqali to'lov", dates[4]],
    [`${PREFIX}student_zarina`, "charge", 500000, "[DEMO] Kids English oylik to'lov", dates[4]],
    [`${PREFIX}student_zarina`, "refund", 100000, "[DEMO] Qaytarilgan to'lov", dates[5]],
  ];
  const payments = [
    [`${PREFIX}pay_ali`, `${PREFIX}student_ali`, "Ali Mansurov", 500000, "card", dates[0]],
    [`${PREFIX}pay_dilnoza`, `${PREFIX}student_dilnoza`, "Dilnoza Ortiqova", 850000, "cash", dates[1]],
    [`${PREFIX}pay_sardor`, `${PREFIX}student_sardor`, "Sardor Nabiyev", 300000, "transfer", dates[2]],
    [`${PREFIX}pay_bekzod`, `${PREFIX}student_bekzod`, "Bekzod Karimov", 500000, "card", dates[4]],
  ];
  const messages = [
    [`${PREFIX}msg_queued_1`, `${PREFIX}student_ali`, "Ali Mansurov", "To'lov eslatmasi: 350,000 so'm qarzdorlik mavjud.", "queued", 0, null],
    [`${PREFIX}msg_sent_1`, `${PREFIX}student_dilnoza`, "Dilnoza Ortiqova", "To'lov qabul qilindi. Rahmat!", "sent", 1, timestamp],
    [`${PREFIX}msg_failed_1`, `${PREFIX}student_madina`, "Madina Qodirova", "Telegram ID topilmadi. Xabar yuborilmadi.", "failed", 3, timestamp],
    [`${PREFIX}msg_queued_2`, `${PREFIX}student_sardor`, "Sardor Nabiyev", "Bugungi dars 15:00 da boshlanadi.", "queued", 0, null],
  ];
  const leads = [
    [`${PREFIX}lead_new`, "Aziza Trial", "+998 90 710 00 01", "Instagram", "new", "Nodira", "Qo'ng'iroq qilish", "Yangi murojaat"],
    [`${PREFIX}lead_contacted`, "Javlon IELTS", "+998 90 710 00 02", "Telegram", "contacted", "Administrator", "Narx yuborish", "Bog'lanildi"],
    [`${PREFIX}lead_trial_set`, "Murod Frontend", "+998 90 710 00 03", "Sayt", "trial_set", "Timur", "Sinov dars", "Sinov belgilandi"],
    [`${PREFIX}lead_trial_passed`, "Sevara Kids", "+998 90 710 00 04", "Referral", "trial_passed", "Azizbek", "To'lov kutilyapti", "Sinov o'tdi"],
    [`${PREFIX}lead_paid`, "Kamron Paid", "+998 90 710 00 05", "Instagram", "paid", "Administrator", "Guruhga qo'shish", "To'lov qildi"],
    [`${PREFIX}lead_lost`, "Nozima Lost", "+998 90 710 00 06", "Telegram", "lost", "Administrator", "Yopildi", "Rad etdi"],
  ];

  db.exec("BEGIN");
  try {
    const teacherStmt = db.prepare("INSERT OR IGNORE INTO teachers (id, tenant_id, name, phone) VALUES (?, ?, ?, ?)");
    teachers.forEach((row) => teacherStmt.run(row[0], TENANT_ID, row[1], row[2]));

    const roomStmt = db.prepare("INSERT OR IGNORE INTO rooms (id, tenant_id, name, created_at) VALUES (?, ?, ?, ?)");
    rooms.forEach((row) => roomStmt.run(row[0], TENANT_ID, row[1], timestamp));

    const groupStmt = db.prepare(
      "INSERT OR IGNORE INTO groups (id, tenant_id, name, subject, teacher_id, room, monthly_fee, active) VALUES (?, ?, ?, ?, ?, ?, ?, 1)",
    );
    groups.forEach((row) => groupStmt.run(row[0], TENANT_ID, row[1], row[2], row[3], row[4], row[5]));

    const studentStmt = db.prepare(
      "INSERT OR IGNORE INTO students (id, tenant_id, name, group_id, parent_name, phone, telegram_chat_id, debt, balance, status) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?)",
    );
    students.forEach((row) => studentStmt.run(row[0], TENANT_ID, row[1], row[2], row[3], row[4], row[5], row[6]));

    schedules.forEach((row) => {
      insertOnce(
        db,
        `INSERT INTO schedules (tenant_id, group_id, teacher_id, room_id, weekday, start_time, end_time, is_recurring, lesson_link, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        `SELECT id FROM schedules WHERE tenant_id = ? AND group_id = ? AND weekday = ? AND start_time = ? AND end_time = ? LIMIT 1`,
        [TENANT_ID, row[0], row[3], row[4], row[5]],
        [TENANT_ID, row[0], row[1], row[2], row[3], row[4], row[5], "[demo_full] recurring", timestamp],
      );
    });

    const scheduleByGroupDay = db.prepare("SELECT id FROM schedules WHERE tenant_id = ? AND group_id = ? AND weekday = ? AND start_time = ? AND end_time = ? LIMIT 1");
    const lessonStmt = db.prepare(
      "INSERT OR IGNORE INTO lessons (id, tenant_id, group_id, schedule_id, date, time, status, attendance_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    );
    lessons.forEach((row) => {
      const weekday = String(dates.indexOf(row[2]) + 1);
      const schedule = scheduleByGroupDay.get(TENANT_ID, row[1], weekday, row[3], row[4]);
      lessonStmt.run(row[0], TENANT_ID, row[1], schedule?.id || null, row[2], lessonTime(row[3], row[4]), row[5], "{}");
    });

    ledger.forEach((row) => insertLedgerOnce(db, row[0], row[1], row[2], row[3], row[4], timestamp));

    const paymentStmt = db.prepare(
      "INSERT OR IGNORE INTO payments (id, tenant_id, student_id, student_name, amount, type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    );
    payments.forEach((row) => paymentStmt.run(row[0], TENANT_ID, row[1], row[2], row[3], row[4], `${row[5]}T09:00:00.000Z`));

    const attendanceStmt = db.prepare(
      "INSERT OR IGNORE INTO attendance (id, tenant_id, lesson_id, student_id, status, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    );
    [
      [`${PREFIX}att_1`, `${PREFIX}lesson_ielts_mon`, `${PREFIX}student_ali`, "present", "Faol qatnashdi"],
      [`${PREFIX}att_2`, `${PREFIX}lesson_ielts_mon`, `${PREFIX}student_dilnoza`, "late", "10 daqiqa kechikdi"],
      [`${PREFIX}att_3`, `${PREFIX}lesson_front_tue`, `${PREFIX}student_sardor`, "present", ""],
      [`${PREFIX}att_4`, `${PREFIX}lesson_front_tue`, `${PREFIX}student_madina`, "absent", "Kasallik"],
      [`${PREFIX}att_5`, `${PREFIX}lesson_kids_fri`, `${PREFIX}student_bekzod`, "present", ""],
      [`${PREFIX}att_6`, `${PREFIX}lesson_kids_fri`, `${PREFIX}student_zarina`, "excused", "Oldindan ogohlantirgan"],
    ].forEach((row) => attendanceStmt.run(row[0], TENANT_ID, row[1], row[2], row[3], row[4], timestamp));

    const messageStmt = db.prepare(
      "INSERT OR IGNORE INTO messages (id, tenant_id, student_id, recipient, channel, text, status, attempts, created_at, sent_at) VALUES (?, ?, ?, ?, 'telegram', ?, ?, ?, ?, ?)",
    );
    messages.forEach((row) => messageStmt.run(row[0], TENANT_ID, row[1], `[DEMO] ${row[2]}`, row[3], row[4], row[5], timestamp, row[6]));

    const leadStmt = db.prepare(
      `INSERT OR IGNORE INTO leads (id, tenant_id, name, phone, source, status, stage, responsible_admin, next_action, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    leads.forEach((row, index) => {
      leadStmt.run(row[0], TENANT_ID, row[1], row[2], row[3], stageStatus(row[4]), row[4], row[5], row[6], row[7], `${dates[Math.min(index, dates.length - 1)]}T10:00:00.000Z`);
    });

    const auditStmt = db.prepare(
      "INSERT OR IGNORE INTO audit_logs (id, tenant_id, user_id, role, action, entity, entity_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    );
    [
      [`${PREFIX}audit_student`, "created", "student", `${PREFIX}student_ali`],
      [`${PREFIX}audit_payment`, "created", "payment", `${PREFIX}pay_ali`],
      [`${PREFIX}audit_lesson`, "created", "lesson", `${PREFIX}lesson_ielts_mon`],
      [`${PREFIX}audit_message`, "queued", "message", `${PREFIX}msg_queued_1`],
      [`${PREFIX}audit_lead`, "updated", "lead_stage", `${PREFIX}lead_trial_set`],
    ].forEach((row) => auditStmt.run(row[0], TENANT_ID, "user_admin", "admin", row[1], row[2], row[3], timestamp));

    students.forEach((row) => syncStudentBalance(db, row[0]));
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function printCounts(db) {
  const tables = ["teachers", "groups", "students", "rooms", "schedules", "lessons", "attendance", "payments", "invoices_transactions", "messages", "leads", "audit_logs"];
  tables.forEach((table) => {
    const row = db.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE tenant_id = ?`).get(TENANT_ID);
    console.log(`${table}: ${row.count}`);
  });
}

const db = new DatabaseSync(sqliteFile);
db.exec("PRAGMA foreign_keys = ON");

if (process.argv.includes("--clear")) {
  cleanup(db);
  console.log("Demo data cleared.");
} else {
  seed(db);
  console.log("Demo data seeded.");
}
printCounts(db);
db.close();
