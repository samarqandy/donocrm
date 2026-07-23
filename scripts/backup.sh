#!/usr/bin/env bash
set -Eeuo pipefail

DB_PATH="${DB_PATH:-/var/www/dono/data/dono.sqlite}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/dono}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
SQLITE_BIN="${SQLITE_BIN:-sqlite3}"
NODE_BIN="${NODE_BIN:-/usr/bin/node}"

if ! command -v gzip >/dev/null 2>&1; then
  echo "gzip is required" >&2
  exit 1
fi
if command -v "$SQLITE_BIN" >/dev/null 2>&1; then
  backup_engine="sqlite3"
elif [ -x "$NODE_BIN" ] && "$NODE_BIN" -e "process.exit(typeof require('node:sqlite').backup === 'function' ? 0 : 1)"; then
  backup_engine="node"
else
  echo "sqlite3 or a Node.js runtime with node:sqlite backup support is required" >&2
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
  rm -f "$temporary" "$temporary-wal" "$temporary-shm"
}
trap cleanup EXIT

if [ "$backup_engine" = "sqlite3" ]; then
  "$SQLITE_BIN" -readonly "$DB_PATH" ".timeout 10000" ".backup '$temporary'"
  integrity="$("$SQLITE_BIN" "$temporary" "PRAGMA integrity_check;")"
  if [ "$integrity" != "ok" ]; then
    echo "Backup integrity check failed: $integrity" >&2
    exit 1
  fi
else
  "$NODE_BIN" - "$DB_PATH" "$temporary" <<'NODE'
const { DatabaseSync, backup } = require("node:sqlite");

async function run() {
  const source = new DatabaseSync(process.argv[2], { readOnly: true });
  try {
    await backup(source, process.argv[3]);
  } finally {
    source.close();
  }
  const copy = new DatabaseSync(process.argv[3], { readOnly: true });
  try {
    const integrity = copy.prepare("PRAGMA integrity_check").all().map((row) => Object.values(row)[0]);
    const foreignKeys = copy.prepare("PRAGMA foreign_key_check").all();
    if (integrity.length !== 1 || integrity[0] !== "ok" || foreignKeys.length) {
      throw new Error(`Backup validation failed: integrity=${integrity.join(",")} foreignKeys=${foreignKeys.length}`);
    }
  } finally {
    copy.close();
  }
}

run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
NODE
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
