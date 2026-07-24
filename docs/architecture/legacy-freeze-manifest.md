# DONOCRM Legacy Freeze Manifest

Status: Approved semantic manifest; blocking no-growth baseline active
Assessment date: 2026-07-22
Policy: [Legacy Freeze Policy](legacy-policy.md)
Approval authority: Sukhrob Khaydarov

## Purpose

This manifest is the human-readable source for the future machine-readable no-growth baseline. It inventories frozen compatibility components and migration-only components without authorizing runtime edits or a new module migration.

## Classification Vocabulary

| Classification | Meaning | Permitted change |
|---|---|---|
| `FROZEN` | Required current behavior in a non-conforming legacy boundary. | Documented Bug, Security, or Compatibility fix; exact approved Migration Adapter only. No new responsibility. |
| `MIGRATING` | Already inside an approved Attendance/Students strangler or migration-support boundary. | Existing approved parity, replay, canary, reconciliation, rollback, and compatibility work only. |
| `REMOVABLE` | Replacement and parity are complete; no supported consumer uses the component; rollback/retention window is closed. | Removal only after Legacy Retirement Gate approval. |
| `RETIRED` | Removed from production and retained only as historical decision/evidence. | No production reintroduction without a new approved decision. |

`REMOVABLE` is not inferred from low usage, duplicate code, or a passing test. `RETIRED` requires repository and release evidence. No current component meets either state.

## Authoritative Component Inventory

