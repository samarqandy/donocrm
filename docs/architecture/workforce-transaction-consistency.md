# Workforce Transaction and Consistency Decision

Decision ID: WF-PRE-11

Status: Approved

Decision date: 2026-07-24

Model version: `1.0.0`

## Decision

Workforce first extraction uses provider-local atomicity only. No target transaction may mutate data owned by more than one bounded context.

The authoritative model is [workforce-consistency-model.json](../../architecture/workforce-consistency-model.json), SHA-256:

`1a87f79c014f4dd12f8a664b02416207c4b3835aa06a40ac8fe724a6ebbd75cb`

It fixes:

- current legacy transaction/rollback evidence;
- five provider-local atomic units;
- 14 exact operation variants covering all 11 public contracts;
- ordering, failure, unknown-outcome, retry, compensation, Audit, and reconciliation rules;
- target route admission and legacy-hold predicates;
- five blocking consistency risks and seven guards.

Run:

```bash
npm run architecture:workforce-consistency
```

This decision changes no route, adapter, database, schema, table, business behavior, or runtime authority.

## Core Consistency Rules

1. An authoritative mutation commits only inside the bounded context that owns the changed data.
2. A local atomic unit commits all its statements or rolls all of them back.
3. Distributed transactions, shared cross-context SQLite transactions, two-phase commit, and a transaction object crossing a public port are forbidden.
4. Unknown provider outcomes are not success and are not safe to replay.
5. No HTTP command, coordinator step, or provider mutation is automatically retried.
6. `correlationId` is diagnostic; it is not an idempotency key.
7. Cross-context compensation is not assumed safe without an explicit provider contract, concurrency token, and executable test.
8. Audit remains mandatory for every mutation.

## Why Write Admission Is Guarded

The current legacy implementation gains accidental cross-context atomicity by writing Workforce and Identity tables inside one SQLite transaction. That behavior cannot be reproduced after enforcing bounded-context ownership without either:

- a distributed transaction, which is prohibited; or
- a durable workflow/reservation/idempotency protocol, which does not exist and would require a separately approved contract and persistence model.

WF-PRE-11 therefore does not pretend that a best-effort sequence is equivalent. Cross-context variants remain on the frozen legacy path. At this gate, single-authority variants had exact target local atomicity but remained disabled pending WF-PRE-12. WF-PRE-12 subsequently retained synchronous mandatory Audit acceptance, WF-PRE-13 specified the required proof suites, WF-PRE-14 approved the runbook, and WF-PRE-16 passed ordered extraction entry. Those variants still wait on passing suite and activation evidence, with no route enabled.

## Consistency Outcome States

| State | Meaning | Replay rule |
|---|---|---|
| `not_started` | No authoritative mutation was dispatched | May be reissued as a new command after diagnosis |
| `rolled_back` | The provider-local transaction failed and rolled back | May be reissued as a new command after diagnosis |
| `committed` | Local commit and all acknowledgement conditions succeeded | Return the approved success |
| `committed_unacknowledged` | Commit is known, but Audit/response acknowledgement failed | Do not replay automatically; reconcile |
| `unknown` | Dispatch occurred but commit outcome cannot be proven | Quarantine replay and reconcile |

Timeout, disconnect, or process loss after dispatch produces `unknown` unless the provider can conclusively prove its result.

## Current Legacy Evidence

| Evidence | Current atomicity | Gap |
|---|---|---|
| WF-LEGACY-TX-01 Create Teacher | `teachers` plus optional Identity tables in one SQLite transaction | Audit occurs after commit |
| WF-LEGACY-TX-02 Update Teacher | Teacher/profile and access/session changes in one SQLite transaction | Audit occurs after commit |
| WF-LEGACY-TX-03 Archive Teacher | Teacher/User/session mutation in one SQLite transaction | Group/Lesson blocker reads and Audit are outside |
| WF-LEGACY-TX-04 Reset Password | Password update and session deletion are separate autocommit statements | Session invalidation may fail after credential commit |
| WF-LEGACY-TX-05 Restore/Working Hours | Workforce row autocommits | Audit cannot roll it back |

These transactions remain visible legacy behavior. They do not authorize a target adapter to access Identity or Audit tables.

## Approved Atomic Units

