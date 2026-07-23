# DonoCRM Clean Architecture migration

## Target layout

```text
src/
  bootstrap/                 dependency composition
  core/                      dependency-free errors and ports
  infrastructure/
    database/postgres/       PostgreSQL pool and SQL migrations
    http/                    Strangler router
    migration/               store routing, relay, parity tools
  modules/
    attendance/
      domain/                entity and repository port
      application/           use-cases
      infrastructure/        SQLite/PostgreSQL adapters
      http/                  controller and routes
    students/ groups/ teachers/ payments/ telegram/
  legacy/                    temporary anti-corruption boundary
public/
  core/ components/ pages/
```

## Seven phases

1. **Prepare** — run `npm run postgres:schema`; leave SQLite primary.
2. **Backfill** — run `npm run attendance:backfill -- --tenant <tenant_id>` in FK order.
3. **Verify** — run `npm run attendance:verify -- --tenant <tenant_id>` and require `ok=true`.
4. **Mirror** — set `DONO_ATTENDANCE_MIRROR_ENABLED=true`; run `npm run attendance:relay`; keep every tenant on the SQLite store until parity passes.
5. **Rollback drill** — enable the reverse relay, perform one PostgreSQL canary write, then run `npm run attendance:rollback-drill -- --tenant <tenant_id>` and require `safeToEnableCanary=true`.
6. **Canary** — add one test tenant to `DONO_ATTENDANCE_POSTGRES_TENANTS` only after relay lag is zero and browser parity passes. The clean attendance HTTP module is canonical; the store router keeps SQLite as the default and selects PostgreSQL only for listed tenants.
7. **Finish** — move tenants one by one, stop reverse relay after the window, keep SQLite read-only, then remove the legacy attendance branch.

## Local test-data runbook

```bash
docker compose -f deploy/docker-compose.local-postgres.yml up -d
export DATABASE_URL='postgresql://...'
npm run postgres:schema
npm run attendance:backfill -- --tenant tenant_main
npm run attendance:verify -- --tenant tenant_main
```

Then start shadow delivery:

```bash
export DONO_ATTENDANCE_MIRROR_ENABLED=true
export DONO_ATTENDANCE_REVERSE_RELAY_ENABLED=true
npm run attendance:relay
```

For a persistent local worker, install and start `deploy/dono-attendance-relay.service`. Keep the PostgreSQL port bound to `127.0.0.1`; the password in the local compose file is disposable and must never be reused on VPS.

Only after a successful reverse event and rollback drill:

```bash
export DONO_ATTENDANCE_REVERSE_RELAY_READY=true
export DONO_ATTENDANCE_POSTGRES_TENANTS=tenant_main
```

Current SQLite rows are disposable test data. VPS deployment starts with a clean PostgreSQL database, so the backfill tool intentionally covers the attendance canary dependencies rather than a permanent historical-data migration platform.

## Required gates

- Do not set PostgreSQL tenants before reference-table backfill and FK validation.
- Do not run request-path synchronous dual writes.
- Do not remove SQLite until restore and rollback drills pass.
- Do not switch the legacy frontend to `/next/app.js` until page-level browser tests pass.

## Attendance strangler coverage

The canonical attendance HTTP module now owns:

- lesson attendance profile reads (`GET /api/lessons/:id/students`) with read-your-write routing;
- mark/correct attendance;
- controlled lesson reopen;
- attendance alert candidate selection and Telegram queueing;
- attendance-reason list/create/update (deactivation is the safe delete) with optimistic versions;
- PostgreSQL-to-SQLite and SQLite-to-PostgreSQL state, revision and event history relay.

Attendance-reason events use aggregate type `attendance_reason` and versions from the reason row, so delayed events cannot overwrite newer configuration. Both relay directions accept these events idempotently through `migration_inbox`.

Attendance reference writes are mirrored atomically by gated SQLite triggers for `teachers`, `groups`, `students`, `student_group_enrollments`, `lessons` and legacy `lesson_events`. Their aggregate type is `attendance_reference`. The relay re-reads the current SQLite row, applies it in FK order-compatible transactions and records the SQLite outbox sequence in `attendance_reference_mirror_versions`; an older retry therefore cannot overwrite a newer PostgreSQL snapshot. Startup migrations temporarily disable the trigger gate, then restore its persisted value unless `DONO_ATTENDANCE_MIRROR_ENABLED` is explicitly configured.

Run the real HTTP reference canary after backfill and before accepting an attendance tenant:

```bash
npm run attendance:reference-canary
npm run attendance:verify -- --tenant <tenant_id>
```

The reference canary creates and updates a teacher, group, student, enrollment and lesson through the existing API, checks the PostgreSQL roster, then verifies archive/restore enrollment behavior. It requires zero pending/failed forward relay rows before the tenant remains in canary.

SQLite-backed dashboard/list projections are isolated in `SQLiteAttendanceQueryRepository`. Student profile attendance history/summary and group profile history/summary/member rates also live there; `AppRepository` only composes their DTOs with the other profile sections. PostgreSQL canary commands and attendance profile reads use `StoreRouter`; non-canary tenants remain on SQLite.

Dashboard counts, student-list attendance totals/rates, group-list attendance rates, attendance record lists and student/group profile projections share the same query port. `PostgresAttendanceQueryRepository` implements that complete port. The service layer overlays the selected store's attendance projection onto legacy finance/guardian DTOs, allowing a PostgreSQL attendance canary without moving unrelated profile data prematurely.

`AppRepository` no longer owns or calls an attendance query adapter. Dashboard, student/group lists and student/group profiles receive attendance projections only through the injected query `StoreRouter`. This prevents a PostgreSQL canary read from being silently overwritten by a second legacy SQLite projection.

The first students Strangler slice owns `GET /api/students`: `ListStudents` applies tenant/teacher scope, delegates base reads to `SQLiteStudentRepository`, and composes attendance statistics through the same canary-aware query router. Student create/update/archive/profile routes intentionally remain on the legacy fallback until the write-side student outbox and guardian/enrollment transaction boundary are extracted.

Run projection parity before adding a tenant to the PostgreSQL query canary:

```bash
npm run attendance:query-parity -- --tenant <tenant_id>
```

Relay stale-state handling must still materialize immutable revisions/events. A higher state version is not permission to discard an older history event.

The local SQLite schema stores reopened lessons as `waiting` for compatibility; repository DTOs expose the domain status as `planned`. PostgreSQL and SQLite physical values therefore remain checksum-compatible.

## Dependency hardening

`exceljs@4.4.0` requires `uuid@^8.3.0`, whose affected versions trigger the current audit advisory. `package.json` overrides only ExcelJS's transitive UUID dependency to patched CommonJS-compatible `uuid@11.1.1`. `npm run test:excel` verifies UUID v4 resolution and XLSX write/read behavior. Do not replace this with `npm audit fix --force`, which proposes a breaking ExcelJS downgrade.

## Domain order

1. Attendance — bounded, heavily tested, lower financial risk.
2. Teachers — parent reference for groups and lessons.
3. Groups/schedules — parent reference for students and attendance rosters.
4. Students/guardians/enrollments — shared master data.
5. Telegram — asynchronous and naturally outbox-driven.
6. Payments — last because ledger, idempotency, voiding and audit require the proven migration path.
