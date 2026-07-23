# Attendance Rollback Evidence

Status: **RELEASE-QUALIFIED FOR `tenant_main` ATTENDANCE**
Evidence date: **2026-07-23 (Asia/Tashkent)**
Detailed record: [Formal and Operational Gate Closure](formal-operational-gate-closure-2026-07-23.md)

## Effective authority

| Concern | Authority |
|---|---|
| `tenant_main` Attendance commands and queries | PostgreSQL |
| PG→SQLite rollback copy | Reverse relay, enabled and proven |
| SQLite→PG recovery/shadow copy | Forward relay, enabled and proven |
| Attendance references and finance guards | SQLite compatibility authority, mirrored/read through explicit adapters |
| Other tenants | SQLite unless separately approved and allowlisted |

The routing decision is process-start, tenant-scoped configuration. PostgreSQL failure does not silently fall back per request; the approved recovery is a controlled route switch.

## Gate checkpoints

| Checkpoint | Result |
|---|---|
| R0 — authorization | PASS; governance roles and `tenant_main` authority recorded |
| R1 — recoverable baseline | PASS; paired SQLite/PostgreSQL artifacts checksummed and restored |
| R2 — forward drain | PASS; pending=0, failed=0 |
| R3 — canonical parity | PASS; 9/9 tables, events, revisions, and orphans |
| R4 — repository contracts | PASS; all 20 methods covered by deterministic fixture suites |
| R5 — reverse drain | PASS; pending=0, failed=0 |
| R6 — controlled reverse write | PASS; one event processed/applied once, zero failure |
| R7 — route-switch drill | PASS; PostgreSQL→SQLite→PostgreSQL with read/write proof |
| R8 — finance safety | PASS; settlement, closed period, stale version, rollback, concurrency, and tenant isolation |
| R9 — post-rollback observation | PASS; 12/12 samples over 124 seconds |

## Recovery result

- SQLite route RTO: **1.547 seconds**.
- PostgreSQL route recovery RTO: **1.720 seconds**.
- Approved RTO ceiling: **30 seconds**.
- RPO: **0 accepted canary writes lost**.
- Final canary Attendance version: **6 in both stores**.
- Final history: **38/38 events** and **35/35 revisions**.
- Final queues: **0 pending / 0 failed in both directions**.
- Final orphan checks: **0 across all seven checks**.
- Consolidated command result: `safeToEnableCanary=true`.

## Defect discovered by the drill

The first SQLite recovery write exposed this event order:

1. `reference.lessons.upsert`;
2. `reference.lesson_events.upsert`;
3. `attendance.replaced`.

The lesson reference could set PostgreSQL `attendance_version` equal to the later Attendance event before the snapshot was copied. The relay previously applied only when the target version was lower, so it skipped the equal-version snapshot.

The relay now applies an accepted event when the target version is lower than or equal to the source version. Inbox acceptance preserves idempotency, while higher target versions remain protected from stale overwrite. A deterministic SQLite/PostgreSQL regression reproduces this exact ordering and is part of the blocking CI suite.

## Stop rules

Do not switch authority if any condition below is true:

- either backup cannot be restored or checksummed;
- any canonical count/checksum differs;
- any orphan count is non-zero;
- either relay direction has a failed event;
- either relay direction has a pending/processing event at switch time;
- oldest pending age exceeds 30 seconds;
- readiness or read-after-switch does not recover within 30 seconds;
- any expected canary request returns an unexpected non-2xx/5xx response;
- post-switch observation finds an inactive service, false readiness, queue backlog, or unexplained error.

If a stop rule fires after a switch, restore the last proven route configuration, restart through the controlled service process, validate readiness and read-after-switch, drain only the authorized direction, and rerun parity before resuming writes.

## Operational controls

- `dono`, `dono-attendance-relay`, and `dono-telegram-worker` run as `dono:dono`.
- environment files are `0640 root:dono`;
- data and backup directories are `0750 dono:dono`;
- `dono-backup.timer` is active;
- online SQLite backups validate integrity and foreign keys before compression;
- blocking GitHub check: `architecture-enforce-blocking`;
- force-push and `main` deletion are disabled.

## Scope boundary

This evidence qualifies rollback for current `tenant_main` Attendance authority. It does not authorize deleting SQLite, disabling either relay, widening the tenant cohort, migrating Workforce, or retiring legacy paths.