| ID | Owner | Scope | Required guarantee |
|---|---|---|---|
| WF-ATOMIC-01 | Workforce | One Teacher insert/profile replacement/status transition in `teachers` | Commit or roll back the tenant-scoped aggregate mutation |
| WF-ATOMIC-02 | Workforce | Working Hour insert/delete in `teacher_working_hours` | Competing overlap recheck and insert are protected in the same local transaction |
| ID-ATOMIC-01 | Identity & Access | Portal provision/change/disable in Identity-owned tables | Lifecycle outcome and required session invalidation commit or roll back together |
| ID-ATOMIC-02 | Identity & Access | Credential replacement plus session invalidation | New credential and deletion of every session for the tenant-scoped Teacher User commit or roll back together |
| AUD-ATOMIC-01 | Audit & History | One immutable Audit intent | WF-PRE-12 subsequently approves synchronous required acceptance through `WorkforceAuditAppenderPortV1` |

Branch resolution, Group/Lesson blocker checks, and projection reads are precondition snapshots, not transaction participants.

## Exact Route Admission

### Read variants

The following are structurally target-admissible because they perform no mutation:

- WF-APP-01 List Teachers;
- WF-APP-02 Get Teacher Profile;
- WF-APP-08 List Working Hours;
- WF-REF-01 Get Teacher Reference.

Provider failure fails the complete query. Partial directories/profiles are forbidden. WF-PRE-13 subsequently specifies exact query/provider-failure/no-partial tests; actual routing still requires their passing implementation and the WF-PRE-14 activation controls. WF-PRE-16 authorizes implementation only.

### Single-authority write variants at the PRE-11 gate

Six variants have one authoritative business writer but remain blocked on the Audit delivery decision:

| Variant | Business atomic unit |
|---|---|
| Create Teacher with `portalAccess = null` | WF-ATOMIC-01 |
| Update Teacher with `portalAccessChange = null` | WF-ATOMIC-01 |
| Restore Teacher | WF-ATOMIC-01 |
| Reset Teacher Password | ID-ATOMIC-02 |
| Create Working Hour | WF-ATOMIC-02 |
| Delete Working Hour | WF-ATOMIC-02 |

A business commit followed by failed acknowledgement is `committed_unacknowledged`, not rollback. WF-PRE-12 subsequently chooses synchronous required acceptance, explicitly documents that it is not an atomic durable handoff, and forbids automatic replay. WF-PRE-13 subsequently specifies every success/failure/ambiguous/no-retry case; the suite must pass before command routing.

### Legacy-hold variants

| Variant | Reason target routing is denied |
|---|---|
| Create Teacher with portal access enabled | Workforce and Identity split-commit risk; no reservation/idempotency protocol |
| Update Teacher with a portal access change | Workforce and Identity split-commit/concurrent overwrite risk |
| Archive Teacher without portal access | Group/Lesson blocker snapshots can race Teacher status |
| Archive Teacher with portal access | Blocker race plus Workforce/Identity split-commit risk |

These variants execute only through the frozen legacy operation. They cannot call target mutation ports. No target compensation is invented.

## Operation Ordering

### Local Teacher create/update

1. Authorize and validate canonical input.
2. Resolve Branch as a request-time Organization snapshot.
3. Generate Workforce-owned ID/time when creating.
4. Commit WF-ATOMIC-01.
5. Satisfy the approved Audit delivery condition.
6. Read keyed projections and compose the exact response.

Failures before commit roll back. Failures after commit cannot claim rollback.

### Password reset

1. Authorize and validate.
2. Read the tenant-scoped Teacher reference.
3. Identity atomically replaces the credential and invalidates every session.
4. Satisfy Audit delivery.
5. Acknowledge success.

Teacher active status is not a precondition because current behavior permits reset for a configured inactive Teacher. Identity owns password hashing and session scope.

### Working Hour create

1. Authorize and validate the Teacher reference/status and interval.
2. Resolve Branch as a request-time snapshot.
3. Generate Working Hour ID/time.
4. Inside WF-ATOMIC-02, recheck overlap and insert.
5. Satisfy Audit delivery.
6. Compose the response.

The pre-port overlap check is advisory. The transaction-protected recheck is authoritative.

## Precondition Consistency

### Branch

Branch validity/default is a request-time snapshot. A later Branch lifecycle change does not retroactively roll back a committed Workforce reference. This is the approved PRE-07 behavior.

### Archive blockers

Group and Lesson blocker queries are fail-closed snapshots, but no distributed lock protects the interval between their results and Teacher status commit. A concurrent assignment or Lesson can therefore violate the intended archive invariant.

All archive variants remain legacy hold until one of these is separately approved:

- provider reservation/version protocol; or
- a precise reconciliation invariant with tested correction and operational ownership.

