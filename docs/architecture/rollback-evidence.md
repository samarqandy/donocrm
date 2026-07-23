# Attendance Rollback Evidence

> **Update:** isolated finance guards, correction/reopen rollback, concurrency,
> date, and repository read contracts now pass. Release-qualified route-switch,
> paired restore, fault-injection, and observation evidence remain open. See
> [`remediation-verification-2026-07-23.md`](remediation-verification-2026-07-23.md).

Status: **PARTIALLY PROVEN; NOT RELEASE-QUALIFIED**
Evidence date: **2026-07-23 (Asia/Tashkent)**

This document records existing rollback mechanics and observed evidence only. No routing, relay, store, schema, or application state was changed during verification.

## Observed runtime state

At verification time:

- `dono.service`: active/running.
- `dono-attendance-relay.service`: active/running.
- Application and relay processes both had `DATABASE_URL` configured.
- `DONO_ATTENDANCE_POSTGRES_TENANTS=tenant_main`.
- `DONO_ATTENDANCE_MIRROR_ENABLED=true`.
- `DONO_ATTENDANCE_REVERSE_RELAY_READY=true`.
- `DONO_ATTENDANCE_REVERSE_RELAY_ENABLED=true`.

Therefore, `tenant_main` Attendance command and query traffic is currently routed to PostgreSQL by `StoreRouter`. This conflicts with the supplied governance state that no runtime migration is authorized. Verification did not alter or disable this routing; the Architecture Owner must reconcile the authorization record with the deployed configuration.

## Store authority

| Concern | Current effective authority | Evidence | Residual issue |
|---|---|---|---|
| Attendance commands for `tenant_main` | PostgreSQL | Tenant is in `DONO_ATTENDANCE_POSTGRES_TENANTS` | Governance authorization is not evidenced |
| Attendance queries for `tenant_main` | PostgreSQL | The same allowlist configures the query router | Raw query IDs and record shapes differ |
| Attendance rollback copy | SQLite | PG→SQLite reverse relay enabled | Copy is asynchronous, not a synchronous dual commit |
| Attendance references | SQLite source, PostgreSQL mirror | SQLite→PG reference events and mirror versions | Attendance PG reads depend on freshness of external-context mirrors |
| Finance/settlements | SQLite remains authoritative in architecture intent | PostgreSQL adapter comments acknowledge this | PG returns constant `false` for active settlements and reads a mirrored finance-period table |
| Non-allowlisted tenants | SQLite | `StoreRouter.primaryFor()` defaults to SQLite | No automatic fallback if an allowlisted PG repository fails |

The routing decision is process-start configuration. It is tenant-scoped and deterministic, but there is no dynamic circuit breaker or per-request fallback. If a tenant is allowlisted and PostgreSQL is unavailable, the request fails.

## Reverse relay design evidence

The PostgreSQL-to-SQLite reverse relay provides:

- PostgreSQL outbox rows written in the same PostgreSQL transaction as Attendance/reason changes.
- Tenant and payload validation before applying an event.
- SQLite `BEGIN IMMEDIATE` around inbox acceptance, state mutation, revision, and event history.
- Inbox idempotency on `(tenant_id, event_id)`.
- Monotonic state application: SQLite state changes only when its `attendance_version` is lower than the event source version.
- Stale events can still materialize missing history without overwriting newer state.
- Retry of pending/failed events up to 20 attempts.
- PostgreSQL outbox completion only after the SQLite transaction commits.

Observed reverse-relay history:

| Event | SQLite inbox count |
|---|---:|
| `attendance.replaced` | 26 |
| `attendance.reopened` | 3 |
| `attendance_reason.created` | 2 |
| `attendance_reason.updated` | 4 |
| **Total** | **35** |

PostgreSQL contained 35 matching PG→SQLite outbox rows in `done` state. At the final atomic-snapshot verification, both relay directions had zero pending and zero failed rows.

This is credible evidence that reverse relay has operated. It is not a fresh controlled rollback drill: no new canary write was created, no route was switched back, and no failure was injected during this verification.

## Current parity checkpoint

The atomic SQLite snapshot and PostgreSQL canary state passed:

- 9/9 canonical table count/checksum comparisons.
- 34/34 lesson-event count/checksum comparison.
- 31/31 attendance-revision count/checksum comparison.
- 7/7 orphan checks with zero orphans.
- Both relay directions with zero pending and zero failed.

The checkpoint does not include raw attendance IDs, reason timestamps, all lesson fields, all student/guardian/ledger projection fields, or repository errors/side effects. It cannot overrule the repository contract differences in `parity-evidence.md`.

## Required rollback checkpoints

