const { id } = require("../../utils/id");
const { now } = require("../../utils/time");

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

const rolePermissions = {
  admin: [
    "students.read",
    "students.manage",
    "groups.read",
    "groups.manage",
    "lessons.read",
    "lessons.manage",
    "attendance.read",
    "attendance.manage",
    "payments.read",
    "payments.manage",
    "payments.export",
    "leads.read",
    "leads.manage",
    "tasks.read",
    "tasks.manage",
    "settings.manage",
    "branches.manage",
    "subscriptions.manage",
    "finance.manage",
  ],
  teacher: ["students.read", "groups.read", "lessons.read", "attendance.read", "attendance.manage", "tasks.read"],
};

function seedMainBranches(db) {
  const timestamp = now();
  const tenants = db.prepare("SELECT id, name, created_at FROM tenants").all();
  const insert = db.prepare(
    `INSERT OR IGNORE INTO branches (id, tenant_id, name, status, is_main, created_at)
     VALUES (?, ?, ?, 'active', 1, ?)`,
  );
  tenants.forEach((tenant) => {
    const branchId = `branch_${tenant.id.replace(/^tenant_/, "").replace(/[^a-zA-Z0-9_]/g, "_")}`;
    insert.run(branchId, tenant.id, tenant.name || "Asosiy filial", tenant.created_at || timestamp);
  });
}

