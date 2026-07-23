#!/usr/bin/env bash
set -Eeuo pipefail

DB_PATH="${DB_PATH:-/var/www/dono/data/dono.sqlite}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/dono}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
SQLITE_BIN="${SQLITE_BIN:-sqlite3}"

if ! command -v "$SQLITE_BIN" >/dev/null 2>&1; then
  echo "sqlite3 is required (set SQLITE_BIN if it is installed elsewhere)" >&2
  exit 1
fi
if ! command -v gzip >/dev/null 2>&1; then
  echo "gzip is required" >&2
  exit 1
fi
if [ ! -r "$DB_PATH" ]; then
  echo "Database is not readable: $DB_PATH" >&2
  exit 1
fi
if [[ "$DB_PATH" == *"'"* || "$BACKUP_DIR" == *"'"* ]]; then
  echo "Single quotes are not supported in backup paths" >&2
  exit 1
fi
if ! [[ "$RETENTION_DAYS" =~ ^[0-9]+$ ]]; then
  echo "RETENTION_DAYS must be a non-negative integer" >&2
  exit 1
fi

install -d -m 0750 "$BACKUP_DIR"
umask 0077
exec 9>"$BACKUP_DIR/.backup.lock"
if ! flock -n 9; then
  echo "Another DonoCRM backup is already running" >&2
  exit 0
fi

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
base="$BACKUP_DIR/dono-$timestamp.sqlite"
temporary="$base.tmp"
archive="$base.gz"

cleanup() {
  rm -f "$temporary"
}
trap cleanup EXIT

"$SQLITE_BIN" -readonly "$DB_PATH" ".timeout 10000" ".backup '$temporary'"
integrity="$($SQLITE_BIN "$temporary" "PRAGMA integrity_check;")"
if [ "$integrity" != "ok" ]; then
  echo "Backup integrity check failed: $integrity" >&2
  exit 1
fi

gzip -9 -c "$temporary" > "$archive"
final_file="$archive"

# Optional encryption: set BACKUP_AGE_RECIPIENT and install age.
if [ -n "${BACKUP_AGE_RECIPIENT:-}" ]; then
  if ! command -v age >/dev/null 2>&1; then
    echo "BACKUP_AGE_RECIPIENT is set but age is not installed" >&2
    exit 1
  fi
  age -r "$BACKUP_AGE_RECIPIENT" -o "$archive.age" "$archive"
  rm -f "$archive"
  final_file="$archive.age"
fi

sha256sum "$final_file" > "$final_file.sha256"
find "$BACKUP_DIR" -maxdepth 1 -type f \
  \( -name 'dono-*.sqlite.gz' -o -name 'dono-*.sqlite.gz.age' -o -name 'dono-*.sha256' \) \
  -mtime "+$RETENTION_DAYS" -delete

echo "Backup completed: $final_file"
