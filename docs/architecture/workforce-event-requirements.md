# Workforce Integration-Event and Audit Delivery Decision

Decision ID: WF-PRE-12

Status: Approved

Decision date: 2026-07-24

Catalog version: `1.0.0`

## Decision

No Workforce integration event is approved for first extraction.

Every evidenced upstream and downstream dependency remains an explicit synchronous Application context, query, or command contract. Audit & History accepts the mandatory Workforce audit intent synchronously through `WorkforceAuditAppenderPortV1`; it is not replaced by a best-effort event.

The authoritative catalog is [workforce-event-requirements.json](../../architecture/workforce-event-requirements.json), SHA-256:

`03395fc5325f9fe62d44fe7383cd284ef8957b575a82575ae8bcc0857b908804`

It fixes:

- 19/19 exact dependency dispositions;
- 11/11 PRE-10 provider ports;
- all seven PRE-07 seams;
- all seven `WF-REF-01` service callers;
- zero published events, zero consumed events, and zero approved event versions;
- synchronous mandatory Audit acceptance and its failure boundary;
- the effect on all ten PRE-11 write variants;
- four risks, seven guards, and zero temporary exceptions.

Run:

```bash
npm run architecture:workforce-events
```

This decision changes no runtime source, route, adapter, schema, table, publisher, subscriber, worker, business behavior, or authority.

## Event Admission Rule

An integration event is justified only when an identified consumer needs an independently processed committed fact and a synchronous public Application/query contract cannot satisfy the evidenced requirement.

For first Workforce extraction:

1. No current Workforce event publisher or subscriber exists.
2. No consumer has an approved independent asynchronous reaction.
3. No Workforce event schema, version, outbox, inbox, delivery worker, ordering rule, retention rule, or replay rule exists.
4. The approved PRE-07 through PRE-11 contracts already provide exact synchronous boundaries.
5. Creating an event now would manufacture delivery and compatibility obligations without a consumer requirement.

Consequently, the published-event, consumed-event, and approved-version catalogs are intentionally empty. Empty is a governed decision, not missing documentation.

## Upstream Dependency Dispositions

| ID | Provider/capability | Contract | Mode | Event decision |
|---|---|---|---|---|
| WF-EVENT-DEP-01 | Platform — verified actor/tenant context | `WorkforceActorContextV1` / `WorkforceServiceContextV1` | Synchronous context | No event; request authority must be known before execution |
| WF-EVENT-DEP-02 | Identity — portal lifecycle | `TeacherPortalLifecycleCommandPortV1` | Synchronous command | No event; immediate outcome required, unsafe split writes stay legacy-held |
| WF-EVENT-DEP-03 | Identity — credential reset/all-session invalidation | `TeacherCredentialResetCommandPortV1` | Synchronous command | No event; one Identity-local atomic result |
| WF-EVENT-DEP-04 | Identity — portal projection | `TeacherPortalAccessProjectionPortV1` | Synchronous query | No event-fed cache or freshness contract |
| WF-EVENT-DEP-05 | Organization — Branch resolution | `BranchReferenceResolverPortV1` | Synchronous fail-closed query | No event; request-time mutation precondition |
| WF-EVENT-DEP-06 | Academic Groups — archive blocker | `ActiveGroupArchiveBlockerPortV1` | Synchronous fail-closed query | No event; stale projection cannot authorize archive |
| WF-EVENT-DEP-07 | Academic Groups — profile projection | `TeacherGroupProjectionPortV1` | Synchronous query | No replicated read model |
| WF-EVENT-DEP-08 | Scheduling — workload/schedule projection | `TeacherScheduleProjectionPortV1` | Synchronous query | No replicated read model |
| WF-EVENT-DEP-09 | Lesson Delivery — archive blocker | `UpcomingLessonArchiveBlockerPortV1` | Synchronous fail-closed query | No event; current Lesson meaning required |
| WF-EVENT-DEP-10 | Lesson Delivery — profile projection | `TeacherLessonProjectionPortV1` | Synchronous query | No replicated read model |
| WF-EVENT-DEP-11 | Student Information — active counts | `TeacherStudentCountProjectionPortV1` | Synchronous query | Exact keyed projection is sufficient |
| WF-EVENT-DEP-12 | Audit & History — mandatory audit acceptance | `WorkforceAuditAppenderPortV1` | Synchronous command | No event; exact decision below |

All 11 PRE-10 provider ports appear exactly once. Provider query results remain request-time facts. This decision does not authorize local cached copies of Identity, Branch, Group, Schedule, Lesson, Student, or Audit data.

