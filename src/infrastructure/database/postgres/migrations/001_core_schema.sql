BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION dono_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.updated_at IS NOT DISTINCT FROM OLD.updated_at THEN
    NEW.updated_at = NOW();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'center',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'archived')),
  plan TEXT NOT NULL DEFAULT 'pilot',
  language TEXT NOT NULL DEFAULT 'uz' CHECK (language IN ('uz', 'ru')),
  domain TEXT,
  telegram_bot TEXT,
  telegram_bot_token_encrypted TEXT,
  telegram_update_offset BIGINT NOT NULL DEFAULT 0 CHECK (telegram_update_offset >= 0),
  suspended_at TIMESTAMPTZ,
  suspended_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS teachers (
  tenant_id TEXT NOT NULL,
  id TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  specialization TEXT,
  branch_id TEXT,
  employment_type TEXT NOT NULL DEFAULT 'full_time'
    CHECK (employment_type IN ('full_time', 'part_time', 'contract', 'hourly')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  hired_at DATE,
  max_weekly_minutes INTEGER NOT NULL DEFAULT 2400 CHECK (max_weekly_minutes BETWEEN 0 AND 10080),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT fk_teachers_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS groups (
  tenant_id TEXT NOT NULL,
  id TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  teacher_id TEXT NOT NULL,
  branch_id TEXT,
  room TEXT,
  monthly_fee NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (monthly_fee >= 0),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  description TEXT,
  level TEXT,
  capacity INTEGER NOT NULL DEFAULT 0 CHECK (capacity BETWEEN 0 AND 10000),
  start_date DATE,
  end_date DATE,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('draft', 'active', 'completed', 'cancelled', 'archived')),
  color TEXT CHECK (color IS NULL OR color ~ '^#[0-9A-Fa-f]{6}$'),
  note TEXT,
  archived_at TIMESTAMPTZ,
  archive_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT ck_groups_dates CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date),
  CONSTRAINT fk_groups_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_groups_teacher FOREIGN KEY (tenant_id, teacher_id)
    REFERENCES teachers(tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS students (
  tenant_id TEXT NOT NULL,
  id TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL,
  group_id TEXT NOT NULL,
  branch_id TEXT,
  parent_name TEXT NOT NULL DEFAULT '',
  phone TEXT,
  phone_normalized TEXT,
  student_phone TEXT,
  email TEXT,
  birth_date DATE,
  gender TEXT CHECK (gender IS NULL OR gender IN ('male', 'female', 'other')),
  address TEXT,
  source TEXT,
  enrollment_date DATE,
  telegram_chat_id TEXT,
  debt NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (debt >= 0),
  balance NUMERIC(18,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'frozen', 'left')),
  note TEXT,
  archived_at TIMESTAMPTZ,
  archive_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT fk_students_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_students_group FOREIGN KEY (tenant_id, group_id)
    REFERENCES groups(tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS student_group_enrollments (
  tenant_id TEXT NOT NULL,
  id TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  student_id TEXT NOT NULL,
  group_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'transferred', 'completed', 'left', 'withdrawn')),
  start_date DATE NOT NULL,
  end_date DATE,
  reason TEXT,
  created_by TEXT,
  ended_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT ck_enrollments_dates CHECK (end_date IS NULL OR end_date >= start_date),
  CONSTRAINT fk_enrollments_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_enrollments_student FOREIGN KEY (tenant_id, student_id)
    REFERENCES students(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_enrollments_group FOREIGN KEY (tenant_id, group_id)
    REFERENCES groups(tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS lessons (
  tenant_id TEXT NOT NULL,
  id TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  group_id TEXT NOT NULL,
  teacher_id TEXT,
  branch_id TEXT,
  date DATE NOT NULL,
  time TEXT NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  status TEXT NOT NULL DEFAULT 'planned'
    CHECK (status IN ('waiting', 'planned', 'completed', 'cancelled')),
  schedule_id BIGINT,
  attendance_data JSONB,
  lesson_type TEXT NOT NULL DEFAULT 'group'
    CHECK (lesson_type IN ('group', 'individual', 'trial', 'makeup')),
  is_trial BOOLEAN NOT NULL DEFAULT FALSE,
  room_id TEXT,
  room_name TEXT,
  occurrence_date DATE,
  topic TEXT,
  homework TEXT,
  note TEXT,
  cancelled_reason TEXT,
  reschedule_reason TEXT,
  created_by TEXT,
  updated_by TEXT,
  completed_by TEXT,
  cancelled_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancelled_from_status TEXT,
  attendance_version BIGINT NOT NULL DEFAULT 0 CHECK (attendance_version >= 0),
  version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
  financial_status TEXT NOT NULL DEFAULT 'unposted'
    CHECK (financial_status IN ('unposted', 'legacy', 'pending', 'posted', 'reversed')),
  financial_version BIGINT NOT NULL DEFAULT 0 CHECK (financial_version >= 0),
  financial_posted_at TIMESTAMPTZ,
  financial_posted_by TEXT,
  financial_reversed_at TIMESTAMPTZ,
  financial_reversed_by TEXT,
  financial_reversal_reason TEXT,
  schedule_series_id TEXT,
  occurrence_key TEXT,
  override_mask INTEGER NOT NULL DEFAULT 0 CHECK (override_mask >= 0),
  base_schedule_id BIGINT,
  base_schedule_version BIGINT,
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT ck_lessons_time CHECK (end_time > start_time),
  CONSTRAINT fk_lessons_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_lessons_group FOREIGN KEY (tenant_id, group_id)
    REFERENCES groups(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_lessons_teacher FOREIGN KEY (tenant_id, teacher_id)
    REFERENCES teachers(tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS attendance_reasons (
  tenant_id TEXT NOT NULL,
  id TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  attendance_status TEXT NOT NULL CHECK (attendance_status IN ('present', 'absent', 'late', 'excused')),
  charge_percent NUMERIC(5,2) NOT NULL DEFAULT 100 CHECK (charge_percent BETWEEN 0 AND 100),
  consume_percent NUMERIC(5,2) NOT NULL DEFAULT 100 CHECK (consume_percent BETWEEN 0 AND 100),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT uq_attendance_reasons_code UNIQUE (tenant_id, code),
  CONSTRAINT fk_attendance_reasons_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS attendance (
  tenant_id TEXT NOT NULL,
  id TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  lesson_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('present', 'absent', 'late', 'excused')),
  reason_id TEXT,
  reason_code TEXT NOT NULL DEFAULT '',
  reason_name TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  charge_percent NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (charge_percent BETWEEN 0 AND 100),
  consume_percent NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (consume_percent BETWEEN 0 AND 100),
  source_version BIGINT NOT NULL DEFAULT 0 CHECK (source_version >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT uq_attendance_lesson_student UNIQUE (tenant_id, lesson_id, student_id),
  CONSTRAINT fk_attendance_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_attendance_lesson FOREIGN KEY (tenant_id, lesson_id)
    REFERENCES lessons(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_attendance_student FOREIGN KEY (tenant_id, student_id)
    REFERENCES students(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_attendance_reason FOREIGN KEY (tenant_id, reason_id)
    REFERENCES attendance_reasons(tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS payments (
  tenant_id TEXT NOT NULL,
  id TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  student_id TEXT NOT NULL,
  student_name TEXT NOT NULL,
  amount NUMERIC(18,2) NOT NULL CHECK (amount > 0),
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  type TEXT NOT NULL DEFAULT 'cash' CHECK (type IN ('cash', 'card', 'transfer')),
  source TEXT NOT NULL DEFAULT 'manual',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'voided')),
  branch_id TEXT,
  account_id TEXT,
  category_id TEXT,
  idempotency_key TEXT,
  voided_at TIMESTAMPTZ,
  voided_by TEXT,
  void_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT fk_payments_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_payments_student FOREIGN KEY (tenant_id, student_id)
    REFERENCES students(tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS finance_periods (
  tenant_id TEXT NOT NULL,
  id TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  branch_id TEXT,
  label TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  closed_by TEXT,
  closed_at TIMESTAMPTZ,
  reopened_by TEXT,
  reopened_at TIMESTAMPTZ,
  reopen_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT ck_finance_periods_dates CHECK (end_date >= start_date),
  CONSTRAINT fk_finance_periods_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS lesson_attendance_revisions (
  tenant_id TEXT NOT NULL,
  id TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  lesson_id TEXT NOT NULL,
  revision_no BIGINT NOT NULL CHECK (revision_no > 0),
  actor_user_id TEXT,
  actor_role TEXT,
  reason TEXT,
  snapshot_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT uq_lesson_attendance_revision UNIQUE (tenant_id, lesson_id, revision_no),
  CONSTRAINT fk_lesson_attendance_revision_lesson FOREIGN KEY (tenant_id, lesson_id)
    REFERENCES lessons(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS lesson_events (
  tenant_id TEXT NOT NULL,
  id TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  lesson_id TEXT NOT NULL,
  actor_user_id TEXT,
  actor_role TEXT,
  action TEXT NOT NULL,
  reason TEXT,
  before_json JSONB,
  after_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT fk_lesson_events_lesson FOREIGN KEY (tenant_id, lesson_id)
    REFERENCES lessons(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS audit_logs (
  tenant_id TEXT NOT NULL,
  id TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT fk_audit_logs_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS migration_outbox (
  sequence BIGINT GENERATED ALWAYS AS IDENTITY,
  tenant_id TEXT NOT NULL,
  id TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  source_store TEXT NOT NULL CHECK (source_store IN ('sqlite', 'postgres')),
  target_store TEXT NOT NULL CHECK (target_store IN ('sqlite', 'postgres')),
  source_version BIGINT NOT NULL CHECK (source_version > 0),
  payload_json JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'done', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT uq_migration_outbox_sequence UNIQUE (sequence),
  CONSTRAINT uq_migration_outbox_id UNIQUE (id),
  CONSTRAINT fk_migration_outbox_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS migration_inbox (
  tenant_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  source_store TEXT NOT NULL CHECK (source_store IN ('sqlite', 'postgres')),
  event_type TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, event_id),
  CONSTRAINT fk_migration_inbox_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS attendance_reference_mirror_versions (
  tenant_id TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  last_sequence BIGINT NOT NULL CHECK (last_sequence > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, aggregate_type, aggregate_id),
  CONSTRAINT fk_attendance_reference_versions_tenant
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status);

CREATE INDEX IF NOT EXISTS idx_teachers_tenant_status ON teachers(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_teachers_tenant_phone ON teachers(tenant_id, phone);

CREATE INDEX IF NOT EXISTS idx_groups_tenant_status ON groups(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_groups_tenant_teacher_status ON groups(tenant_id, teacher_id, status);
CREATE INDEX IF NOT EXISTS idx_groups_tenant_start_date ON groups(tenant_id, start_date);

CREATE INDEX IF NOT EXISTS idx_students_tenant_status ON students(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_students_tenant_group_status ON students(tenant_id, group_id, status);
CREATE INDEX IF NOT EXISTS idx_students_tenant_phone_normalized ON students(tenant_id, phone_normalized);
CREATE INDEX IF NOT EXISTS idx_students_tenant_created_at ON students(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_enrollments_tenant_student_dates
  ON student_group_enrollments(tenant_id, student_id, start_date DESC, end_date);
CREATE INDEX IF NOT EXISTS idx_enrollments_tenant_group_dates
  ON student_group_enrollments(tenant_id, group_id, start_date DESC, end_date);
CREATE UNIQUE INDEX IF NOT EXISTS uq_enrollments_active_student
  ON student_group_enrollments(tenant_id, student_id)
  WHERE status = 'active' AND end_date IS NULL;

CREATE INDEX IF NOT EXISTS idx_lessons_tenant_date ON lessons(tenant_id, date, start_time);
CREATE INDEX IF NOT EXISTS idx_lessons_tenant_status_date ON lessons(tenant_id, status, date);
CREATE INDEX IF NOT EXISTS idx_lessons_tenant_group_date ON lessons(tenant_id, group_id, date);
CREATE INDEX IF NOT EXISTS idx_lessons_tenant_teacher_date ON lessons(tenant_id, teacher_id, date);
CREATE INDEX IF NOT EXISTS idx_lessons_tenant_series_occurrence
  ON lessons(tenant_id, schedule_series_id, occurrence_date);

CREATE INDEX IF NOT EXISTS idx_attendance_reasons_tenant_active
  ON attendance_reasons(tenant_id, attendance_status, is_active);

CREATE INDEX IF NOT EXISTS idx_attendance_tenant_lesson ON attendance(tenant_id, lesson_id);
CREATE INDEX IF NOT EXISTS idx_attendance_tenant_student_created
  ON attendance(tenant_id, student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_tenant_status_created
  ON attendance(tenant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payments_tenant_date ON payments(tenant_id, payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_payments_tenant_status_date ON payments(tenant_id, status, payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_payments_tenant_student_date
  ON payments(tenant_id, student_id, payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_payments_tenant_source_date ON payments(tenant_id, source, payment_date DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_tenant_idempotency
  ON payments(tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL AND idempotency_key <> '';

CREATE INDEX IF NOT EXISTS idx_finance_periods_tenant_status_dates
  ON finance_periods(tenant_id, status, start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_lesson_revisions_tenant_lesson
  ON lesson_attendance_revisions(tenant_id, lesson_id, revision_no DESC);
CREATE INDEX IF NOT EXISTS idx_lesson_events_tenant_lesson_created
  ON lesson_events(tenant_id, lesson_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_created ON audit_logs(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_entity
  ON audit_logs(tenant_id, entity, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_user
  ON audit_logs(tenant_id, user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_migration_outbox_delivery
  ON migration_outbox(source_store, target_store, status, available_at, sequence);
CREATE INDEX IF NOT EXISTS idx_migration_outbox_aggregate
  ON migration_outbox(tenant_id, aggregate_type, aggregate_id, source_version DESC);
CREATE INDEX IF NOT EXISTS idx_migration_inbox_received
  ON migration_inbox(tenant_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_reference_versions_sequence
  ON attendance_reference_mirror_versions(tenant_id, last_sequence DESC);

DO $$
DECLARE
  table_name TEXT;
  trigger_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'tenants', 'teachers', 'groups', 'students', 'student_group_enrollments',
    'lessons', 'attendance_reasons', 'attendance', 'payments', 'finance_periods',
    'lesson_attendance_revisions', 'lesson_events', 'audit_logs',
    'migration_outbox', 'migration_inbox', 'attendance_reference_mirror_versions'
  ] LOOP
    trigger_name := 'trg_' || table_name || '_updated_at';
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgname = trigger_name AND tgrelid = to_regclass(table_name)
    ) THEN
      EXECUTE format(
        'CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION dono_touch_updated_at()',
        trigger_name,
        table_name
      );
    END IF;
  END LOOP;
END;
$$;

COMMIT;
