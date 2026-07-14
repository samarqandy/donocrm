const schema = `
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;

CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  domain TEXT,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  plan TEXT NOT NULL,
  language TEXT NOT NULL,
  telegram_bot TEXT,
  telegram_bot_token TEXT,
  telegram_bot_token_encrypted TEXT,
  telegram_update_offset INTEGER NOT NULL DEFAULT 0,
  suspended_at TEXT,
  suspended_reason TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  tenant_id TEXT REFERENCES tenants(id) ON DELETE CASCADE,
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('superadmin', 'admin', 'teacher')),
  status TEXT NOT NULL DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id TEXT REFERENCES tenants(id) ON DELETE CASCADE,
  active_tenant_id TEXT REFERENCES tenants(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS teachers (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  branch_id TEXT,
  phone TEXT,
  email TEXT,
  specialization TEXT,
  employment_type TEXT NOT NULL DEFAULT 'full_time',
  status TEXT NOT NULL DEFAULT 'active',
  hired_at TEXT,
  max_weekly_minutes INTEGER NOT NULL DEFAULT 2400,
  note TEXT,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id TEXT,
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  teacher_id TEXT NOT NULL,
  room TEXT,
  monthly_fee INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  description TEXT,
  level TEXT,
  capacity INTEGER NOT NULL DEFAULT 0 CHECK(capacity >= 0),
  start_date TEXT,
  end_date TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('draft', 'active', 'completed', 'cancelled', 'archived')),
  color TEXT,
  note TEXT,
  archived_at TEXT,
  archive_reason TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id TEXT,
  name TEXT NOT NULL,
  group_id TEXT NOT NULL REFERENCES groups(id),
  parent_name TEXT NOT NULL,
  phone TEXT,
  phone_normalized TEXT,
  student_phone TEXT,
  email TEXT,
  birth_date TEXT,
  gender TEXT,
  address TEXT,
  source TEXT,
  enrollment_date TEXT,
  note TEXT,
  archived_at TEXT,
  archive_reason TEXT,
  created_at TEXT,
  updated_at TEXT,
  telegram_chat_id TEXT,
  debt INTEGER NOT NULL DEFAULT 0,
  balance REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'frozen', 'left'))
);

CREATE TABLE IF NOT EXISTS guardians (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  phone_normalized TEXT,
  email TEXT,
  telegram_chat_id TEXT,
  preferred_language TEXT NOT NULL DEFAULT 'uz',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS student_guardians (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  guardian_id TEXT NOT NULL REFERENCES guardians(id) ON DELETE CASCADE,
  relationship TEXT NOT NULL DEFAULT 'guardian',
  is_primary INTEGER NOT NULL DEFAULT 0,
  is_emergency INTEGER NOT NULL DEFAULT 0,
  receives_notifications INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  UNIQUE(tenant_id, student_id, guardian_id)
);

CREATE TABLE IF NOT EXISTS student_group_enrollments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK(status IN ('active', 'completed', 'transferred', 'withdrawn')),
  start_date TEXT NOT NULL,
  end_date TEXT,
  reason TEXT,
  created_by TEXT,
  ended_by TEXT,
  ended_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS invoices_transactions (
  id INTEGER PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  branch_id TEXT,
  type TEXT NOT NULL CHECK(type IN ('payment', 'charge', 'discount', 'refund', 'correction')),
  amount REAL NOT NULL CHECK(amount > 0),
  description TEXT,
  invoice_date TEXT NOT NULL,
  created_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  voided_at TEXT,
  voided_by TEXT,
  void_reason TEXT,
  idempotency_key TEXT,
  account_id TEXT,
  category_id TEXT,
  effect TEXT CHECK(effect IS NULL OR effect IN ('debit', 'credit')),
  currency TEXT NOT NULL DEFAULT 'UZS',
  source_type TEXT,
  source_id TEXT,
  reversal_of_id INTEGER REFERENCES invoices_transactions(id) ON DELETE RESTRICT,
  request_fingerprint TEXT
);

CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS schedules (
  id INTEGER PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id TEXT,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  teacher_id TEXT REFERENCES teachers(id) ON DELETE SET NULL,
  room_id TEXT REFERENCES rooms(id) ON DELETE SET NULL,
  weekday TEXT NOT NULL CHECK(weekday IN ('1', '2', '3', '4', '5', '6', '7')),
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  is_recurring BOOLEAN NOT NULL DEFAULT 1,
  lesson_type TEXT NOT NULL DEFAULT 'group',
  lesson_link TEXT,
  created_at TEXT NOT NULL,
  valid_from TEXT,
  valid_until TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
  updated_at TEXT,
  series_id TEXT,
  supersedes_schedule_id INTEGER REFERENCES schedules(id) ON DELETE RESTRICT,
  version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1),
  change_reason TEXT,
  created_by TEXT,
  updated_by TEXT
);

CREATE TABLE IF NOT EXISTS group_teacher_assignments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  teacher_id TEXT NOT NULL REFERENCES teachers(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'ended')),
  valid_from TEXT NOT NULL,
  valid_until TEXT,
  created_by TEXT,
  ended_by TEXT,
  created_at TEXT NOT NULL,
  ended_at TEXT
);

CREATE TABLE IF NOT EXISTS lessons (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id TEXT,
  group_id TEXT NOT NULL REFERENCES groups(id),
  teacher_id TEXT REFERENCES teachers(id) ON DELETE SET NULL,
  schedule_id INTEGER REFERENCES schedules(id) ON DELETE SET NULL,
  date TEXT NOT NULL,
  time TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('waiting', 'planned', 'completed', 'cancelled')),
  lesson_type TEXT NOT NULL DEFAULT 'group',
  is_trial INTEGER NOT NULL DEFAULT 0,
  cancelled_reason TEXT,
  attendance_data TEXT,
  room_id TEXT REFERENCES rooms(id) ON DELETE SET NULL,
  room_name TEXT,
  start_time TEXT,
  end_time TEXT,
  occurrence_date TEXT,
  topic TEXT,
  homework TEXT,
  note TEXT,
  created_by TEXT,
  created_at TEXT,
  updated_by TEXT,
  updated_at TEXT,
  completed_by TEXT,
  completed_at TEXT,
  cancelled_by TEXT,
  cancelled_at TEXT,
  cancelled_from_status TEXT,
  reschedule_reason TEXT,
  attendance_version INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  financial_status TEXT NOT NULL DEFAULT 'unposted',
  financial_version INTEGER NOT NULL DEFAULT 0 CHECK(financial_version >= 0),
  financial_posted_at TEXT,
  financial_posted_by TEXT,
  financial_reversed_at TEXT,
  financial_reversed_by TEXT,
  financial_reversal_reason TEXT,
  schedule_series_id TEXT,
  occurrence_key TEXT,
  override_mask INTEGER NOT NULL DEFAULT 0 CHECK(override_mask >= 0),
  base_schedule_id INTEGER REFERENCES schedules(id) ON DELETE RESTRICT,
  base_schedule_version INTEGER CHECK(base_schedule_version IS NULL OR base_schedule_version >= 1)
);

CREATE TABLE IF NOT EXISTS attendance_reasons (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  attendance_status TEXT NOT NULL CHECK(attendance_status IN ('present', 'absent', 'late', 'excused')),
  charge_percent REAL NOT NULL CHECK(charge_percent >= 0 AND charge_percent <= 100),
  consume_percent REAL NOT NULL CHECK(consume_percent >= 0 AND consume_percent <= 100),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
  is_system INTEGER NOT NULL DEFAULT 0 CHECK(is_system IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(tenant_id, code)
);

CREATE TABLE IF NOT EXISTS attendance (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK(status IN ('present', 'absent', 'late', 'excused')),
  note TEXT,
  reason_id TEXT REFERENCES attendance_reasons(id) ON DELETE RESTRICT,
  reason_code TEXT,
  reason_name TEXT,
  charge_percent REAL CHECK(charge_percent IS NULL OR (charge_percent >= 0 AND charge_percent <= 100)),
  consume_percent REAL CHECK(consume_percent IS NULL OR (consume_percent >= 0 AND consume_percent <= 100)),
  created_at TEXT NOT NULL,
  UNIQUE(tenant_id, lesson_id, student_id)
);

CREATE TABLE IF NOT EXISTS lesson_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  actor_user_id TEXT,
  actor_role TEXT,
  action TEXT NOT NULL,
  reason TEXT,
  before_json TEXT,
  after_json TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS lesson_attendance_revisions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  revision_no INTEGER NOT NULL,
  actor_user_id TEXT,
  actor_role TEXT,
  reason TEXT,
  snapshot_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(tenant_id, lesson_id, revision_no)
);

CREATE TABLE IF NOT EXISTS schedule_change_runs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  series_id TEXT NOT NULL,
  schedule_id INTEGER REFERENCES schedules(id) ON DELETE RESTRICT,
  operation TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_fingerprint TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'succeeded', 'failed')),
  result_json TEXT NOT NULL DEFAULT '{}',
  error_json TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  UNIQUE(tenant_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS schedule_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  series_id TEXT NOT NULL,
  schedule_id INTEGER REFERENCES schedules(id) ON DELETE RESTRICT,
  lesson_id TEXT REFERENCES lessons(id) ON DELETE RESTRICT,
  occurrence_key TEXT,
  run_id TEXT REFERENCES schedule_change_runs(id) ON DELETE RESTRICT,
  actor_user_id TEXT,
  actor_role TEXT,
  action TEXT NOT NULL,
  reason TEXT,
  before_json TEXT,
  after_json TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id TEXT,
  student_id TEXT NOT NULL REFERENCES students(id),
  student_name TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK(amount > 0),
  type TEXT NOT NULL CHECK(type IN ('cash', 'card', 'transfer')),
  created_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  voided_at TEXT,
  voided_by TEXT,
  void_reason TEXT,
  idempotency_key TEXT,
  account_id TEXT,
  category_id TEXT
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  student_id TEXT REFERENCES students(id) ON DELETE SET NULL,
  recipient TEXT NOT NULL,
  channel TEXT NOT NULL,
  text TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('queued', 'processing', 'sent', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  sent_at TEXT,
  processing_started_at TEXT,
  next_attempt_at TEXT,
  last_error_code TEXT,
  last_error_message TEXT,
  telegram_message_id TEXT,
  dedupe_key TEXT
);

CREATE TABLE IF NOT EXISTS telegram_link_tokens (
  token TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  telegram_chat_id TEXT
);

CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  source TEXT,
  status TEXT NOT NULL CHECK(status IN ('new', 'contacted', 'converted')),
  stage TEXT NOT NULL DEFAULT 'new',
  responsible_admin TEXT,
  next_action TEXT,
  note TEXT,
  lost_reason TEXT,
  converted_student_id TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pipeline_stages (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  is_system BOOLEAN DEFAULT 0
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS branches (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
  is_main INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

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

CREATE TABLE IF NOT EXISTS finance_periods (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id TEXT REFERENCES branches(id) ON DELETE RESTRICT,
  label TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'closed')),
  closed_at TEXT,
  closed_by TEXT,
  close_reason TEXT,
  reopened_at TEXT,
  reopened_by TEXT,
  reopened_reason TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1),
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_by TEXT,
  updated_at TEXT NOT NULL,
  CHECK(end_date >= start_date)
);

CREATE TABLE IF NOT EXISTS lesson_billing_policies (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id TEXT REFERENCES branches(id) ON DELETE RESTRICT,
  group_id TEXT REFERENCES groups(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  billing_mode TEXT NOT NULL DEFAULT 'per_lesson',
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'archived')),
  base_amount INTEGER NOT NULL CHECK(base_amount >= 0),
  currency TEXT NOT NULL DEFAULT 'UZS',
  valid_from TEXT NOT NULL,
  valid_until TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1),
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_by TEXT,
  updated_at TEXT NOT NULL,
  archived_by TEXT,
  archived_at TEXT,
  CHECK(valid_until IS NULL OR valid_until >= valid_from)
);

CREATE TABLE IF NOT EXISTS teacher_rate_rules (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  teacher_id TEXT NOT NULL REFERENCES teachers(id) ON DELETE RESTRICT,
  branch_id TEXT REFERENCES branches(id) ON DELETE RESTRICT,
  group_id TEXT REFERENCES groups(id) ON DELETE RESTRICT,
  lesson_type TEXT,
  rate_type TEXT NOT NULL CHECK(rate_type IN ('flat', 'per_student', 'hourly')),
  rate_amount REAL NOT NULL CHECK(rate_amount >= 0),
  currency TEXT NOT NULL DEFAULT 'UZS',
  effective_from TEXT NOT NULL,
  effective_until TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'archived')),
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_by TEXT,
  updated_at TEXT NOT NULL,
  archived_at TEXT,
  archived_by TEXT,
  archive_reason TEXT,
  CHECK(effective_until IS NULL OR effective_until >= effective_from)
);

CREATE TABLE IF NOT EXISTS lesson_financial_settlements (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id TEXT REFERENCES branches(id) ON DELETE RESTRICT,
  lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE RESTRICT,
  attendance_revision_no INTEGER NOT NULL CHECK(attendance_revision_no >= 1),
  status TEXT NOT NULL CHECK(status IN ('confirmed', 'reversed')),
  service_date TEXT NOT NULL,
  posting_date TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'UZS',
  billing_policy_id TEXT NOT NULL REFERENCES lesson_billing_policies(id) ON DELETE RESTRICT,
  billing_policy_version INTEGER NOT NULL CHECK(billing_policy_version >= 1),
  teacher_rate_rule_id TEXT REFERENCES teacher_rate_rules(id) ON DELETE RESTRICT,
  teacher_rate_rule_version INTEGER,
  confirmed_by TEXT NOT NULL,
  confirmed_at TEXT NOT NULL,
  reversed_by TEXT,
  reversed_at TEXT,
  reversal_reason TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1),
  idempotency_key TEXT NOT NULL,
  request_fingerprint TEXT NOT NULL,
  CHECK(
    (teacher_rate_rule_id IS NULL AND teacher_rate_rule_version IS NULL)
    OR (teacher_rate_rule_id IS NOT NULL AND teacher_rate_rule_version >= 1)
  ),
  FOREIGN KEY (tenant_id, lesson_id, attendance_revision_no)
    REFERENCES lesson_attendance_revisions(tenant_id, lesson_id, revision_no)
    ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS lesson_financial_runs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE RESTRICT,
  idempotency_key TEXT NOT NULL,
  request_fingerprint TEXT NOT NULL,
  financial_version INTEGER NOT NULL CHECK(financial_version >= 0),
  operation TEXT NOT NULL CHECK(operation IN ('preview', 'confirm', 'reverse')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'succeeded', 'failed')),
  result_json TEXT NOT NULL DEFAULT '{}',
  error_json TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS lesson_student_postings (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  settlement_id TEXT NOT NULL REFERENCES lesson_financial_settlements(id) ON DELETE RESTRICT,
  lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE RESTRICT,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  financial_run_id TEXT REFERENCES lesson_financial_runs(id) ON DELETE RESTRICT,
  revision INTEGER NOT NULL CHECK(revision >= 1),
  attendance_status TEXT NOT NULL CHECK(attendance_status IN ('present', 'absent', 'late', 'excused')),
  reason_id TEXT REFERENCES attendance_reasons(id) ON DELETE RESTRICT,
  reason_code TEXT,
  reason_name TEXT,
  charge_percent REAL NOT NULL CHECK(charge_percent >= 0 AND charge_percent <= 100),
  consume_percent REAL NOT NULL CHECK(consume_percent >= 0 AND consume_percent <= 100),
  billing_policy_id TEXT NOT NULL REFERENCES lesson_billing_policies(id) ON DELETE RESTRICT,
  billing_policy_version INTEGER NOT NULL CHECK(billing_policy_version >= 1),
  base_amount_snapshot INTEGER NOT NULL CHECK(base_amount_snapshot >= 0),
  policy_snapshot_json TEXT NOT NULL DEFAULT '{}',
  subscription_id TEXT REFERENCES subscriptions(id) ON DELETE RESTRICT,
  consume_units REAL NOT NULL CHECK(consume_units >= 0),
  unit_price REAL NOT NULL CHECK(unit_price >= 0),
  charge_amount REAL NOT NULL CHECK(charge_amount >= 0),
  currency TEXT NOT NULL DEFAULT 'UZS',
  ledger_transaction_id INTEGER REFERENCES invoices_transactions(id) ON DELETE RESTRICT,
  reversal_transaction_id INTEGER REFERENCES invoices_transactions(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'reversed')),
  idempotency_key TEXT NOT NULL,
  reversal_of_posting_id TEXT REFERENCES lesson_student_postings(id) ON DELETE RESTRICT,
  reversal_settlement_id TEXT REFERENCES lesson_financial_settlements(id) ON DELETE RESTRICT,
  reversed_at TEXT,
  reversed_by TEXT,
  reversal_reason TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  CHECK(reversal_of_posting_id IS NULL OR reversal_of_posting_id != id),
  CHECK(ledger_transaction_id IS NULL OR ledger_transaction_id != reversal_transaction_id)
);

CREATE TABLE IF NOT EXISTS teacher_accruals (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  settlement_id TEXT NOT NULL REFERENCES lesson_financial_settlements(id) ON DELETE RESTRICT,
  lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE RESTRICT,
  teacher_id TEXT NOT NULL REFERENCES teachers(id) ON DELETE RESTRICT,
  financial_run_id TEXT REFERENCES lesson_financial_runs(id) ON DELETE RESTRICT,
  rate_rule_id TEXT REFERENCES teacher_rate_rules(id) ON DELETE RESTRICT,
  revision INTEGER NOT NULL CHECK(revision >= 1),
  entry_type TEXT NOT NULL CHECK(entry_type IN ('accrual', 'reversal')),
  original_entry_id TEXT REFERENCES teacher_accruals(id) ON DELETE RESTRICT,
  rate_type_snapshot TEXT NOT NULL CHECK(rate_type_snapshot IN ('flat', 'per_student', 'hourly')),
  rate_amount_snapshot REAL NOT NULL CHECK(rate_amount_snapshot >= 0),
  duration_minutes_snapshot INTEGER NOT NULL CHECK(duration_minutes_snapshot >= 0),
  basis_quantity_snapshot REAL NOT NULL CHECK(basis_quantity_snapshot >= 0),
  basis_snapshot_json TEXT NOT NULL DEFAULT '{}',
  accrual_amount REAL NOT NULL CHECK(accrual_amount >= 0),
  currency TEXT NOT NULL DEFAULT 'UZS',
  idempotency_key TEXT NOT NULL,
  reversal_reason TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  CHECK(
    (entry_type = 'accrual' AND original_entry_id IS NULL)
    OR (entry_type = 'reversal' AND original_entry_id IS NOT NULL)
  ),
  CHECK(original_entry_id IS NULL OR original_entry_id != id)
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

CREATE INDEX IF NOT EXISTS idx_students_tenant ON students(tenant_id);
CREATE INDEX IF NOT EXISTS idx_groups_tenant ON groups(tenant_id);
CREATE INDEX IF NOT EXISTS idx_lessons_tenant_date ON lessons(tenant_id, date);
CREATE INDEX IF NOT EXISTS idx_group_teacher_assignments_group_history ON group_teacher_assignments(tenant_id, group_id, valid_from, valid_until);
CREATE INDEX IF NOT EXISTS idx_group_teacher_assignments_teacher_history ON group_teacher_assignments(tenant_id, teacher_id, status, valid_from, valid_until);
CREATE UNIQUE INDEX IF NOT EXISTS idx_group_teacher_assignments_one_active ON group_teacher_assignments(tenant_id, group_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_payments_tenant_created ON payments(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_tenant_status ON messages(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_audit_tenant_created ON audit_logs(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_branches_one_main ON branches(tenant_id) WHERE is_main = 1;
CREATE INDEX IF NOT EXISTS idx_branches_tenant_status ON branches(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_platform_audit_created ON platform_audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_platform_audit_tenant ON platform_audit_logs(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant_student ON subscriptions(tenant_id, student_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_tenant_status_due ON tasks(tenant_id, status, due_at);
CREATE INDEX IF NOT EXISTS idx_attendance_reasons_lookup ON attendance_reasons(tenant_id, is_active, attendance_status, code);
CREATE INDEX IF NOT EXISTS idx_finance_periods_lookup ON finance_periods(tenant_id, status, branch_id, start_date, end_date);
CREATE UNIQUE INDEX IF NOT EXISTS idx_finance_periods_scope_range ON finance_periods(tenant_id, COALESCE(branch_id, ''), start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_lesson_billing_policies_lookup ON lesson_billing_policies(tenant_id, status, group_id, branch_id, valid_from, valid_until, version);
CREATE INDEX IF NOT EXISTS idx_teacher_rate_rules_lookup ON teacher_rate_rules(tenant_id, teacher_id, status, branch_id, group_id, lesson_type, effective_from, effective_until, version);
CREATE UNIQUE INDEX IF NOT EXISTS idx_lesson_financial_settlements_idempotency ON lesson_financial_settlements(tenant_id, idempotency_key);
CREATE UNIQUE INDEX IF NOT EXISTS idx_lesson_financial_settlements_one_confirmed ON lesson_financial_settlements(tenant_id, lesson_id) WHERE status = 'confirmed';
CREATE INDEX IF NOT EXISTS idx_lesson_financial_settlements_lesson ON lesson_financial_settlements(tenant_id, lesson_id, version, status, confirmed_at);
CREATE INDEX IF NOT EXISTS idx_lesson_financial_settlements_period ON lesson_financial_settlements(tenant_id, posting_date, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_lesson_financial_runs_idempotency ON lesson_financial_runs(tenant_id, idempotency_key);
CREATE INDEX IF NOT EXISTS idx_lesson_financial_runs_lesson ON lesson_financial_runs(tenant_id, lesson_id, financial_version, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_lesson_student_postings_idempotency ON lesson_student_postings(tenant_id, idempotency_key);
CREATE UNIQUE INDEX IF NOT EXISTS idx_lesson_student_postings_one_active ON lesson_student_postings(tenant_id, lesson_id, student_id) WHERE status = 'active';
CREATE UNIQUE INDEX IF NOT EXISTS idx_lesson_student_postings_one_reversal ON lesson_student_postings(tenant_id, reversal_of_posting_id) WHERE reversal_of_posting_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lesson_student_postings_settlement ON lesson_student_postings(tenant_id, settlement_id, revision, status);
CREATE INDEX IF NOT EXISTS idx_lesson_student_postings_student ON lesson_student_postings(tenant_id, student_id, created_at);
CREATE INDEX IF NOT EXISTS idx_lesson_student_postings_subscription ON lesson_student_postings(tenant_id, subscription_id, status);
CREATE INDEX IF NOT EXISTS idx_lesson_student_postings_ledger ON lesson_student_postings(ledger_transaction_id, reversal_transaction_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_teacher_accruals_idempotency ON teacher_accruals(tenant_id, idempotency_key);
CREATE UNIQUE INDEX IF NOT EXISTS idx_teacher_accruals_one_original ON teacher_accruals(tenant_id, settlement_id, teacher_id) WHERE entry_type = 'accrual';
CREATE UNIQUE INDEX IF NOT EXISTS idx_teacher_accruals_one_reversal ON teacher_accruals(tenant_id, original_entry_id) WHERE entry_type = 'reversal';
CREATE INDEX IF NOT EXISTS idx_teacher_accruals_lesson ON teacher_accruals(tenant_id, lesson_id, revision, entry_type);
CREATE INDEX IF NOT EXISTS idx_teacher_accruals_teacher ON teacher_accruals(tenant_id, teacher_id, created_at);
CREATE INDEX IF NOT EXISTS idx_schedule_change_runs_series ON schedule_change_runs(tenant_id, series_id, created_at);
CREATE INDEX IF NOT EXISTS idx_schedule_events_history ON schedule_events(tenant_id, series_id, created_at, id);
CREATE INDEX IF NOT EXISTS idx_schedule_events_lesson ON schedule_events(tenant_id, lesson_id, created_at) WHERE lesson_id IS NOT NULL;

CREATE TRIGGER IF NOT EXISTS trg_tenants_seed_attendance_reasons
AFTER INSERT ON tenants
BEGIN
  INSERT OR IGNORE INTO attendance_reasons
    (id, tenant_id, code, name, attendance_status, charge_percent, consume_percent,
     is_active, is_system, created_at, updated_at)
  VALUES
    ('attendance-reason:' || NEW.id || ':present', NEW.id, 'present', 'Present',
     'present', 100, 100, 1, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    ('attendance-reason:' || NEW.id || ':late', NEW.id, 'late', 'Late',
     'late', 100, 100, 1, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    ('attendance-reason:' || NEW.id || ':absent_unexcused', NEW.id, 'absent_unexcused', 'Absent (unexcused)',
     'absent', 100, 100, 1, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    ('attendance-reason:' || NEW.id || ':excused', NEW.id, 'excused', 'Excused absence',
     'excused', 0, 0, 1, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
END;

CREATE TRIGGER IF NOT EXISTS trg_lesson_student_postings_immutable_core
BEFORE UPDATE ON lesson_student_postings
WHEN NEW.id IS NOT OLD.id
  OR NEW.tenant_id IS NOT OLD.tenant_id
  OR NEW.settlement_id IS NOT OLD.settlement_id
  OR NEW.lesson_id IS NOT OLD.lesson_id
  OR NEW.student_id IS NOT OLD.student_id
  OR NEW.financial_run_id IS NOT OLD.financial_run_id
  OR NEW.revision IS NOT OLD.revision
  OR NEW.attendance_status IS NOT OLD.attendance_status
  OR NEW.reason_id IS NOT OLD.reason_id
  OR NEW.reason_code IS NOT OLD.reason_code
  OR NEW.reason_name IS NOT OLD.reason_name
  OR NEW.charge_percent IS NOT OLD.charge_percent
  OR NEW.consume_percent IS NOT OLD.consume_percent
  OR NEW.billing_policy_id IS NOT OLD.billing_policy_id
  OR NEW.billing_policy_version IS NOT OLD.billing_policy_version
  OR NEW.base_amount_snapshot IS NOT OLD.base_amount_snapshot
  OR NEW.policy_snapshot_json IS NOT OLD.policy_snapshot_json
  OR NEW.subscription_id IS NOT OLD.subscription_id
  OR NEW.consume_units IS NOT OLD.consume_units
  OR NEW.unit_price IS NOT OLD.unit_price
  OR NEW.charge_amount IS NOT OLD.charge_amount
  OR NEW.currency IS NOT OLD.currency
  OR NEW.ledger_transaction_id IS NOT OLD.ledger_transaction_id
  OR NEW.idempotency_key IS NOT OLD.idempotency_key
  OR NEW.reversal_of_posting_id IS NOT OLD.reversal_of_posting_id
  OR NEW.created_by IS NOT OLD.created_by
  OR NEW.created_at IS NOT OLD.created_at
BEGIN
  SELECT RAISE(ABORT, 'lesson student posting core fields are immutable');
END;

CREATE TRIGGER IF NOT EXISTS trg_lesson_student_postings_no_reactivate
BEFORE UPDATE OF status ON lesson_student_postings
WHEN OLD.status = 'reversed' AND NEW.status != 'reversed'
BEGIN
  SELECT RAISE(ABORT, 'reversed lesson student posting cannot be reactivated');
END;

CREATE TRIGGER IF NOT EXISTS trg_teacher_accruals_append_only
BEFORE UPDATE ON teacher_accruals
BEGIN
  SELECT RAISE(ABORT, 'teacher accruals are append-only; add a reversal entry');
END;

CREATE TRIGGER IF NOT EXISTS trg_schedule_events_append_only_update
BEFORE UPDATE ON schedule_events
BEGIN
  SELECT RAISE(ABORT, 'schedule events are append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_schedule_events_append_only_delete
BEFORE DELETE ON schedule_events
BEGIN
  SELECT RAISE(ABORT, 'schedule events are append-only');
END;
`;

module.exports = { schema };