## Downstream Consumer Dispositions

`TeacherReferenceApplicationV1.getTeacherReference` remains the sole first-extraction downstream contract.

| ID | Consumer | Need | Decision |
|---|---|---|---|
| WF-EVENT-DEP-13 | Academic Groups | Teacher reference/status | Synchronous five-field reference query |
| WF-EVENT-DEP-14 | Scheduling | Teacher reference/status | Synchronous five-field reference query |
| WF-EVENT-DEP-15 | Lesson Delivery | Teacher reference/status | Synchronous five-field reference query |
| WF-EVENT-DEP-16 | Attendance | Teacher reference/status | Synchronous five-field reference query |
| WF-EVENT-DEP-17 | Lesson Finance & Payroll | Teacher reference/status | Synchronous five-field reference query |
| WF-EVENT-DEP-18 | Reporting & Export | Teacher reference/status | Synchronous five-field reference query |
| WF-EVENT-DEP-19 | Workforce compatibility coordinator | Teacher reference/status | Synchronous internal public query |

No consumer requires a Teacher-created, Teacher-updated, Teacher-archived, Teacher-restored, Working-Hour-created, or Working-Hour-deleted fact in approved scope.

The reference query does not transfer eligibility rules. Each consumer still owns whether a Teacher may be assigned, scheduled, attached to a Lesson, used for Attendance, paid, or reported.

## Why No Teacher Lifecycle Event

A lifecycle event would require decisions that current product evidence does not justify:

- which lifecycle transition is a public fact;
- which consumer reacts independently;
- payload privacy and minimum fields;
- tenant partition and ordering key;
- version compatibility;
- delivery guarantee and durable handoff;
- subscriber idempotency;
- retention, replay, dead-letter, and recovery;
- rebuild/freshness semantics for any derived read model.

None of these may be inferred from a table foreign key or from an existing synchronous join. Consumer references do not automatically imply event subscription.

## Audit Delivery

### Approved mode

`WF-SEAM-07` remains a synchronous required-acceptance command through `WF-PORT-PROV-11`:

```text
WorkforceAuditAppenderPortV1.append(
  context,
  intent: WorkforceAuditIntentV1
): success | AUDIT_APPEND_FAILED | PROVIDER_UNAVAILABLE
```

The coordinator calls Audit:

1. after the authoritative provider-local business mutation commits;
2. before HTTP success is acknowledged;
3. with only the verified tenant, actor, action, entity reference, and correlation metadata;
4. without credentials, password material, session/grant data, foreign mutable entities, or direct Audit storage access.

Acceptance exists only when Audit & History returns success for one immutable minimum intent. Audit owns its record ID, timestamp, storage, retention, and query policy.

### Why Audit is not an event

No Workforce-owned durable outbox exists. Publishing after the business commit would be best effort. Publishing before the commit would permit a false audit fact. Reusing `migration_outbox` would conflate Attendance store replication with business integration events and violate its authority.

A reliable asynchronous replacement would therefore require new persistence, atomic handoff, delivery, idempotency, observability, and recovery contracts. Those are not hidden inside this gate.

### Failure and unknown outcome

Audit is not in the Workforce or Identity local transaction. It cannot roll back a committed business mutation.

| Condition after business commit | Workflow result | Retry |
|---|---|---|
| Audit returns success | `committed`; success may be acknowledged | None |
| Audit explicitly rejects/fails | `committed_unacknowledged`; return technical failure | No automatic retry |
| Audit timeout/disconnect/process loss | `committed_unacknowledged` with unknown Audit-delivery substate; return technical failure | No automatic retry |

The original business command and Audit append are never automatically replayed. `correlationId` supports diagnosis; it is not an idempotency key or receipt.

Reconciliation must quarantine the original command, prove authoritative business state through provider-owned contracts, determine Audit acceptance through an Audit-owned mechanism, and append a missing intent only under the WF-PRE-14 procedure. Direct `audit_logs` SQL and fabricated success are forbidden.

This synchronous choice preserves the known compatibility acknowledgement boundary. It does not claim atomic durable handoff. WF-PRE-13 must exercise success, explicit failure, timeout, ambiguous acceptance, and duplicate-risk behavior.

## Effect on PRE-11 Write Admission

WF-PRE-12 resolves the Audit-choice placeholder for these six single-authority variants:

