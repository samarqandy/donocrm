BEGIN;

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

CREATE INDEX IF NOT EXISTS idx_attendance_reference_versions_sequence
  ON attendance_reference_mirror_versions(tenant_id, last_sequence DESC);

DROP TRIGGER IF EXISTS trg_attendance_reference_mirror_versions_updated_at
  ON attendance_reference_mirror_versions;
CREATE TRIGGER trg_attendance_reference_mirror_versions_updated_at
BEFORE UPDATE ON attendance_reference_mirror_versions
FOR EACH ROW EXECUTE FUNCTION dono_touch_updated_at();

COMMIT;
