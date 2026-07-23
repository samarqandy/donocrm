# Migration Platform Verification Readiness Report

> **Historical gate snapshot.** Critical Attendance contract remediation has
> since passed isolated verification. The current gate status and remaining
> blockers are recorded in
> [`remediation-verification-2026-07-23.md`](remediation-verification-2026-07-23.md).
> The original score below is retained for audit history and has not been
> silently recalculated.

Review date: **2026-07-23 (Asia/Tashkent)**
Review scope: Architecture migration evidence only. No module migration or runtime/application change was performed.

## Evidence summary

The migration platform can reproduce the current canonical Attendance dataset and has successfully relayed historical writes in both directions. It cannot yet prove behaviorally safe SQLite/PostgreSQL substitution.

Material findings:

- Current canonical data, history, orphan checks, and relay queues pass.
- Normalized query parity passes on all current Attendance projections.
- Raw repository contract status is `DIFF`.
- 17 of 20 repository methods have a proven semantic difference; 3 are equivalent.
- PostgreSQL shifts command-side lesson dates by one day under the deployed timezone.
- PostgreSQL cannot detect SQLite-owned confirmed lesson settlements.
- PostgreSQL correction/reopen transactions omit SQLite's settlement and closed-period rechecks.
- 30 of 43 current logical Attendance rows have different repository-visible IDs.
- Five write methods have no identical cross-adapter executable contract suite.
- Reverse relay has 35 completed historical events and clean queues, but no fresh controlled route-switch rollback drill was executed.
- The running service routes `tenant_main` Attendance to PostgreSQL even though the supplied governance state says runtime migration is not authorized.

## Readiness scoring

| Dimension | Score | Basis |
|---|---:|---|
| Repository parity | **38/100** | Data parity passes, but raw contract parity has Critical/High differences and only 3/20 methods are equivalent |
| Migration safety | **32/100** | Tenant-scoped routing and relay exist, but finance guards/date semantics are unsafe and deployed authority conflicts with supplied governance |
| Rollback confidence | **58/100** | Active reverse relay, 35 completed events, clean queues, and matching history; no fresh route-switch drill, restore proof, or fault injection |
| Contract stability | **42/100** | Interfaces are complete, but date, lesson/roster shapes, Attendance IDs, reason timestamps, errors, and write side effects differ |
| Evidence completeness | **64/100** | Strong live read/data evidence; missing identical write suites, positive finance fixtures, timezone matrix, concurrency, and controlled rollback drill |
| **Overall readiness** | **47/100** | Arithmetic mean, rounded |

## Blocking conditions

1. Reconcile the deployed PostgreSQL authority for `tenant_main` with the Architecture Owner's authorization record. Until reconciled, no further migration activity is permitted.
2. Correct and contract-test local-date handling for all command-side PostgreSQL reads.
3. Define and enforce the authoritative finance/settlement boundary; positive settlement and closed-period cases must reject identically and atomically.
4. Make roster membership and returned student projection contract-equivalent, including historical correction behavior.
5. Decide whether Attendance row `id` is a stable public contract. Preserve it across relay/backfill or formally remove it from the contract with compatibility evidence.
6. Execute one identical isolated write-contract suite against both adapters for reason create/update, mark/correct, reopen, and audit, including error and transaction side effects.
7. Add edge fixtures for inherited teacher, ended enrollment, closed/overlapping finance periods, confirmed settlement, stale version, duplicate code, null/fallback reason, and Asia/Tashkent date boundaries.
8. Complete a controlled reverse-relay and tenant route-switch rollback drill with paired restorable backups, fault injection, measured RTO/RPO, clean queues, parity, and Architecture Owner approval.
9. Promote repository contract/parity checks from warning-only OBSERVE mode only after the accepted differences are zero or governed by explicit, expiring exceptions.

## Recommended next phase

Proceed only to **Verification Remediation**, not Attendance completion and not Workforce migration. That phase must close the Critical/High contract gaps and repeat the full evidence pack on isolated fixtures before any migration gate is reconsidered.

## Gate decision

**NOT READY**
