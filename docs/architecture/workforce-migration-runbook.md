# Workforce Migration and Rollback Runbook

Decision ID: WF-PRE-14

Status: Approved

Decision date: 2026-07-24

Runbook version: `1.0.0`

## Decision

Workforce migration now has an exact, fail-closed operational runbook covering route increments, authority, cohorts, entry/promotion/stop thresholds, rollback, reconciliation, observation, and legacy retirement conditions.

The authoritative machine runbook is [workforce-migration-runbook.json](../../architecture/workforce-migration-runbook.json), SHA-256:

`de9b0719cc3b5d24f867a2fb76020ea67a182f0df82fde5e56bfb161824c326c`

It fixes:

- 10/10 route increments for the ten structurally target-eligible PRE-11 variants;
- four legacy-hold variants that can never select target;
- six cohort stages with a zero-default production allowlist;
- five promotion stages with minimum time and sample counts;
- count-one critical stop triggers, error/latency limits, five-minute rollback RTO, and accepted-write RPO is zero;
- eight exact future operator commands and eight rollback steps;
- reconciliation, 14-day rollback window, and 30 consecutive zero-use days before legacy retirement;
- six risks, seven guards, and zero exceptions.

Run:

```bash
npm run architecture:workforce-runbook
```

This is an approved runbook specification. At this gate the production cohort is empty, zero operator commands implemented, zero rehearsals executed, zero authority transfers performed, and zero target routes enabled.

## Non-Negotiable Routing Rules

1. Default route is `legacy`.
2. Route selection uses the exact tuple `(tenantId, contractId, consistencyVariantId, actorClass)`.
3. Missing, invalid, expired, stale, or unavailable registry state selects legacy.
4. A command has exactly one request-path authority.
5. Commands cannot execute in shadow mode.
6. Synchronous dual write is forbidden.
7. After a target command is dispatched, that request cannot fall back to legacy or automatically retry.
8. Query shadow returns the legacy result only; target output is evidence, never user-visible.
9. First extraction keeps the existing SQLite Workforce tables and introduces no second store, relay, backfill, or schema.
10. Registry changes affect subsequent requests only.

The route registry is future Bootstrap/Operations infrastructure, not Workforce Domain/Application and not a business table. It requires compare-and-set versioning, approval, change ID, reason, effective/expiry times, and append-only change evidence.

## Current Cohort

The current production target allowlist is exactly empty.

WF-PRE-14 does not invent a production tenant ID. Before a real canary, an approved change record must bind exact tenant IDs, route tuples, registry version, times, operator, approvers, and expiry.

| Cohort | Scope | Promotion condition |
|---|---|---|
| WF-COHORT-00 | Synthetic `tenant_wf_rehearsal` only, production-like isolated environment | Suites and rollback rehearsal pass |
| WF-COHORT-01 | Exactly one approved production tenant | Fresh preflight and C0 evidence |
| WF-COHORT-02 | At most five tenants and at most 10% eligible | C1 thresholds pass |
| WF-COHORT-03 | At most 25% eligible, exact IDs | C2 thresholds pass |
| WF-COHORT-04 | At most 50% eligible, exact IDs | C3 thresholds pass |
| WF-COHORT-05 | 100% eligible only; legacy holds excluded | C4 thresholds plus Architecture/Operations/Security approval |

No percentage-based cohort may use implicit hashing or “all except” rules. Exact tenant IDs are committed before activation.

## Ordered Route Increments

Only one increment progresses at a time.