| Checkpoint | Required evidence | Current state |
|---|---|---|
| R0 — authorization | Accepted, traceable Architecture Owner approval for the canary and rollback drill | **FAIL / missing**; deployed PG tenant conflicts with supplied no-migration state |
| R1 — recoverable baseline | Atomic SQLite backup plus PostgreSQL backup/restore proof tied to the same checkpoint | **PARTIAL**; atomic SQLite verification snapshot exists, paired restore proof does not |
| R2 — forward drain | SQLite→PG pending=0, failed=0, oldest lag within SLO | **PASS at observation time** |
| R3 — canonical parity | Tables, histories, and orphans pass | **PASS for current covered columns** |
| R4 — repository contract parity | No Critical/High semantic differences | **FAIL** |
| R5 — reverse drain | PG→SQLite pending=0, failed=0 | **PASS at observation time** |
| R6 — controlled reverse write | A uniquely identified PG write reaches SQLite once, survives retry, and matches expected state/history | **NOT EVIDENCED in this verification** |
| R7 — route switch drill | Remove only the canary tenant from PG routing, restart safely, prove SQLite reads/writes, and preserve audit trail | **NOT EVIDENCED** |
| R8 — finance safety | Positive settlement and closed-period cases reject identically before and after rollback | **FAIL / untested with source-proven mismatch** |
| R9 — post-rollback observation | Defined monitoring window, relay lag/error threshold, and signed go/no-go record | **NOT EVIDENCED** |

## Rollback procedure boundary

A release-qualified rollback would require the following ordered evidence. These are documented checkpoints, not actions authorized or executed here.

1. Freeze Attendance writes for the canary tenant or establish a bounded drain window.
2. Record routing configuration and create paired, restorable SQLite/PostgreSQL backups.
3. Drain PG→SQLite outbox to zero pending/failed and record the last processed sequence.
4. Run canonical data/history/orphan parity and raw repository compatibility checks.
5. Remove only the approved tenant from `DONO_ATTENDANCE_POSTGRES_TENANTS` and restart through the controlled deployment process.
6. Prove read-after-switch and one authorized SQLite write, then verify forward shadow relay without re-enabling PG authority.
7. Observe error rate, relay backlog, and audit continuity for the approved window.
8. Obtain the Architecture Owner's explicit rollback completion decision.

Rollback must stop before route switching if any relay backlog is failed, any checksum/history check differs, the SQLite backup is not restorable, or contract-critical fields cannot be reconciled.

## Failure scenarios

| Scenario | Existing behavior/detection | Residual risk and required proof |
|---|---|---|
| PostgreSQL unavailable while tenant is allowlisted | Request fails; readiness includes PostgreSQL for configured canary | No automatic SQLite fallback; controlled route-switch RTO is unmeasured |
| Reverse relay stopped | PG outbox backlog/age grows | No documented alert threshold, paging evidence, or maximum safe lag |
| Reverse event retried after SQLite commit but before PG `done` | SQLite inbox rejects duplicate; PG row can then be marked done | Must be fault-injection tested, including process death at the boundary |
| Reverse events arrive out of order | Lower source version does not overwrite newer SQLite state | History ordering and stale-event materialization need explicit replay tests |
| Event fails 20 times | It is no longer selected by the relay | No dead-letter recovery/runbook evidence; rollback may remain permanently incomplete |
| Two relay workers process the same PG event | Inbox idempotency prevents double state apply | Concurrency and outbox status transitions are not stress-tested |
| Confirmed settlement exists only in SQLite | PG adapter reports no active settlement | Critical unsafe correction/reopen path; rollback cannot be declared safe |
| Finance period closes between use-case check and write | SQLite repository rechecks inside transaction; PG repository does not | Critical race remains in PG authority path |
| Date crosses local/UTC boundary | PG command adapter returns prior calendar date | Validation and alert semantics can differ before rollback is triggered |
| Reference mirror is stale/missing | Backfill/verifier and relay errors may detect missing data | No request-time freshness bound; roster/teacher decisions may use stale PG references |
| Raw Attendance ID is consumed externally | 30/43 current IDs differ between stores | Normalized parity hides the break; compatibility or explicit non-contract decision required |
| Routing configuration is wrong | Startup only checks that reverse-ready flag is literal `true` | The flag is self-asserted and not tied to a dated successful drill artifact |

## Rollback confidence

Rollback confidence: **58/100**.

Positive evidence is meaningful: the reverse worker is active, 35 events have completed in both outbox/inbox records, canonical state/history matches, and current queues are clean. Confidence remains below release threshold because there is no fresh controlled route-switch drill, no paired restore proof, no failure injection, no documented alert/SLO evidence, and critical finance/date contract gaps exist while PostgreSQL is already authoritative for `tenant_main`.