| ID | Component/path | Classification | Frozen responsibility | No-growth fingerprint and constraint | Exit condition |
|---|---|---|---|---|---|
| LF-001 | `server.js` | FROZEN | Application startup and compatibility entrypoint | No new business orchestration, database responsibility, worker policy, or provider integration | Approved bootstrap owns startup; compatibility entrypoint has zero production consumers or becomes a policy-free delegate |
| LF-002 | `src/http/server.js` | FROZEN | HTTP lifecycle, health/readiness, legacy/strangler dispatch, static serving | No new business route, SQL, repository construction, or business decision | Target Presentation/bootstrap split has parity and rollback evidence |
| LF-003 | `src/http/api.js` | FROZEN | Existing unversioned HTTP compatibility surface and exports | No new business route branch, SQL statement/table/join, repository access, or contract change; current export SQL remains non-compliant baseline | Every supported route is owned by approved module Presentation; OpenAPI parity and zero-use evidence close legacy router |
| LF-004 | root `app.js` | FROZEN | Existing browser UI and global state/workflows | No new feature, page workflow, cross-context state, API contract, or global mutable state | All supported pages pass browser parity and rollback window closes |
| LF-005 | `src/services/appService.js` (`AppService`) | FROZEN | Existing centralized use cases and compatibility business orchestration | No new business method, invariant, provider dependency, cross-context workflow, or responsibility; exact method inventory must not grow | Every supported method has an approved module replacement, zero-use evidence, and retirement approval |
| LF-006 | `src/repositories/appRepository.js` (`AppRepository`) | FROZEN | Existing centralized persistence facade | No new method, SQL statement, table, join, adapter construction, transaction workflow, or access mode | All consumers use owned module ports/adapters; table and behavior parity plus rollback closure are proven |
| LF-007 | `src/services/authService.js` | FROZEN | Existing login/session/tenant-switch compatibility | Security and compatibility fixes only; no new Identity capability or auth mode | Identity & Access replacement passes contract/security/rollback gates |
| LF-008 | `src/services/container.js` | FROZEN | Legacy object construction | No new module, adapter, repository, provider, or composition responsibility | All supported consumers use approved bootstrap composition |
| LF-009 | `src/services/context.js` | FROZEN | Legacy cookie/session-to-request context | Authentication compatibility only; no new module consumer or global context state | Approved Identity/Presentation context contract replaces all consumers |
| LF-010 | `src/repositories/domains/telegramQueueRepository.js` | FROZEN | Telegram queue persistence, recipient lookup, delivery compatibility | No new provider, table, workflow, message type, or cross-context join | Communications module owns queue/provider contracts with parity and rollback evidence |
| LF-011 | `src/workers/telegramQueueWorker.js` | FROZEN | Existing Telegram polling and queue processing schedules | No new job, SQL, `AppRepository` capability, provider workflow, or business decision | Communications worker adapter replaces it and operations/rollback evidence passes |
| LF-012 | `scripts/telegram-worker.js` | FROZEN | Existing standalone Telegram worker entrypoint | Startup/operations compatibility only; no business behavior | Replacement entrypoint is deployed and old unit has zero-use evidence |
| LF-013 | legacy administrative and seed scripts under `scripts/` | FROZEN | Existing administration, seed, fixture, and compatibility operations | No new business workflow or direct table ownership; security/operations fixes only | Approved module/operations interfaces replace each supported script or it is retired independently |
| LF-014 | `src/integrations/telegramClient.js` | FROZEN | Existing Telegram provider HTTP behavior | No new provider operation or business decision | Communications-owned adapter passes provider contract and rollback gates |
| LF-015 | `src/db/client.js` | FROZEN | SQLite connection, startup compatibility migration/repair/backfill | No new business ownership, cross-context rule, or alternate module API | Connection/bootstrap/migration responsibilities are replaced through separately approved work |
| LF-016 | `src/db/schema.js` | FROZEN | Current shared SQLite schema bootstrap | No new table or business ownership; schema changes require separately authorized migration | PostgreSQL authority and module-owned schema process replace supported use |
| LF-017 | `src/db/seed.js` | FROZEN | Existing demo/compatibility seed behavior | No production business workflow or hidden invariant | Module-owned fixtures/provisioning replace all supported consumers |
| LF-018 | `src/db/migrationRunner.js` | FROZEN | Existing SQLite versioned migration execution | Migration defect/compatibility only; no business policy | Approved deployment migration runner replaces it with replay/rollback evidence |
| LF-019 | historical files under `src/db/migrations/**` | FROZEN | Immutable migration history | No edits except verified defect repair with data/rollback evidence; no reuse as business code | Retained history normally remains frozen even after authority transfer |
| LF-020 | `src/config/app.js` | FROZEN | Existing platform/runtime configuration | No business rule, context ownership, or Shared Kernel role | Approved platform configuration contract replaces consumers |
| LF-021 | `src/utils/**` | FROZEN | Existing shared legacy helpers | No new module inner-layer consumer or business semantic; fixes only unless ownership is approved | Each consumer migrates to owned platform/module capability; unused helpers pass retirement gate |
| LF-022 | `src/core/errors/DomainError.js` | FROZEN | Existing shared error compatibility | No new export, HTTP semantic, field, or consumer; not an approved Shared Kernel member | Domain/Application errors become framework-neutral and all consumers migrate |
| LF-023 | `src/security/loginRateLimiter.js` | FROZEN | Existing process-local login protection | Security fixes only; no general rate-limit platform responsibility | Approved scalable security adapter replaces it with security/operations parity |
| LF-024 | `docs/openapi.yaml` current unversioned contract | FROZEN | Existing supported `/api` compatibility description | Corrective/additive documentation only; no breaking behavior while ADR-008 is Proposed | Accepted version/deprecation decision and consumer migration authorize retirement/version change |
| LF-025 | existing backend, smoke, hardening, and Excel behavior suites | FROZEN | Characterize supported legacy runtime behavior | Tests may be corrected or expanded only to represent existing behavior; no invented product contract | Retained as compatibility evidence until corresponding supported paths retire |
| LF-026 | `src/modules/attendance/**` | MIGRATING | Approved Attendance extraction and SQLite/PostgreSQL adapters | Attendance parity, bug, migration, replay, rollback, and compatibility only; no new business capability | Attendance completion gates pass, legacy dependency/table violations close, and authority is recorded |
| LF-027 | extracted `src/modules/students/**` slice | MIGRATING | Existing `ListStudents` strangler behavior | Existing slice compatibility/characterization only; no additional Student migration without gate | Student module receives separate Module Readiness authorization and later completion evidence |
| LF-028 | `src/bootstrap/stranglerContainer.js` | MIGRATING | Attendance/Students routing and adapter composition | No business policy or unrelated module registration; only already authorized migration composition | Target composition root replaces temporary strangler wiring after relevant rollback windows |
| LF-029 | `src/infrastructure/http/StranglerRouter.js` | MIGRATING | Compatibility dispatch to extracted routes | Routing/translation only; no business decision | All supported routes use approved module Presentation and temporary router is no longer required |
| LF-030 | `src/infrastructure/migration/**` | MIGRATING | Attendance store routing, backfill, parity, relay, reconciliation | Attendance migration support only; every addition requires owner, idempotency, and removal condition | Attendance authority stabilizes and rollback/reconciliation windows close |
| LF-031 | `src/infrastructure/database/postgres/**` | MIGRATING | PostgreSQL pool/schema support for approved Attendance scope | No general business/table ownership outside approved scope | Becomes approved platform/module infrastructure after contract, ownership, and operations gates pass |
| LF-032 | `scripts/attendance-*`, `scripts/postgres-schema.js`, Attendance canary scripts | MIGRATING | Attendance migration operations and evidence | No business rules or unrelated module migration; replayable operations only | Attendance migration closes and each temporary script passes retirement review |
| LF-033 | `public/**` parallel frontend strangler | MIGRATING | Existing Attendance page parity path | Existing page parity/compatibility only; no new page/module without authorization | Browser parity, routing cutover, observation, and rollback gates pass |
| LF-034 | Attendance/Students characterization tests | MIGRATING | Existing extracted-slice behavior evidence | May test existing behavior and migration contracts only | Reclassified with the owning module after completion gate |

