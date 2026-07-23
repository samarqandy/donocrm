# DONOCRM Legacy Freeze Report

Status: Phase 1B classification baseline approved; blocking no-growth enforcement active
Assessment date: 2026-07-22
Policy: [legacy-policy.md](legacy-policy.md)

## Classification Decision

The repository enters Legacy Freeze on 2026-07-22. Current runtime behavior remains supported, but non-conforming components cannot gain new business responsibilities.

No current business module is classified MODERN. Attendance and Students are MIGRATING because they have explicit partial module seams but retain documented dependency, table-ownership, Shared Kernel, and compatibility violations. Architecture documentation is MODERN governance material; it is not runtime code.

## Component Register

| Major component | Classification | Repository evidence | Decision and permitted change |
|---|---|---|---|
| Root entrypoint `server.js` | LEGACY | Imports HTTP server and database directly at `server.js:1-8`; starts embedded worker at `:15-20` | Stable runtime entrypoint; bug/security/compatibility only |
| HTTP server | LEGACY | `src/http/server.js:2-9` imports database, worker, bootstrap, and PostgreSQL pool | Presentation/composition mixture; no new business routing or SQL |
| Legacy API | LEGACY | `src/http/api.js` has 98 route equality/match conditions, direct SQL at `:50-73`, and legacy container/bootstrap imports at `:1-7` | Preserve API; only compatibility/security/bug fixes and approved dispatch adapters |
| Global request context | LEGACY | `src/services/context.js:1-2` imports HTTP cookies and legacy container | Authentication compatibility only; modules must not add new dependency on it |
| Legacy service container | LEGACY | `src/services/container.js:1-24` constructs shared repository and Attendance query infrastructure | Frozen second composition root; no new adapters or modules |
| `AppService` | LEGACY | 2,457 lines and 115 class-style methods; direct Telegram import at `src/services/appService.js:14` | No new business method, invariant, provider, or context responsibility |
| `AuthService` | LEGACY | Constructed with `AppRepository` by `src/services/container.js:23-24`; current session behavior is SQLite-backed | Identity migration candidate later; security/compatibility fixes only |
| `AppRepository` | LEGACY | 5,411 lines, 163 class-style methods, over 40 business tables; constructs Attendance adapter at `:6`, `:790` | No new method, SQL, table, join, or cross-context workflow |
| Telegram queue repository | LEGACY | `src/repositories/domains/telegramQueueRepository.js` combines tables and provider client imports | Communications migration candidate; delivery/security fixes only |
| SQLite client/schema/seed/migration runner | LEGACY | `src/db/client.js:10-48` combines connection, schema, migrations, seeding; `src/db/schema.js` is 888 lines across contexts | Current authority/compatibility; no new business ownership outside module process |
| Historical SQLite migrations | LEGACY | `src/db/migrations/**` encode existing schema evolution | Immutable history except verified migration defect repair; no Phase 1B schema change |
| Attendance module | MIGRATING | Explicit Domain/Application/HTTP/Infrastructure; cross-context repositories and Shared Kernel violations documented in Phase 1A | Migration/parity/rollback/bug fixes only until its gate closes |
| Students module | MIGRATING | `ListStudents` slice exists; runtime Attendance repository injection and cross-context SQL remain | Existing strangler slice only; no new Student use case without module gate |
| Strangler bootstrap | MIGRATING | `src/bootstrap/stranglerContainer.js:31-97` composes store routing and partial modules | Approved routing/parity/rollback preparation only; no business policy |
| Migration infrastructure | MIGRATING | `src/infrastructure/migration/**` implements store router, backfill, relay, and parity | Attendance migration support only; every addition needs owner/removal condition |
| PostgreSQL infrastructure | MIGRATING | pool and three Attendance migration SQL files under `src/infrastructure/database/postgres/` | Target-store preparation for approved slices only; not general module ownership |
| Strangler HTTP router | MIGRATING | `src/infrastructure/http/StranglerRouter.js` dispatches registered module routes | Compatibility routing only; no business decisions |
| Telegram worker | LEGACY | direct DB/AppRepository at `src/workers/telegramQueueWorker.js:2-3`, `:12-40` | Current operations only; no new job/business workflow |
| Telegram provider client | LEGACY | `src/integrations/telegramClient.js`; imported directly by legacy service/repository | Existing provider behavior only until Communications port exists |
| Configuration | LEGACY | `src/config/app.js` is used directly across legacy database, HTTP, repositories, and integrations | Stable platform configuration; no business rules or alternate Shared Kernel role |
| Shared utilities | LEGACY | `src/utils/**` has high fan-in and is used by services, repositories, migrations, database | Frozen utility surface for modules' inner layers; fixes only unless platform ownership approved |
| Shared Kernel candidate | LEGACY | only `src/core/errors/DomainError.js`; HTTP status at `:2-6`; 11 consumers; not ADR-approved | No new members or consumers |
| Security rate limiter | LEGACY | process-local singleton at `src/security/loginRateLimiter.js:10`, `:66` | Existing login protection; security fixes only pending platform ownership/scaling decision |
| Root legacy frontend | LEGACY | root `app.js` is 6,852 lines with global state at `:1376`, `:1468-1470`; served by `src/http/static.js:17` | No new feature/workflow/global state; compatibility/bug/security fixes only |
| Parallel frontend `public/**` | MIGRATING | 117 lines; `public/app.js:7-8` declares parallel strangler; Attendance page uses current APIs | Page parity/compatibility work only under an approved module migration |
| Operational migration scripts | MIGRATING | `scripts/attendance-*`, PostgreSQL schema and canary scripts target Attendance migration | Approved migration evidence/rollback only; not a home for business rules |
| Legacy administrative/seed scripts | LEGACY | `scripts/create-admin.js` imports AppRepository; `scripts/seed-demo-data.js` accesses SQLite directly | Operations/fixtures only; no new business workflow |
| Existing behavior test suites | LEGACY | `test:backend`, smoke, hardening, and Excel suites exercise legacy runtime | Preserve as regression evidence; additions must characterize existing behavior only |
| Attendance/Students characterization tests | MIGRATING | `npm run test:architecture` runs `test-clean-attendance` and `test-student-strangler` | Module migration evidence, not structural enforcement |
| Architecture documentation | MODERN | `docs/architecture/**` implements accepted vision, contexts, ADRs, governance, tests, and freeze policy | Maintained as source of truth under governance |
| OpenAPI document | LEGACY | `docs/openapi.yaml` describes existing unversioned `/api`; ADR-008 remains Proposed | Compatibility baseline; additive/corrective documentation only until versioning decision |