function seedRoles(db) {
  const timestamp = now();
  const tenants = db.prepare("SELECT id FROM tenants").all();
  const roleInsert = db.prepare(
    `INSERT OR IGNORE INTO roles (id, tenant_id, code, name, rank, interface, is_system, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
  );
  const permissionInsert = db.prepare(
    `INSERT OR IGNORE INTO role_permissions (role_id, permission, created_at)
     VALUES (?, ?, ?)`,
  );
  const userRoleInsert = db.prepare(
    `INSERT OR IGNORE INTO user_roles (user_id, role_id, tenant_id, created_at)
     VALUES (?, ?, ?, ?)`,
  );

  tenants.forEach((tenant) => {
    const adminRoleId = `${tenant.id}_role_admin`;
    const teacherRoleId = `${tenant.id}_role_teacher`;
    roleInsert.run(adminRoleId, tenant.id, "admin", "Administrator", 100, "administration", timestamp);
    roleInsert.run(teacherRoleId, tenant.id, "teacher", "O'qituvchi", 10, "teacher", timestamp);
    rolePermissions.admin.forEach((permission) => permissionInsert.run(adminRoleId, permission, timestamp));
    rolePermissions.teacher.forEach((permission) => permissionInsert.run(teacherRoleId, permission, timestamp));
  });

  const users = db.prepare("SELECT id, tenant_id, role FROM users WHERE tenant_id IS NOT NULL AND role IN ('admin', 'teacher')").all();
  users.forEach((user) => {
    userRoleInsert.run(user.id, `${user.tenant_id}_role_${user.role}`, user.tenant_id, timestamp);
  });
}

function seedFinanceDictionaries(db) {
  const timestamp = now();
  const tenants = db.prepare("SELECT id FROM tenants").all();
  const accountInsert = db.prepare(
    `INSERT OR IGNORE INTO finance_accounts (id, tenant_id, name, type, status, created_at)
     VALUES (?, ?, ?, ?, 'active', ?)`,
  );
  const categoryInsert = db.prepare(
    `INSERT OR IGNORE INTO finance_categories (id, tenant_id, name, kind, is_system, created_at)
     VALUES (?, ?, ?, ?, 1, ?)`,
  );
  tenants.forEach((tenant) => {
    accountInsert.run(`${tenant.id}_cash`, tenant.id, "Asosiy kassa", "cash", timestamp);
    accountInsert.run(`${tenant.id}_bank`, tenant.id, "Bank hisob raqami", "bank", timestamp);
    [
      ["tuition", "O'qish to'lovi", "income"],
      ["discount", "Chegirma", "income"],
      ["refund", "Qaytarish", "expense"],
      ["salary", "Oylik", "expense"],
      ["correction", "Tuzatish", "adjustment"],
    ].forEach(([code, name, kind]) => categoryInsert.run(`${tenant.id}_${code}`, tenant.id, name, kind, timestamp));
  });
}

function backfillBranchColumns(db) {
  const branchScopedTables = ["teachers", "groups", "students", "schedules", "lessons", "payments", "invoices_transactions"];
  branchScopedTables.forEach((tableName) => {
    const columns = tableColumns(db, tableName);
    addColumn(db, tableName, columns, "branch_id TEXT");
    db.prepare(
      `UPDATE ${tableName}
       SET branch_id = (
         SELECT b.id
         FROM branches b
         WHERE b.tenant_id = ${tableName}.tenant_id AND b.is_main = 1
         LIMIT 1
       )
       WHERE branch_id IS NULL OR branch_id = ''`,
    ).run();
  });
}

function up(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS branches (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
      is_main INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_branches_one_main
      ON branches(tenant_id)
      WHERE is_main = 1;

    CREATE INDEX IF NOT EXISTS idx_branches_tenant_status
      ON branches(tenant_id, status);

    CREATE TABLE IF NOT EXISTS user_branch_access (
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      PRIMARY KEY (tenant_id, user_id, branch_id)
    );

    CREATE TABLE IF NOT EXISTS roles (
      id TEXT PRIMARY KEY,
      tenant_id TEXT REFERENCES tenants(id) ON DELETE CASCADE,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      rank INTEGER NOT NULL DEFAULT 0,
      interface TEXT NOT NULL DEFAULT 'administration' CHECK(interface IN ('administration', 'teacher', 'client')),
      is_system INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      UNIQUE(tenant_id, code)
    );

    CREATE TABLE IF NOT EXISTS role_permissions (
      role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
      permission TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (role_id, permission)
    );

    CREATE TABLE IF NOT EXISTS user_roles (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      PRIMARY KEY (user_id, role_id)
    );

    CREATE TABLE IF NOT EXISTS platform_audit_logs (
      id TEXT PRIMARY KEY,
      actor_user_id TEXT NOT NULL,
      action TEXT NOT NULL,
      entity TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      tenant_id TEXT,
      metadata TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_platform_audit_created
      ON platform_audit_logs(created_at);

    CREATE INDEX IF NOT EXISTS idx_platform_audit_tenant
      ON platform_audit_logs(tenant_id, created_at);

    CREATE TABLE IF NOT EXISTS subscriptions (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      branch_id TEXT,
      student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      group_id TEXT REFERENCES groups(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'paused', 'completed', 'cancelled')),
      start_date TEXT NOT NULL,
      end_date TEXT,
      lessons_total INTEGER NOT NULL DEFAULT 0,
      lessons_used INTEGER NOT NULL DEFAULT 0,
      amount INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant_student
      ON subscriptions(tenant_id, student_id, status);

    CREATE TABLE IF NOT EXISTS teacher_working_hours (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      teacher_id TEXT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
      branch_id TEXT,
      weekday TEXT NOT NULL CHECK(weekday IN ('1', '2', '3', '4', '5', '6', '7')),
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(tenant_id, teacher_id, weekday, start_time, end_time)
    );

    CREATE TABLE IF NOT EXISTS finance_accounts (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('cash', 'bank', 'card', 'online')),
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'archived')),
      created_at TEXT NOT NULL,
      UNIQUE(tenant_id, name)
    );

    CREATE TABLE IF NOT EXISTS finance_categories (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      kind TEXT NOT NULL CHECK(kind IN ('income', 'expense', 'adjustment')),
      is_system INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      UNIQUE(tenant_id, name, kind)
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'completed', 'archived')),
      priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('low', 'normal', 'high')),
      due_at TEXT,
      assignee_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      author_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      related_type TEXT,
      related_id TEXT,
      note TEXT,
      created_at TEXT NOT NULL,
      completed_at TEXT,
      archived_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_tenant_status_due
      ON tasks(tenant_id, status, due_at);
  `);

  seedMainBranches(db);
  seedRoles(db);
  seedFinanceDictionaries(db);
  backfillBranchColumns(db);

  const tenantColumns = tableColumns(db, "tenants");
  addColumn(db, "tenants", tenantColumns, "suspended_at TEXT");
  addColumn(db, "tenants", tenantColumns, "suspended_reason TEXT");

  const lessonColumns = tableColumns(db, "lessons");
  addColumn(db, "lessons", lessonColumns, "lesson_type TEXT NOT NULL DEFAULT 'group'");
  addColumn(db, "lessons", lessonColumns, "is_trial INTEGER NOT NULL DEFAULT 0");
  addColumn(db, "lessons", lessonColumns, "cancelled_reason TEXT");

  const scheduleColumns = tableColumns(db, "schedules");
  addColumn(db, "schedules", scheduleColumns, "lesson_type TEXT NOT NULL DEFAULT 'group'");

  const transactionColumns = tableColumns(db, "invoices_transactions");
  addColumn(db, "invoices_transactions", transactionColumns, "account_id TEXT");
  addColumn(db, "invoices_transactions", transactionColumns, "category_id TEXT");

  const paymentColumns = tableColumns(db, "payments");
  addColumn(db, "payments", paymentColumns, "account_id TEXT");
  addColumn(db, "payments", paymentColumns, "category_id TEXT");

  const leadColumns = tableColumns(db, "leads");
  addColumn(db, "leads", leadColumns, "lost_reason TEXT");
  addColumn(db, "leads", leadColumns, "converted_student_id TEXT");

  const timestamp = now();
  const users = db.prepare("SELECT id, tenant_id FROM users WHERE tenant_id IS NOT NULL").all();
  const mainBranch = db.prepare("SELECT id FROM branches WHERE tenant_id = ? AND is_main = 1 LIMIT 1");
  const accessInsert = db.prepare(
    `INSERT OR IGNORE INTO user_branch_access (tenant_id, user_id, branch_id, created_at)
     VALUES (?, ?, ?, ?)`,
  );
  users.forEach((user) => {
    const branch = mainBranch.get(user.tenant_id);
    if (branch) accessInsert.run(user.tenant_id, user.id, branch.id, timestamp);
  });

  db.prepare("INSERT OR IGNORE INTO platform_audit_logs (id, actor_user_id, action, entity, entity_id, tenant_id, metadata, created_at) VALUES (?, ?, ?, ?, ?, NULL, ?, ?)").run(
    id(),
    "system",
    "enterprise_foundation_migrated",
    "system",
    "enterprise_foundation",
    JSON.stringify({ version: "20260709_enterprise_foundation" }),
    timestamp,
  );
}

module.exports = {
  id: "20260709_enterprise_foundation",
  name: "Enterprise SaaS foundation tables",
  up,
};
