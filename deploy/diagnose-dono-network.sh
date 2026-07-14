#!/usr/bin/env bash
set -u

TARGET_IP="${1:-192.168.1.249}"
TARGET_PORT="${2:-8081}"
SERVICE_NAME="dono.service"

section() {
  printf '\n== %s ==\n' "$1"
}

run() {
  printf '$ %s\n' "$*"
  "$@" 2>&1 || true
}

section "Host"
run hostname
run date

section "IP addresses"
if command -v ip >/dev/null 2>&1; then
  run ip -br addr
else
  run hostname -I
fi

section "Dono service"
if command -v systemctl >/dev/null 2>&1; then
  run systemctl is-enabled "$SERVICE_NAME"
  run systemctl is-active "$SERVICE_NAME"
  run systemctl --no-pager --full status "$SERVICE_NAME"
else
  echo "systemctl not found"
fi

section "Recent Dono logs"
if command -v journalctl >/dev/null 2>&1; then
  run journalctl -u "$SERVICE_NAME" -n 80 --no-pager
else
  echo "journalctl not found"
fi

section "Listening sockets"
if command -v ss >/dev/null 2>&1; then
  run ss -ltnp
  run ss -ltnp "sport = :$TARGET_PORT"
elif command -v netstat >/dev/null 2>&1; then
  run netstat -ltnp
else
  echo "ss/netstat not found"
fi

section "Local health"
if command -v curl >/dev/null 2>&1; then
  run curl -i --max-time 5 "http://127.0.0.1:$TARGET_PORT/healthz"
  run curl -i --max-time 5 "http://$TARGET_IP:$TARGET_PORT/healthz"
  run curl -i --max-time 5 "http://$TARGET_IP:$TARGET_PORT/"
else
  echo "curl not found"
fi

section "Firewall"
if command -v ufw >/dev/null 2>&1; then
  run ufw status verbose
else
  echo "ufw not found"
fi

section "Nginx"
if command -v nginx >/dev/null 2>&1; then
  run nginx -t
  run systemctl is-active nginx
else
  echo "nginx not found"
fi

section "Node"
run command -v node
run node -v

section "Project files"
run ls -la /var/www/dono/server.js /var/www/dono/data/dono.sqlite /var/www/dono/deploy/dono.service