## Boundary Decisions

### AppService and AppRepository

Both are LEGACY, not MIGRATING as whole files. Individual capabilities may move through an approved module migration, but the god objects remain compatibility facades until all consumers are removed. New methods would expand the legacy boundary and are prohibited.

### Attendance and Students

Both are MIGRATING, not MODERN. Directory layering alone is insufficient. Phase 1A proved cross-context table access, the unapproved Shared Kernel error, and Students' runtime dependency on an Attendance query repository.

### Infrastructure

Infrastructure is classified by component rather than given one blanket status:

- central SQLite/database and direct-provider infrastructure is LEGACY;
- Attendance store-routing, relay, parity, and PostgreSQL slices are MIGRATING;
- no runtime Infrastructure component currently has enough approved ownership and conformance evidence to be classified MODERN.

### Workers

The Telegram worker is LEGACY because it constructs `AppRepository` and issues tenant SQL directly. Migration/relay scripts are MIGRATING only for their approved temporary purpose.

### Frontend

The root frontend is LEGACY. The `public/**` parallel frontend is MIGRATING because its own source comment identifies a strangler path and parity gate. Neither is MODERN at repository scale.

## Freeze Measurements

The initial evidence inventory is:

- `AppService`: 2,457 lines and 115 class-style methods.
- `AppRepository`: 5,411 lines and 163 class-style methods.
- Legacy API: 723 lines and 98 route equality/match conditions.
- Root legacy frontend: 6,852 lines and approximately 330 top-level function declarations.
- Shared Kernel: one unapproved file and 11 direct consumers.
- Static source graph: 75 JavaScript files and 145 internal CommonJS edges under `src/`.

These measurements are review evidence, not an approved fingerprint baseline. The baseline commit and accountable approvers remain open.

## Freeze Compliance Decision

The policy is defined, but automated enforcement is not active. Until the CI plan reaches at least warning/reporting stage, every PR touching a classified component requires manual legacy-touch review.

The freeze does not authorize runtime edits in Phase 1B. This report changes classification documentation only.
