function up(db) {
  const columns = db.prepare("PRAGMA table_info(attendance_reasons)").all().map((column) => column.name);
  if (!columns.includes("version")) {
    db.exec("ALTER TABLE attendance_reasons ADD COLUMN version INTEGER NOT NULL DEFAULT 1 CHECK(version > 0)");
  }
}

module.exports = {
  id: "20260715_zzzz_attendance_reason_version",
  name: "Version attendance reasons for bidirectional relay",
  up,
};
