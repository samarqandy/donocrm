# Dono Market Execution

## Ready Version

Dono is ready for a peer-to-peer pilot with small education centers and tutors. The current build supports:

- Admin and teacher login with server-side sessions.
- Tenant-scoped students, groups, lessons, attendance, payments, leads, reports, and audit logs.
- Teacher-only attendance workflow.
- Payment entry with automatic debt reduction.
- Telegram message queue/log simulation and bot token settings.
- Uzbek/Russian UI, desktop/mobile responsive layout.
- SQLite persistence with schema constraints and transactions.
- Password hashing, protected static serving, health/readiness endpoints.

## Demo Credentials

- Admin: `admin` / `admin123`
- Teacher: `teacher` / `teacher123`

Run:

```bash
cd /var/www/dono
node server.js
```

Open:

```text
http://127.0.0.1:8081
```

## Buyer Demo Flow

1. Login as Admin.
2. Show dashboard: students, groups, today's lessons, debtors, Telegram queue.
3. Add one student.
4. Add one payment and show debt reduction plus queued Telegram message.
5. Open a lesson and save attendance.
6. Process Telegram queue and show sent status.
7. Logout and login as Teacher.
8. Show that the teacher only sees assigned lessons and attendance.

Target demo duration: 7-10 minutes.

## Pilot Offer

Recommended first market offer:

- Free 14-day pilot for 3-5 local tutors or small centers.
- Setup done manually by founder/admin.
- Focus metric: first attendance saved in under 3 minutes.
- Secondary metric: payment/debt workflow understood without training.
- Weekly feedback call, not a feature wishlist session.

## Launch Checklist

- Run `node scripts/qa-smoke.js` and confirm all checks pass.
- Set `NODE_ENV=production`.
- Set `COOKIE_SECURE=true` behind HTTPS.
- Keep a daily copy of `data/dono.sqlite`.
- Replace demo passwords before real pilot use.
- Configure Telegram bot username/token in Settings.
- Confirm `/healthz` and `/readyz` return `200`.
- Confirm teacher login cannot create students, payments, messages, or settings changes.
- Confirm static paths such as `/data/dono.sqlite` return `404`.

## Current Boundary

This version is market-demo and pilot usable, not a full AlfaCRM-class production SaaS. Before paid scale, the next technical priorities are real Telegram Bot API delivery, parent chat linking, edit/archive CRUD, automated tests, and PostgreSQL migration.
