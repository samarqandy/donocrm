# Architecture Remediation Verification

Status: **TECHNICAL REMEDIATION VERIFIED; RELEASE GATE STILL OPEN**
Evidence date: **2026-07-23 (Asia/Tashkent)**
Scope: deterministic regression, Attendance SQLite/PostgreSQL repository parity, and Architecture Enforcement candidate evidence.

## Outcome

The previously blocking deterministic regression and Critical Attendance repository differences are closed in isolated verification:

- full `npm test`: PASS;
- backend scenarios: 20/20 PASS;
- live isolated repository runner: 21 PASS, 0 FAIL, 0 DIFF;
- deterministic read contracts: 15 PASS, 0 FAIL, 0 DIFF;
- deterministic reason/audit write contracts: 6 PASS, 0 FAIL, 0 DIFF;
- `findLesson` edge cases: 7 PASS, including local dates, teacher precedence, and `legacy` finance state;
- `hasActiveSettlement`: 4 PASS;
- `replaceForLesson`: 9 PASS, including finance rejection, rollback, tenant isolation, and concurrent writers;
- `reopenLesson`: 10 PASS, including finance rejection, rollback, tenant isolation, and concurrency;
- architecture scanner: 68 candidate-baseline findings, 0 unbaselined findings;
- candidate configuration hash: `978751ecfea3578fe521961e79e6676d3f220b0c09d9ecae3e9943f3c2c62d3b`.

The checks used disposable PostgreSQL fixtures. Temporary schemas and the RAM-backed test container were removed after execution.

## Implemented remediation

1. Replaced the non-deterministic Teacher Management lesson date with a relative historical fixture.
2. Preserved the PostgreSQL calendar date contract without UTC day shifting.
3. Routed roster and alert reference projections through the authoritative SQLite compatibility reader while PostgreSQL supplies Attendance-owned state.
4. Delegated settlement and closed-finance-period decisions to the authoritative finance guard and fail closed when it is unavailable.
5. Restored full `findByLesson` DTO mapping.
6. Preserved the public `legacy` lesson finance state in PostgreSQL and backfill.
7. Changed the PostgreSQL touch trigger to preserve an explicitly supplied canonical `updated_at`, while still auto-touching updates that do not supply a new timestamp.
8. Added deterministic SQLite/PostgreSQL contract fixtures to the warning-only GitHub workflow.
9. Removed four obsolete PostgreSQL cross-context fingerprints from the candidate baseline and made its configuration hash stable and non-self-referential.
10. Injected deterministic ID/clock dependencies into Attendance adapters for exact write-contract verification.
11. Normalized duplicate Attendance reason codes to the same stable `409` domain error in both stores.

Schema changes are isolated in:

- `004_lesson_financial_status_legacy.sql`;
- `005_preserve_explicit_updated_at.sql`.

## CI evidence

`npm run architecture:contract:fixture` now executes:

1. deterministic 17-table seed/rollback parity;
2. all 15 read contracts;
3. `findLesson` date/teacher/status cases;
4. settlement authority cases;
5. reason create/update/outbox/stale/duplicate and audit cases;
6. guarded replace/correction cases;
7. guarded reopen cases.

The GitHub workflow provisions an isolated PostgreSQL 16 service for this suite. The workflow change is locally validated but has not yet produced a remote GitHub Actions artifact because the working tree is not committed or pushed.

## Remaining gate blockers

1. Commit and review the exact working tree, then record that commit and approver in `architecture/baseline.json`. The baseline remains `pending-approval`.
2. Obtain a remote CI evidence artifact and only then decide whether to promote selected rules from OBSERVE to blocking.
3. Execute a controlled route-switch rollback drill with paired restorable backups, fault injection, measured RTO/RPO, and an observation window.
4. Reconcile the deployed `tenant_main` PostgreSQL routing state with an explicit Architecture Owner authorization record.
5. Approve operational alert thresholds, relay-lag limits, and stop criteria.

## Gate decision

**NOT READY for Workforce migration or Architecture Enforcement fail mode.**

The deterministic regression and all 20 Attendance repository method contracts are verified in isolated fixtures, but the signed baseline, remote CI artifact, and release-qualified rollback/observability evidence are still mandatory.