## Current Classification Summary

| Classification | Count | Decision |
|---|---:|---|
| FROZEN | 25 | Required compatibility remains; responsibility growth prohibited |
| MIGRATING | 9 | Limited to already approved Attendance/Students transition scope |
| REMOVABLE | 0 | No zero-use plus closed rollback/retention evidence exists |
| RETIRED | 0 | No component has a recorded Legacy Retirement Gate decision |

## Baseline Approval Record

| Field | Current value |
|---|---|
| Baseline commit | `3bc3097e2903b4cc917807f9b799ca7628f54617` |
| Semantic fingerprint artifact | 68 approved fingerprints in `architecture/baseline.json`; remote run `30027584361` |
| Architecture Owner approval | `architecture-owner`, 2026-07-23 |
| Module/Data/Security review | Attendance/Data/Security authority recorded under Single-Founder Governance |
| CI configuration hash | `7e17f5d2633a11940c2c9ac625e8818afcd6b5ebac41fcb33e637feab0e734ba` |
| Effective blocking date | 2026-07-23; required check `architecture-enforce-blocking` |

The manifest is the authoritative automated no-growth comparison. Approved fingerprints remain visible debt; any unbaselined fingerprint fails the required check.

WF-EXT-01 revised the executable configuration hash on 2026-07-24 because
Workforce moved from an unregistered legacy context to an approved `migrating`
source root. The original hash remains recorded in `architecture/baseline.json`;
all 68 fingerprints, legacy metrics, ownership records, and the empty exception
register are unchanged.

## State Transition Rules

```text
FROZEN ──approved module migration──► MIGRATING
MIGRATING ──parity + zero use + closed rollback window──► REMOVABLE
REMOVABLE ──Legacy Retirement Gate + removal release──► RETIRED
```

No transition is automatic. Every transition records decision date, evidence, approvers, accepted risk, rollback/restore treatment, and resulting manifest revision. A component cannot skip `REMOVABLE` when production deletion or contract removal is involved.