| Order | Increment | Contract / variant | Mode | Important boundary |
|---:|---|---|---|---|
| 1 | WF-ROUTE-01 | `WF-REF-01` / `WF-CONS-REF-01` | Shadow → target | Approved service callers only |
| 2 | WF-ROUTE-02 | `WF-APP-08` / `WF-CONS-08` | Shadow → target | Working Hour list |
| 3 | WF-ROUTE-03 | `WF-APP-01` / `WF-CONS-01` | Shadow → target | Composed directory, provider facts remain provider-owned |
| 4 | WF-ROUTE-04 | `WF-APP-02` / `WF-CONS-02` | Shadow → target | Actor-specific; Teacher self requires privacy remediation PASS |
| 5 | WF-ROUTE-05 | `WF-APP-03` / `WF-CONS-03A` | Target canary | `portalAccess=null` only |
| 6 | WF-ROUTE-06 | `WF-APP-04` / `WF-CONS-04A` | Target canary | `portalAccessChange=null` only |
| 7 | WF-ROUTE-07 | `WF-APP-06` / `WF-CONS-06` | Target canary | Workforce restore only; no portal restore |
| 8 | WF-ROUTE-08 | `WF-APP-07` / `WF-CONS-07` | Target canary | Identity-atomic reset/all-session invalidation |
| 9 | WF-ROUTE-09 | `WF-APP-09` / `WF-CONS-09` | Target canary | Branch remediation and overlap concurrency must pass |
| 10 | WF-ROUTE-10 | `WF-APP-10` / `WF-CONS-10` | Target canary | Hard delete, frozen response quirk, mandatory Audit |

Each increment references exact PRE-13 suites. Every named suite must be implemented and green at the same commit before shadow/canary activation.

## Permanent Legacy Holds

These variants are outside the target selector:

- `WF-CONS-03B`: create with portal access;
- `WF-CONS-04B`: access-changing update;
- `WF-CONS-05A`: archive without portal access;
- `WF-CONS-05B`: archive with portal access.

Any target invocation count for one of these variants is an immediate stop at count one. They require a future consistency decision; PRE-14 cannot waive their blockers.

## Preflight

Preflight must finish no more than 30 minutes before a route change and prove:

- all named PRE-13 suites implemented and PASS at the current commit;
- zero skipped, flaky, quarantined, unknown, or omitted cases;
- every Workforce verifier and architecture enforcement PASS;
- exact registry version and zero unintended target entries;
- tenant/contract/variant/actor tuple approved;
- rollback command dry-run PASS;
- route, threshold, alert, operator, and incident channels ready;
- evidence directory writable and privacy-safe.

Any stale artifact or changed commit invalidates preflight.

## Promotion Windows

| Stage | Minimum observation | Minimum samples per increment |
|---|---:|---:|
| Shadow | 24 hours | 200 comparisons |
| Cohort 01 | 72 hours | 20 command executions; reads still require 200 |
| Cohorts 02–04 | 48 hours each | 100 |
| Cohort 05 | 168 hours | 500 |

Both time and sample requirements are mandatory. Low traffic never converts insufficient evidence into success.

Queries enter shadow before target. Commands never execute shadow writes; they move from completed production-like rehearsal directly to one-tenant target canary.

## Objective Stop Thresholds

The following trigger immediate stop and rollback at count one:

- semantic result/error mismatch;
- tenant leak;
- authorization or privacy mismatch;
- missing or duplicate Audit acceptance;
- `unknown` or `committed_unacknowledged` production outcome;
- target invocation of a legacy-hold variant;
- unexplained data checksum mismatch;
- synchronous dual write.

Error thresholds after at least 100 samples:

- target technical error rate must be at most `1.0%`;
- increase over legacy must be at most `0.5` percentage points;
- three target technical failures in five minutes stop the increment immediately.

Latency thresholds after at least 100 samples:

- target p95 must be at most `1.25×` legacy p95;
- target p95 must also be at most `500 ms`;
- a breach sustained for 15 minutes stops the increment.

The stricter applicable threshold wins.

## Authority and Fallback

Legacy remains authoritative until an exact tuple is committed to target mode.

For queries:

- shadow executes legacy first and returns legacy;
- target shadow is side-effect free;
- a target-mode failure returns the approved error for that request;
- Operations changes the selector for subsequent requests.

For commands:

- selector snapshot is recorded before dispatch;
- exactly one of target or legacy executes;
- after target dispatch, no same-request fallback occurs;
- `not_started` or `rolled_back` may permit a future independently authorized request;
- `committed_unacknowledged` and `unknown` quarantine the tuple until reconciliation.

Because first extraction uses the same SQLite authority, rollback requires no reverse relay. That does not make blind replay safe.

## Planned Operator Commands

Eight future commands are exact:

