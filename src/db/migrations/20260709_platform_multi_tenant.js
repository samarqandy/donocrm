const { hashPassword } = require("../../utils/password");

function tableColumns(db, tableName) {
  return db.prepare(`PRAGMA table_info(${tableName})`).all().map((column) => column.name);
}

function addColumn(db, tableName, columns, definition) {
  const columnName = definition.trim().split(/\s+/)[0];
  if (!columns.includes(columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${definition}`);
    columns.push(columnName);
  }
}

function tableSql(db, tableName) {
  return db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName)?.sql || "";
}

function rebuildUsersForPlatform(db) {
  const sql = tableSql(db, "users");
  const needsRoleRebuild = !/superadmin/.test(sql) || /super_admin/.test(sql);
  const needsTenantNullable = /tenant_id\s+TEXT\s+NOT\s+NULL/i.test(sql);
  if (!needsRoleRebuild && !needsTenantNullable) return;

  db.exec("PRAGMA foreign_keys = OFF");
  db.exec("BEGIN");
  try {
    db.exec(`
      CREATE TABLE users_new (
        id TEXT PRIMARY KEY,
        tenant_id TEXT REFERENCES tenants(id) ON DELETE CASCADE,
        username TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('superadmin', 'admin', 'teacher'))
      );

      INSERT INTO users_new (id, tenant_id, username, password, name, role)
      SELECT
        id,
        tenant_id,
        username,
        password,
        name,
        CASE role WHEN 'super_admin' THEN 'superadmin' ELSE role END
      FROM users
      WHERE role IN ('super_admin', 'superadmin', 'admin', 'teacher');

      DROP TABLE users;
      ALTER TABLE users_new RENAME TO users;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username);
    `);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  } finally {
    db.exec("PRAGMA foreign_keys = ON");
  }
}

function rebuildSessionsForPlatform(db) {
  const sql = tableSql(db, "sessions");
  const columns = tableColumns(db, "sessions");
  const needsTenantNullable = /tenant_id\s+TEXT\s+NOT\s+NULL/i.test(sql);
  const needsActiveTenant = !columns.includes("active_tenant_id");
  if (!needsTenantNullable && !needsActiveTenant) return;

  db.exec("PRAGMA foreign_keys = OFF");
  db.exec("BEGIN");
  try {
    db.exec(`
      CREATE TABLE sessions_new (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        tenant_id TEXT REFERENCES tenants(id) ON DELETE CASCADE,
        active_tenant_id TEXT REFERENCES tenants(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
      );

      INSERT INTO sessions_new (id, user_id, tenant_id, active_tenant_id, created_at, expires_at)
      SELECT id, user_id, tenant_id, ${columns.includes("active_tenant_id") ? "active_tenant_id" : "NULL"}, created_at, expires_at
      FROM sessions;

      DROP TABLE sessions;
      ALTER TABLE sessions_new RENAME TO sessions;
      CREATE INDEX IF NOT EXISTS idx_sessions_active_tenant ON sessions(active_tenant_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
    `);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  } finally {
    db.exec("PRAGMA foreign_keys = ON");
  }
}

function seedSuperAdmin(db) {
  const existing = db.prepare("SELECT id FROM users WHERE id = 'user_super' OR username = 'superadmin' LIMIT 1").get();
  if (!existing) {
    db.prepare("INSERT INTO users (id, tenant_id, username, password, name, role) VALUES (?, NULL, ?, ?, ?, ?)").run(
      "user_super",
      "superadmin",
      hashPassword("super123"),
      "Platform Egasi",
      "superadmin",
    );
    return;
  }
  db.prepare("UPDATE users SET tenant_id = NULL, username = 'superadmin', name = COALESCE(NULLIF(name, ''), 'Platform Egasi'), role = 'superadmin' WHERE id = ?").run(
    existing.id,
  );
}

function up(db) {
  const tenantColumns = tableColumns(db, "tenants");
  addColumn(db, "tenants", tenantColumns, "domain TEXT");
  db.prepare("UPDATE tenants SET domain = COALESCE(NULLIF(domain, ''), id) WHERE domain IS NULL OR domain = ''").run();
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_domain ON tenants(domain) WHERE domain IS NOT NULL AND domain != ''");

  rebuildUsersForPlatform(db);
  rebuildSessionsForPlatform(db);
  seedSuperAdmin(db);
}

module.exports = {
  id: "20260709_platform_multi_tenant",
  name: "Platform multi-tenancy foundation",
  transaction: false,
  up,
};
