# DonoCRM SQLite backup and restore

The `dono-backup.timer` unit runs `scripts/backup.sh` every six hours. The script uses SQLite's online `.backup` API, verifies the new database with `PRAGMA integrity_check`, compresses it, writes a SHA-256 checksum, and removes backups older than 30 days.

## Manual backup

```bash
sudo -u dono DB_PATH=/var/www/dono/data/dono.sqlite \
  BACKUP_DIR=/var/backups/dono \
  /var/www/dono/scripts/backup.sh
```

## Restore

1. Stop both writers.

```bash
sudo systemctl stop dono.service dono-telegram-worker.service
```

2. Verify and decompress the selected backup into a temporary file.

```bash
cd /var/backups/dono
sha256sum -c dono-YYYYMMDDTHHMMSSZ.sqlite.gz.sha256
gzip -cd dono-YYYYMMDDTHHMMSSZ.sqlite.gz > /tmp/dono-restore.sqlite
sqlite3 /tmp/dono-restore.sqlite 'PRAGMA integrity_check; PRAGMA foreign_key_check;'
```

If age encryption is enabled, decrypt before decompressing:

```bash
age -d -i /path/to/private-key.txt dono-YYYYMMDDTHHMMSSZ.sqlite.gz.age | gzip -d > /tmp/dono-restore.sqlite
```

3. Preserve the failed database and install the verified restore. Do not reuse stale WAL/SHM files.

```bash
sudo mv /var/www/dono/data/dono.sqlite /var/www/dono/data/dono.sqlite.failed-$(date -u +%Y%m%dT%H%M%SZ)
sudo rm -f /var/www/dono/data/dono.sqlite-wal /var/www/dono/data/dono.sqlite-shm
sudo install -o dono -g dono -m 0640 /tmp/dono-restore.sqlite /var/www/dono/data/dono.sqlite
```

4. Start and verify.

```bash
sudo systemctl start dono.service dono-telegram-worker.service
curl --fail http://127.0.0.1:8081/readyz
sudo journalctl -u dono.service -n 100 --no-pager
```