## Retry and Idempotency

- No Workforce HTTP operation accepts an idempotency key.
- No command is automatically retried.
- `correlationId` cannot deduplicate a mutation.
- `Create Teacher` and `Create Working Hour` are explicitly non-idempotent.
- A semantic state-setting command is still not transport-replay-safe because response and Audit effects can duplicate.
- `not_started` and `rolled_back` may be manually reissued as new commands after diagnosis.
- `unknown` and `committed_unacknowledged` require reconciliation before any new mutation.

This policy is deliberately stricter than “retry on timeout.”

## Compensation

Local transaction rollback before commit is approved. No cross-context compensating mutation is approved.

In particular, WF-PRE-11 does not claim that any of the following is safe:

- archive/delete a Teacher after failed portal provisioning;
- re-enable Identity after a failed Teacher archive;
- restore an old Teacher profile after failed access update;
- restore a prior password after session invalidation failure.

Those actions lack reservation/version/concurrency contracts and could overwrite legitimate concurrent work.

## Audit Consistency

Audit is a mandatory acknowledgement condition, but Audit is not part of a Workforce or Identity local transaction.

WF-PRE-12 subsequently keeps WF-SEAM-07 synchronous through `WorkforceAuditAppenderPortV1`; no event, version, outbox, or publisher is approved. Audit success is required before HTTP success acknowledgement. Explicit or ambiguous Audit failure after the business commit is `committed_unacknowledged`, returns technical failure, and cannot automatically replay.

After WF-PRE-12:

- the six single-authority variants have their Audit-choice condition resolved;
- they remain pending implementation/passage of their WF-PRE-13-named suites and WF-PRE-14 activation evidence;
- target mutation routes enabled remain zero;
- all four independent legacy holds remain unchanged.

This avoids silently accepting unaudited committed business changes while making the non-atomic handoff limitation explicit.

## Reconciliation

`unknown` and `committed_unacknowledged` are consistency incidents owned jointly by Operations and the authoritative provider owner.

Allowed:

- inspect facts through approved public queries;
- append a missing Audit intent only after authoritative state is proven;
- select an explicitly approved provider command.

Forbidden:

- direct foreign SQL repair;
- blind command replay;
- fabricating success for the original request;
- rewriting immutable Audit history;
- cross-context rollback without a versioned compensation contract.

WF-PRE-14 must supply exact commands, evidence capture, owners, thresholds, and escalation.

## Guards

The machine verifier enforces:

1. one bounded-context owner per atomic unit;
2. zero target write variants enabled by this decision;
3. legacy-hold variants cannot invoke target atomic units;
4. unknown outcomes cannot auto-retry or become success;
5. credential reset and all-session invalidation are one Identity unit;
6. archive remains held while blocker TOCTOU is open;
7. no foreign SQL, cross-context Unit of Work, distributed transaction, workflow journal, outbox, or event is introduced.

Temporary target exceptions: zero.

## Explicit Deferrals

- Audit delivery and all other event decisions — subsequently completed by [WF-PRE-12](workforce-event-requirements.md).
- Atomicity, timeout, rollback, unknown-outcome, tenant, blocker-race, Audit, and parity test specification — subsequently approved by [WF-PRE-13](workforce-test-parity-plan.md).
- Route variants, cohort, stop/rollback thresholds, and reconciliation runbook — WF-PRE-14.
- Ordered extraction entry — WF-PRE-16; route activation remains a separate increment gate.

## Approval

Approved on 2026-07-24 under Single-Founder Governance by Sukhrob Khaydarov as Architecture Owner, Workforce Module Owner, Data Owner, Identity & Access Owner, Academic Groups Owner, Lesson Delivery Owner, Audit & History Owner, Operations Owner, Security Owner, and Quality Owner.

## Gate Result

**WF-PRE-11: PASSED**

Authority, atomicity, ordering, failure, retry, compensation, session invalidation, unknown-outcome, reconciliation, and route-admission behavior are exact for all 14 variants. At this decision point, zero target write routes were enabled, six waited for the Audit decision, and four remained explicit legacy holds. WF-PRE-12 subsequently resolved the Audit choice without enabling a route.

WF-PRE-12 through WF-PRE-14 subsequently approved [integration-event/Audit delivery](workforce-event-requirements.md), [test/parity](workforce-test-parity-plan.md), and the [migration/rollback runbook](workforce-migration-runbook.md). [WF-PRE-16](workforce-module-readiness-decision.md) then passed ordered extraction entry; runtime routes remain disabled.
