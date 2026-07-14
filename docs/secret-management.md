# DonoCRM Secret Management

## Maqsad

Production muhitida secret qiymatlar kodda, SQLite jadvalida yoki systemd service faylining o'zida saqlanmasligi kerak. DonoCRM endi `process.env` orqali global va tenant-scoped secretlarni o'qiydi.

## Tavsiya etilgan joylashuv

Production serverda secretlar alohida faylda saqlanadi:

```bash
/etc/dono/dono.env
```

Systemd service fayllari shu faylni `EnvironmentFile=-/etc/dono/dono.env` orqali o'qiydi. Fayl yo'q bo'lsa servis baribir start bo'ladi, lekin secret talab qiladigan integratsiyalar ishlamaydi.

Telegram tokenlarini bazada AES-256-GCM bilan shifrlash uchun 32-byte master key majburiy:

```bash
DONO_SECRET_ENCRYPTION_KEY=<openssl rand -base64 32 natijasi>
```

`deploy/install-dono-service.sh` yangi install paytida ushbu kalitni avtomatik yaratadi. Kalit yo'qolsa bazadagi shifrlangan tokenlarni tiklab bo'lmaydi; uni alohida secret backupda saqlang.

## Telegram tokenlar

Global fallback:

```bash
DONO_TELEGRAM_BOT_TOKEN=123456:telegram-token
```

Tenant bo'yicha override:

```bash
DONO_TELEGRAM_BOT_TOKEN_TENANT_MAIN=123456:tenant-main-token
```

Tenant ID normalizatsiya qilinadi: kichik harflar katta harfga o'tadi, harf/raqam bo'lmagan belgilar `_` bo'ladi. Masalan, `tenant-main` va `tenant_main` ikkalasi ham `TENANT_MAIN` ko'rinishiga keladi.

## Operatsion qoida

- `.env`, `.env.production` va real secret fayllarni gitga qo'shmang.
- `/etc/dono/dono.env` fayliga faqat server operatori o'qish huquqi berilsin.
- Telegram token DBda bo'lsa ham, env token ustuvor ishlaydi.
- Token almashtirilgandan keyin `dono.service` va `dono-telegram-worker.service` restart qilinadi.
