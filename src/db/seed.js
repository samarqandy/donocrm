const { id } = require("../utils/id");
const { hashPassword } = require("../utils/password");
const { now, today } = require("../utils/time");

function seed(db) {
  const existing = db.prepare("SELECT COUNT(*) AS count FROM tenants").get();
  if (existing.count > 0) return;

  const createdAt = now();

  db.exec("BEGIN");
  try {
    db.prepare(
      "INSERT INTO tenants (id, name, type, status, plan, language, telegram_bot, telegram_bot_token, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run("tenant_main", "EduCenter", "learning_center", "active", "standard", "uz", "@dono_bot", "", createdAt);

    db.prepare("INSERT INTO users (id, tenant_id, username, password, name, role) VALUES (?, ?, ?, ?, ?, ?)").run(
      "user_admin",
      "tenant_main",
      "admin",
      hashPassword("admin123"),
      "Administrator",
      "admin",
    );
    db.prepare("INSERT INTO users (id, tenant_id, username, password, name, role) VALUES (?, ?, ?, ?, ?, ?)").run(
      "user_teacher",
      "tenant_main",
      "teacher",
      hashPassword("teacher123"),
      "Azizbek",
      "teacher",
    );

    const teacherStmt = db.prepare("INSERT INTO teachers (id, tenant_id, name, phone) VALUES (?, ?, ?, ?)");
    [
      ["user_teacher", "Azizbek", "+998 90 100 20 30"],
      ["teacher_bekzod", "Bekzod", "+998 90 200 30 40"],
      ["teacher_jasur", "Jasur", "+998 90 300 40 50"],
      ["teacher_sulton", "Sulton", "+998 90 400 50 60"],
    ].forEach(([teacherId, name, phone]) => teacherStmt.run(teacherId, "tenant_main", name, phone));

    const groupStmt = db.prepare(
      "INSERT INTO groups (id, tenant_id, name, subject, teacher_id, room, monthly_fee, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    );
    [
      ["group_english", "English Beginner", "Ingliz tili", "user_teacher", "1-xona", 450000],
      ["group_math", "Math Basic", "Matematika", "teacher_bekzod", "2-xona", 400000],
      ["group_itpro", "IT Pro", "Dasturlash", "teacher_jasur", "3-xona", 600000],
      ["group_itbasic", "IT Basic", "Dasturlash", "user_teacher", "3-xona", 550000],
      ["group_chess", "Chess Club", "Shaxmat", "teacher_sulton", "4-xona", 300000],
    ].forEach((row) => groupStmt.run(row[0], "tenant_main", row[1], row[2], row[3], row[4], row[5], 1));

    const studentStmt = db.prepare(
      "INSERT INTO students (id, tenant_id, name, group_id, parent_name, phone, telegram_chat_id, debt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    );
    [
      ["Ali Valiyev", "group_english", "Nodira Valiyeva", "+998 90 111 22 33", 150000],
      ["Hasan Saidov", "group_math", "Dilshod Saidov", "+998 91 222 33 44", 100000],
      ["Olimjon Karimov", "group_itpro", "Malika Karimova", "+998 93 333 44 55", 75000],
      ["Asadbek Yusufov", "group_english", "Zarina Yusufova", "+998 94 444 55 66", 50000],
      ["Madina Akramova", "group_chess", "Aziza Akramova", "+998 95 555 66 77", 0],
      ["Javohir Ergashev", "group_itbasic", "Sardor Ergashev", "+998 97 777 88 99", 0],
    ].forEach((row) => studentStmt.run(id(), "tenant_main", row[0], row[1], row[2], row[3], "", row[4]));

    const lessonStmt = db.prepare("INSERT INTO lessons (id, tenant_id, group_id, date, time, status) VALUES (?, ?, ?, ?, ?, ?)");
    [
      ["lesson_1", "group_english", "17:00 - 18:30", "completed"],
      ["lesson_2", "group_math", "18:30 - 20:00", "completed"],
      ["lesson_3", "group_itbasic", "20:00 - 21:30", "waiting"],
      ["lesson_4", "group_chess", "21:30 - 23:00", "waiting"],
    ].forEach((row) => lessonStmt.run(row[0], "tenant_main", row[1], today(), row[2], row[3]));

    const messageStmt = db.prepare(
      "INSERT INTO messages (id, tenant_id, recipient, channel, text, status, attempts, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    );
    messageStmt.run(id(), "tenant_main", "English Beginner ota-onalari", "telegram", "Bugungi dars yakunlandi. Davomat: 11/12.", "sent", 1, createdAt);
    messageStmt.run(id(), "tenant_main", "May oyi qarzdorlari", "telegram", "Iltimos, may oyi to'lovini yakunlang.", "queued", 0, createdAt);

    db.prepare("INSERT INTO leads (id, tenant_id, name, phone, source, status, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(
      id(),
      "tenant_main",
      "Yangi lead",
      "+998 90 000 00 00",
      "Instagram",
      "new",
      "Yangi qiziqqan mijoz",
      createdAt,
    );

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

module.exports = { seed };
