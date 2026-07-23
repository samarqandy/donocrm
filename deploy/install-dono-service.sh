#!/usr/bin/env bash
set -euo pipefail

SERVICE_NAME="dono.service"
PROJECT_DIR="/var/www/dono"
SERVICE_SOURCE="$PROJECT_DIR/deploy/$SERVICE_NAME"
SERVICE_TARGET="/etc/systemd/system/$SERVICE_NAME"
WORKER_NAME="dono-telegram-worker.service"
WORKER_SOURCE="$PROJECT_DIR/deploy/$WORKER_NAME"
WORKER_TARGET="/etc/systemd/system/$WORKER_NAME"
BACKUP_SERVICE_NAME="dono-backup.service"
BACKUP_SERVICE_SOURCE="$PROJECT_DIR/deploy/$BACKUP_SERVICE_NAME"
BACKUP_SERVICE_TARGET="/etc/systemd/system/$BACKUP_SERVICE_NAME"
BACKUP_TIMER_NAME="dono-backup.timer"
BACKUP_TIMER_SOURCE="$PROJECT_DIR/deploy/$BACKUP_TIMER_NAME"
BACKUP_TIMER_TARGET="/etc/systemd/system/$BACKUP_TIMER_NAME"
ATTENDANCE_WORKER_NAME="dono-attendance-relay.service"
ATTENDANCE_WORKER_SOURCE="$PROJECT_DIR/deploy/$ATTENDANCE_WORKER_NAME"
ATTENDANCE_WORKER_TARGET="/etc/systemd/system/$ATTENDANCE_WORKER_NAME"
ENV_DIR="/etc/dono"
ENV_FILE="$ENV_DIR/dono.env"
NODE_BIN="/usr/bin/node"

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root: sudo $0" >&2
  exit 1
fi

if [ ! -x "$NODE_BIN" ]; then
  echo "Node binary not found at $NODE_BIN" >&2
  exit 1
fi

if ! "$NODE_BIN" -e "process.exit(typeof require('node:sqlite').backup === 'function' ? 0 : 1)"; then
  echo "Node.js with node:sqlite backup support is required for consistent automated backups" >&2
  exit 1
fi

if [ ! -f "$PROJECT_DIR/server.js" ]; then
  echo "Dono server.js not found in $PROJECT_DIR" >&2
  exit 1
fi

if [ ! -f "$SERVICE_SOURCE" ]; then
  echo "Service template not found: $SERVICE_SOURCE" >&2
  exit 1
fi

if [ ! -f "$WORKER_SOURCE" ]; then
  echo "Worker service template not found: $WORKER_SOURCE" >&2
  exit 1
fi

if [ ! -f "$BACKUP_SERVICE_SOURCE" ] || [ ! -f "$BACKUP_TIMER_SOURCE" ]; then
  echo "Backup service templates are missing" >&2
  exit 1
fi

if [ ! -f "$ATTENDANCE_WORKER_SOURCE" ]; then
  echo "Attendance relay service template is missing" >&2
  exit 1
fi

if ! id dono >/dev/null 2>&1; then
  useradd --system --home-dir /var/lib/dono --create-home --shell /usr/sbin/nologin dono
fi

install -d -o dono -g dono -m 0750 "$PROJECT_DIR/data"
install -d -o dono -g dono -m 0750 /var/backups/dono
chown -R dono:dono "$PROJECT_DIR/data"
chmod 0750 "$PROJECT_DIR/data"

install -d -m 0700 "$ENV_DIR"
if [ ! -f "$ENV_FILE" ]; then
  if ! command -v openssl >/dev/null 2>&1; then
    echo "openssl is required to generate the DonoCRM encryption key" >&2
    exit 1
  fi
  umask 077
  DONO_KEY="$(openssl rand -base64 32)"
  printf 'DONO_SECRET_ENCRYPTION_KEY=%s\nDONO_TELEGRAM_BOT_TOKEN=\n' "$DONO_KEY" > "$ENV_FILE"
fi
chown root:dono "$ENV_FILE"
chmod 0640 "$ENV_FILE"
if [ -f "$ENV_DIR/attendance.env" ]; then
  chown root:dono "$ENV_DIR/attendance.env"
  chmod 0640 "$ENV_DIR/attendance.env"
fi

install -m 0644 "$SERVICE_SOURCE" "$SERVICE_TARGET"
install -m 0644 "$WORKER_SOURCE" "$WORKER_TARGET"
install -m 0644 "$BACKUP_SERVICE_SOURCE" "$BACKUP_SERVICE_TARGET"
install -m 0644 "$BACKUP_TIMER_SOURCE" "$BACKUP_TIMER_TARGET"
install -m 0644 "$ATTENDANCE_WORKER_SOURCE" "$ATTENDANCE_WORKER_TARGET"
chmod 0755 "$PROJECT_DIR/scripts/backup.sh" "$PROJECT_DIR/scripts/create-admin.js"
systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
systemctl enable "$WORKER_NAME"
systemctl enable "$ATTENDANCE_WORKER_NAME"
systemctl enable --now "$BACKUP_TIMER_NAME"

if ! runuser -u dono -- env NODE_ENV=production SQLITE_FILE="$PROJECT_DIR/data/dono.sqlite" \
  "$NODE_BIN" -e "const { initializeDB } = require('$PROJECT_DIR/src/db/client'); const db = initializeDB({ allowEmptyProduction: true }); process.exit(Number(db.prepare(\"SELECT COUNT(*) count FROM users WHERE role IN ('admin', 'superadmin')\").get().count) > 0 ? 0 : 2)"; then
  echo "No administrator exists. Starting secure administrator bootstrap..."
  runuser -u dono -- env NODE_ENV=production SQLITE_FILE="$PROJECT_DIR/data/dono.sqlite" \
    "$NODE_BIN" "$PROJECT_DIR/scripts/create-admin.js"
fi

systemctl restart "$SERVICE_NAME"
systemctl restart "$WORKER_NAME"
systemctl restart "$ATTENDANCE_WORKER_NAME"

if command -v curl >/dev/null 2>&1; then
  ready=false
  for _attempt in $(seq 1 30); do
    if curl --fail --silent --max-time 2 http://127.0.0.1:8081/healthz >/dev/null; then
      ready=true
      break
    fi
    sleep 1
  done
  if [ "$ready" != "true" ]; then
    echo "Dono service did not become healthy within 30 seconds" >&2
    journalctl -u "$SERVICE_NAME" -n 80 --no-pager >&2 || true
    exit 1
  fi
fi

systemctl --no-pager --full status "$SERVICE_NAME"

echo
echo "Listening socket on localhost:8081:"
if command -v ss >/dev/null 2>&1; then
  ss -ltnp | grep '127.0.0.1:8081' || true
else
  netstat -ltnp 2>/dev/null | grep '127.0.0.1:8081' || true
fi

echo
echo "Local health check:"
if command -v curl >/dev/null 2>&1; then
  curl --fail --show-error --max-time 5 http://127.0.0.1:8081/healthz
  echo
else
  echo "curl is not installed; open http://127.0.0.1:8081/healthz manually"
fi
