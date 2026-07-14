const { normalizePhone } = require("../../utils/phone");

function columns(db, table) {
  return db.prepare(`PRAGMA table_info(${table})`).all().map((column) => column.name);
}

function up(db) {
  if (!columns(db, "students").includes("phone_normalized")) {
    db.exec("ALTER TABLE students ADD COLUMN phone_normalized TEXT");
  }
  const rows = db.prepare("SELECT id, tenant_id, phone FROM students").all();
  const update = db.prepare("UPDATE students SET phone_normalized = ? WHERE tenant_id = ? AND id = ?");
  rows.forEach((row) => update.run(normalizePhone(row.phone), row.tenant_id, row.id));
  db.exec("CREATE INDEX IF NOT EXISTS idx_students_parent_phone ON students(tenant_id, phone_normalized, status)");
}

module.exports = {
  id: "20260712_zz_telegram_contact_onboarding",
  name: "Parent phone identity for Telegram onboarding",
  up,
};