- `WF-CONS-03A` — Create Teacher without portal access;
- `WF-CONS-04A` — Update Teacher without access change;
- `WF-CONS-06` — Restore Teacher;
- `WF-CONS-07` — Reset Teacher Password;
- `WF-CONS-09` — Create Working Hour;
- `WF-CONS-10` — Delete Working Hour.

Their disposition advances from “waiting for Audit delivery decision” to `target_write_pending_later_gates`. They remain disabled until WF-PRE-13, WF-PRE-14, and WF-PRE-16 pass.

The following independent consistency blockers remain unchanged:

| Variant | PRE-11 hold |
|---|---|
| `WF-CONS-03B` | Create with portal access — cross-context atomicity |
| `WF-CONS-04B` | Update with access change — cross-context atomicity/concurrency |
| `WF-CONS-05A` | Archive without portal access — blocker TOCTOU |
| `WF-CONS-05B` | Archive with portal access — blocker TOCTOU plus cross-context atomicity |

Target mutation routes enabled by WF-PRE-12: zero.

PRE-11 remains immutable historical gate evidence. This decision explicitly supersedes only its pending Audit-choice condition; it does not rewrite or weaken the earlier consistency model.

## Infrastructure and Schema Decision

WF-PRE-12 approves none of the following:

- event bus or broker;
- event publisher/subscriber port;
- business-event outbox or inbox;
- dead-letter queue;
- replay or polling worker;
- event schema registry;
- Audit receipt/workflow journal;
- `migration_outbox` use for Workforce business events;
- new table, column, trigger, route, adapter, module, or runtime process.

Attendance migration replication events remain a separate store-migration mechanism. They are not Workforce business-event precedent.

## Future Event Change Requirements

A future event proposal must name:

1. producer and committed business fact;
2. at least one real consumer and independent reaction;
3. event name, owner, schema, and version;
4. tenant and ordering keys;
5. minimum privacy-safe payload;
6. transactionally reliable delivery mechanism;
7. subscriber idempotency and duplicate handling;
8. timeout, retry, dead-letter, replay, and recovery;
9. observability, retention, compatibility, and removal policy;
10. executable producer/consumer contract tests.

Until such a governed decision passes, the empty event catalogs are authoritative.

## Risks and Treatments

| Risk | Severity | Treatment |
|---|---|---|
| Unevidenced lifecycle events create permanent contract/delivery obligations | High | Keep all event catalogs empty; use exact synchronous contracts |
| Business commit can precede failed/uncertain Audit acceptance | High | `committed_unacknowledged`, failure response, no auto-retry, PRE-13 tests and PRE-14 reconciliation |
| Migration outbox is mistaken for business integration infrastructure | High | Explicitly prohibit reuse and preserve migration/business-event separation |
| Event-fed projections duplicate authority and hide staleness | High | Keep provider reads synchronous until freshness/rebuild/ownership evidence exists |

## Guards

The deterministic verifier enforces:

1. one disposition for each of 11 provider ports;
2. one synchronous reference disposition for each of seven service callers;
3. empty published, consumed, and version catalogs;
4. synchronous mandatory Audit acceptance;
5. `committed_unacknowledged` and no automatic retry after post-commit Audit failure;
6. no event/outbox/inbox/DLQ/worker/schema authorization;
7. zero target mutation routes and all four PRE-11 legacy holds preserved.

Temporary event exceptions: zero.

## Explicit Deferrals

- Executable synchronous-provider, Audit fault/ambiguity, tenant, and parity tests — WF-PRE-13.
- Route increments, Audit reconciliation, thresholds, fallback, observation, and rollback — WF-PRE-14.
- Final Module Readiness and migration authorization — WF-PRE-16.
- Any future consumer-driven event — a new governed event-contract decision.

## Approval

Approved on 2026-07-24 under Single-Founder Governance by Sukhrob Khaydarov as Architecture Owner, Workforce Module Owner, Identity & Access Owner, Organization & Branches Owner, Academic Groups Owner, Scheduling Owner, Lesson Delivery Owner, Student Information Owner, Attendance Owner, Lesson Finance & Payroll Owner, Reporting & Export Owner, Audit & History Owner, Data Owner, Operations Owner, Security Owner, and Quality Owner.

## Gate Result

**WF-PRE-12: PASSED**

All 19/19 dependencies have an exact synchronous/no-event disposition. There are zero published events, zero consumed events, zero approved event versions, synchronous mandatory Audit acceptance, zero temporary exceptions, and zero target mutation routes enabled.

Module Readiness remains Failed. The next ordered prerequisite is WF-PRE-13: approve the executable test and parity plan.
