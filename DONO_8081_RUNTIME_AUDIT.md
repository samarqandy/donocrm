# Dono 8081 Runtime Audit

Date: 2026-07-06
Target URL: `http://192.168.1.249:8081/`
Project: `/var/www/dono`

## Executive Summary

`http://192.168.1.249:8081/` ishlamayotganining eng ehtimoliy sababi Dono ilovasi real VM systemd runtime'ida ishga tushmagan yoki `0.0.0.0:8081` socket ochilmagan.

Repository ichidagi Dono kodi smoke-testdan otdi va `server.js` portni togri ochishga tayyor:

```js
createServer().listen(port, "0.0.0.0", () => {
  console.log(`Dono running at http://0.0.0.0:${port}`);
});
```

Lekin audit paytida host systemd joyida `/etc/systemd/system/dono.service` topilmadi. Repository ichida `deploy/dono.service` va installer bor, lekin ular real VM systemd'iga install qilinganini tasdiqlovchi dalil yoq.

## Confirmed Facts

### 1. POS port 80 orqali nginx bilan ishlayapti

Enabled nginx site:

```text
/etc/nginx/sites-enabled/pos -> /etc/nginx/sites-available/pos
```

POS nginx config:

```nginx
server {
    listen 80 default_server;
    server_name _;

    root /var/www/pos/frontend/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://unix:/run/pos/pos.sock;
    }
}
```

Conclusion: `192.168.1.249:80` POS uchun band. Dono `8081` portda alohida Node process sifatida ishlashi kerak. POS bilan port konflikti yoq.

### 2. Dono server kodi `0.0.0.0:8081` uchun tayyor

Files:

- `server.js`
- `src/config/app.js`

Current behavior:

- Default port: `8081`
- Listen address: `0.0.0.0`
- SQLite file: `/var/www/dono/data/dono.sqlite`
- HTTP LAN deploy uchun `COOKIE_SECURE=false` service templatega qo'yilgan.

### 3. Dono app regression testlari otmoqda

Command:

```bash
node scripts/qa-smoke.js
```

Result: all checks passed, including:

- health endpoint
- readiness endpoint
- index served
- admin login
- teacher login
- bootstrap auth
- payment workflow
- attendance workflow
- session logout
- password hashing

Conclusion: application code itself is not the current blocker.

### 4. Real systemd service installed ekanligi tasdiqlanmadi

Audit command result:

```text
host dono service file:

known service files:
/etc/systemd/system/pos-backup.service
/etc/systemd/system/pos-backup.timer
/etc/systemd/system/pos-bot-admin.service
/etc/systemd/system/pos-bot-client.service
/etc/systemd/system/pos-bot-master.service
/etc/systemd/system/pos-scheduler.service
/etc/systemd/system/pos.service
```

`/etc/systemd/system/dono.service` topilmadi.

Conclusion: browser `192.168.1.249:8081` ga kira olmayotganining birinchi root cause'i Dono service real hostda install/start qilinmagan bo'lishi mumkin.

### 5. Codex sandbox real LAN serverni ishga tushira olmaydi

Codex environment network namespace bilan ajratilgan. Local bind test:

```json
{"ok":false,"code":"EPERM","syscall":"listen","address":"0.0.0.0","port":null}
```

Conclusion: Codex ichida `node server.js` qilish real VirtualBox VM IP orqali browserga korinmaydi. Server aynan VM terminalida yoki real systemd orqali ishga tushishi shart.

## Root Cause Ranking

### P0 - Dono service real VM systemd'ida install/start qilinmagan

Evidence:

- `/etc/systemd/system/dono.service` topilmadi.
- POS service'lar bor, Dono service yoq.
- Dono repo ichida faqat deployment template bor.

Fix:

```bash
sudo /var/www/dono/deploy/install-dono-service.sh
```

Then verify:

```bash
sudo systemctl status dono --no-pager
sudo ss -ltnp | grep ':8081'
curl http://127.0.0.1:8081/healthz
curl http://192.168.1.249:8081/healthz
```

Expected socket:

```text
LISTEN ... 0.0.0.0:8081 ... node
```

Expected health:

```json
{"ok":true}
```

### P1 - Firewall blocks 8081

If local works but LAN IP fails:

```bash
curl http://127.0.0.1:8081/healthz
curl http://192.168.1.249:8081/healthz
```

If `127.0.0.1` works and `192.168.1.249` fails:

```bash
sudo ufw allow 8081/tcp
sudo ufw reload
sudo ufw status verbose
```

### P2 - VM does not actually own `192.168.1.249`

Check:

```bash
ip -br addr
ip addr | grep 192.168.1.249
```

If this IP is missing, browser is using wrong address or VirtualBox adapter changed.

### P3 - VirtualBox adapter is NAT instead of bridged

If the VM does not have a LAN IP directly reachable from the host/network, use:

- VirtualBox Adapter: `Bridged Adapter`, or
- NAT port forwarding:
  - Host Port: `8081`
  - Guest Port: `8081`
  - Protocol: TCP

### P4 - Service crashes immediately

Check:

```bash
sudo journalctl -u dono -n 100 --no-pager
```

Most likely crash cases:

- `/usr/bin/node` missing
- `/var/www/dono/server.js` missing
- SQLite file permission issue
- port `8081` already used by another process

## Required Fix Procedure

Run this inside the VirtualBox VM, not inside Codex:

```bash
cd /var/www/dono
sudo /var/www/dono/deploy/install-dono-service.sh
sudo /var/www/dono/deploy/diagnose-dono-network.sh 192.168.1.249 8081
```

If `dono.service` is active and health works:

```bash
curl http://192.168.1.249:8081/healthz
```

Open:

```text
http://192.168.1.249:8081/
```

## Decision Tree

1. `systemctl is-active dono` is not `active`
   - Root cause: service not running or crashed.
   - Fix: check `journalctl -u dono -n 100 --no-pager`.

2. `systemctl active`, but no `0.0.0.0:8081` in `ss`
   - Root cause: service did not bind.
   - Fix: journal logs, port conflict, Node path.

3. `127.0.0.1:8081/healthz` works, `192.168.1.249:8081/healthz` fails
   - Root cause: firewall/IP/VirtualBox networking.
   - Fix: `ufw allow 8081/tcp`, verify VM IP, bridged adapter.

4. Both health URLs work, browser page does not
   - Root cause: browser cache/proxy or URL typo.
   - Fix: open incognito, clear cache, test `/healthz`.

## Production Recommendation

Short term:

- Keep POS on `:80`.
- Run Dono on `:8081` via `dono.service`.
- Open firewall for `8081/tcp`.

Medium term:

- Add nginx reverse proxy for Dono, for example:
  - `http://192.168.1.249:8081` direct Node, or
  - `http://192.168.1.249/dono/` via nginx path routing after app supports base path, or
  - separate hostname if local DNS exists.

Production hardening:

- Run service as dedicated `dono` user, not `root`.
- Add log rotation or journald retention policy.
- Add health monitoring.
- Add deployment command to README.
- Add systemd unit verification to release checklist.

## Final Assessment

Dono source code is not the blocker. The blocker is runtime deployment: `dono.service` is not confirmed installed/running on the real VM, or `8081` is blocked/not bound. The next required evidence is the output of:

```bash
sudo /var/www/dono/deploy/diagnose-dono-network.sh 192.168.1.249 8081
```
