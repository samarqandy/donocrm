BEGIN;

ALTER TABLE attendance_reasons
  ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_attendance_reasons_version'
      AND conrelid = 'attendance_reasons'::regclass
  ) THEN
    ALTER TABLE attendance_reasons
      ADD CONSTRAINT ck_attendance_reasons_version CHECK (version > 0);
  END IF;
END;
$$;

COMMIT;