1. `workforce-route-control.js status`;
2. `workforce-preflight.js`;
3. `workforce-route-control.js set`;
4. `workforce-route-control.js disable`;
5. `workforce-reconcile.js inspect`;
6. `workforce-reconcile.js append-missing-audit`;
7. `workforce-rollback-drill.js`;
8. `workforce-evidence.js close-window`.

Their full arguments are machine-bound in the manifest. None exists yet. No shadow or canary can start until the required commands are implemented, tested, and included in the current-commit preflight.

## Rollback Procedure

1. Freeze promotion, open an incident, and record the exact route tuple, registry version, correlations, and breached threshold.
2. Compare-and-set that tuple to legacy within five minutes.
3. Verify subsequent requests use legacy; do not alter the already-dispatched request.
4. For queries, validate frozen HTTP/privacy behavior; no data reconciliation is required.
5. For `not_started`/`rolled_back`, retain evidence and permit only a future independent request.
6. For committed, `committed_unacknowledged`, or `unknown`, quarantine and never replay blindly.
7. Inspect authoritative facts and Audit-owned acceptance evidence; append a missing Audit intent only when business state and duplicate absence are conclusive.
8. Prove zero accepted-write loss, exact tenant/operation checksums, and obtain Operations/Data/Security closure.

Rollback objectives:

- selector disable RTO: five minutes;
- operator acknowledgement: ten minutes;
- incident triage: 30 minutes;
- reconciliation target: four hours;
- accepted-write RPO is zero.

## Reconciliation

Reconciliation owners are Operations, the authoritative provider owner, Audit & History, Data, and Security.

Allowed:

- read authoritative state through public contracts;
- read Audit-owned acceptance evidence;
- append a conclusively missing Audit intent under incident approval;
- issue a new command only with independent authorization.

Forbidden:

- direct foreign SQL;
- blind replay;
- same-request fallback after dispatch;
- fabricated success;
- immutable Audit rewrite;
- cross-context compensating overwrite.

The tuple remains legacy/quarantined until exact state and Audit evidence have zero unexplained mismatch and owners close the incident.

## Evidence

Every window publishes:

- preflight;
- registry before/after;
- parity summary;
- threshold window;
- rollback drill;
- reconciliation;
- approval.

Artifacts include commit, runbook hash, change/incident ID, increment, cohort, exact tenant IDs, registry version, operator, approvers, times, and result. Passwords, hashes, cookies, tokens, personal data, and raw provider credentials are prohibited.

## Observation and Legacy Retirement

- Keep frozen legacy available through the final eligible cutover plus a 14-day rollback window.
- Observe full eligible routing for at least 168 hours.
- Legacy removal requires 30 consecutive zero-use days for eligible tuples.
- All eligible increments must be at C5.
- Open reconciliation incidents must be zero.
- Permanent legacy holds must either remain explicitly supported or be resolved by a new consistency decision.
- The Legacy Retirement Gate must separately approve removal.

WF-PRE-14 does not retire `AppService`, `AppRepository`, legacy routes, SQLite tables, or provider behavior.

## Current Admission State

| Item | Current value |
|---|---:|
| Runbook specification | Approved |
| Operator commands implemented | 0 |
| Rollback rehearsals executed | 0 |
| Production tenant IDs in target cohort | 0 |
| Authority transfers executed | 0 |
| Target routes enabled | 0 |
| Temporary exceptions | 0 |

WF-PRE-16 subsequently passed Module Readiness for ordered extraction implementation. Implementation and rehearsal remain activation conditions, not facts inferred from this document.

## Approval

Approved on 2026-07-24 under Single-Founder Governance by Sukhrob Khaydarov as Architecture Owner, Workforce Module Owner, Product Authority, Identity & Access Owner, Audit & History Owner, Data Owner, Operations Owner, Security Owner, and Quality Owner.

## Gate Result

**WF-PRE-14: PASSED**

The ordered route plan, cohort system, authority/fallback model, numeric thresholds, rollback/reconciliation procedure, evidence, observation, and retirement conditions are exact. Ten eligible variants have 10/10 route increments; four legacy-hold variants remain target-denied. The production cohort is empty, zero operator commands implemented, and zero target routes are enabled.

WF-PRE-16 subsequently passed and [WF-EXT-01](workforce-extraction-entry.md) registered the structure/composition boundary. WF-EXT-02 is next. This runbook still enables no route.
