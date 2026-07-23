# Architecture Remediation Verification

Status: **PASSED — TECHNICAL, FORMAL, AND OPERATIONAL GATES CLOSED**
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
- approved configuration hash: `2732cc47b0b0913cf35aa4c176750c9cd4abafe16657d19fc2e00c9ef7b7f15d`.

The checks used disposable PostgreSQL fixtures. Temporary schemas and the RAM-backed test container were removed after execution.

## Implemented remediation

1. Replaced the non-deterministic Teacher Management lesson date with a relative historical fixture.
2. Preserved the PostgreSQL calendar date contract without UTC day shifting.
3. Routed roster and alert reference projections through the authoritative SQLite compatibility reader while PostgreSQL supplies Attendance-owned state.
4. Delegated settlement and closed-finance-period decisions to the authoritative finance guard and fail closed when it is unavailable.
5. Restored full `findByLesson` DTO mapping.
6. Preserved the public `legacy` lesson finance state in PostgreSQL and backfill.
7. Changed the PostgreSQL touch trigger to preserve an explicitly supplied canonical `updated_at`, while still auto-touching updates that do not supply a new timestamp.
8. Added deterministic SQLite/PostgreSQL contract fixtures and relay-ordering regression to the blocking GitHub workflow.
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

The GitHub workflow provisions an isolated PostgreSQL 16 service for this suite. Blocking run `30027584361` passed for operational commit `568fe4c17dec0aa4a96c34d6c39340edb91065b1`; artifact `8571938611` is retained for 30 days and copied into the host gate evidence bundle.

## Formal and operational closure

All five prior blockers are closed:

1. baseline commit and Architecture Owner approval are recorded;
2. remote blocking CI and artifact evidence exist;
3. paired backup/restore, two-way route-switch, measured RTO/RPO, and post-cutover observation passed;
4. `tenant_main` PostgreSQL Attendance authority is explicitly recorded;
5. numeric relay, parity, readiness, recovery, and stop thresholds are approved.

Detailed evidence and scope boundaries are in [Formal and Operational Gate Closure](formal-operational-gate-closure-2026-07-23.md).

## Gate decision

**PASSED for current `tenant_main` Attendance PostgreSQL authority and architecture no-growth enforcement.**

This does not authorize Workforce extraction or legacy/SQLite retirement.
