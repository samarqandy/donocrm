#!/usr/bin/env bash
set -euo pipefail

SERVICE_NAME="dono.service"
PROJECT_DIR="/var/www/dono"
SERVICE_SOURCE="$PROJECT_DIR/deploy/$SERVICE_NAME"
SERVICE_TARGET="/etc/systemd/system/$SERVICE_NAME"
WORKER_NAME="dono-telegram-worker.service"
WORKER_SOURCE="$PROJECT_DIR/deploy/$WORKER_NAME"
WORKER_TARGET="/etc/systemd/system/$WORKER_NAME"
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
chmod 0600 "$ENV_FILE"

install -m 0644 "$SERVICE_SOURCE" "$SERVICE_TARGET"
install -m 0644 "$WORKER_SOURCE" "$WORKER_TARGET"
systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
systemctl enable "$WORKER_NAME"
systemctl restart "$SERVICE_NAME"
systemctl restart "$WORKER_NAME"

if command -v ufw >/dev/null 2>&1; then
  ufw allow 8081/tcp
fi

systemctl --no-pager --full status "$SERVICE_NAME"

echo
echo "Listening sockets on 8081:"
if command -v ss >/dev/null 2>&1; then
  ss -ltnp | grep ':8081' || true
else
  netstat -ltnp 2>/dev/null | grep ':8081' || true
fi

echo
echo "Local health check:"
if command -v curl >/dev/null 2>&1; then
  curl --fail --show-error --max-time 5 http://127.0.0.1:8081/healthz
  echo
else
  echo "curl is not installed; open http://127.0.0.1:8081/healthz manually"
fi
