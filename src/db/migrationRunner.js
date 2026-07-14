const { now } = require("../utils/time");
const commercialCore = require("./migrations/20260709_commercial_core");
const enterpriseFoundation = require("./migrations/20260709_enterprise_foundation");
const platformMultiTenant = require("./migrations/20260709_platform_multi_tenant");
const telegramProduction = require("./migrations/20260712_telegram_production");
const telegramContactOnboarding = require("./migrations/20260712_zz_telegram_contact_onboarding");
const teacherManagement = require("./migrations/20260712_zzz_teacher_management");
const studentManagement = require("./migrations/20260712_zzzz_student_management");
const groupManagement = require("./migrations/20260712_zzzzz_group_management");
const lessonManagement = require("./migrations/20260712_zzzzzz_lesson_management");
const lessonFinance = require("./migrations/20260712_zzzzzzz_lesson_finance");
const scheduleSeriesLineage = require("./migrations/20260713_schedule_series_lineage");

const migrations = [
  commercialCore,
  platformMultiTenant,
  enterpriseFoundation,
  telegramProduction,
  telegramContactOnboarding,
  teacherManagement,
  studentManagement,
  groupManagement,
  lessonManagement,
  lessonFinance,
  scheduleSeriesLineage,
].sort((left, right) => left.id.localeCompare(right.id));

function ensureMigrationTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);
}

function appliedMigrationIds(db) {
  ensureMigrationTable(db);
  return new Set(db.prepare("SELECT id FROM schema_migrations").all().map((row) => row.id));
}

function runVersionedMigrations(db) {
  ensureMigrationTable(db);
  const applied = appliedMigrationIds(db);
  for (const migration of migrations) {
    if (applied.has(migration.id)) continue;
    if (migration.transaction === false) {
      migration.up(db);
      db.prepare("INSERT INTO schema_migrations (id, name, applied_at) VALUES (?, ?, ?)").run(migration.id, migration.name, now());
      continue;
    }
    db.exec("BEGIN");
    try {
      migration.up(db);
      db.prepare("INSERT INTO schema_migrations (id, name, applied_at) VALUES (?, ?, ?)").run(migration.id, migration.name, now());
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
}

module.exports = { runVersionedMigrations };
