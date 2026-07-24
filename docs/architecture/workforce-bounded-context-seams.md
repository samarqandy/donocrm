# Workforce Bounded-Context Seam Decision

Decision ID: WF-PRE-07  
Status: Approved  
Decision date: 2026-07-24  
Seam model: `workforce-context-seams-2026-07-24.1`  
Implementation evidence commit: `1757ae811fcf20a412ba8372e9da321a8f704df0`  
Machine-readable evidence: [`architecture/workforce-context-seams.json`](../../architecture/workforce-context-seams.json)  
Manifest SHA-256: `b4c6754e09a3cb4cda19522f2fe3d13270e5f9fdfb480259743f0e312a17d5ae`

## Decision Authority

| Concern | Approval role | Approver | Decision |
|---|---|---|---|
| Context boundary and dependency direction | Architecture Owner | Sukhrob Khaydarov | Approved |
| Teacher lifecycle and compatibility orchestration | Workforce Module Owner | Sukhrob Khaydarov | Approved |
| Portal identity, credentials, roles, grants, sessions | Identity & Access Owner | Sukhrob Khaydarov | Approved |
| Branch validity and defaulting | Organization & Branches Owner | Sukhrob Khaydarov | Approved |
| Active Group blocker/summary | Academic Groups Owner | Sukhrob Khaydarov | Approved |
| Upcoming Lesson blocker/projection | Lesson Delivery Owner | Sukhrob Khaydarov | Approved |
| Audit intent/storage | Audit & History Owner | Sukhrob Khaydarov | Approved |
| Tenant, credential, privacy, fail-closed behavior | Security Owner | Sukhrob Khaydarov | Approved with four blocking risk treatments |

## Decision

Seven cross-context seams are approved for the ten frozen Workforce operations:

1. Teacher portal-access lifecycle;
2. Teacher credential reset and session invalidation;
3. Branch validation and default resolution;
4. active Group archive blocker;
5. upcoming Lesson archive blocker;
6. Teacher directory/profile compatibility composition;
7. Workforce audit intent append.

All participating facts have one authoritative bounded context, a declared consumer/provider direction, an initial synchronous communication mode, a failure policy, a consistency boundary, forbidden shortcuts, and an explicit transition owner.

No runtime source, route, schema, database, business rule, module, public contract, port, event, or user-visible response changed in WF-PRE-07.

## Core Structural Decision

Cross-context Teacher workflows are coordinated by a **Workforce Compatibility Application Coordinator**.

It is an outer application workflow:

- invoked by the existing Workforce HTTP compatibility adapter;
- assembled in Bootstrap from provider public application contracts;
- authoritative for no business data;
- prohibited from importing repositories, infrastructure, private Domain types, database models, or tables;
- responsible only for workflow ordering, compatibility mapping, and composed response construction.

This placement prevents logical module cycles. Academic Groups, Scheduling, and Lesson Delivery continue to consume Workforce Teacher-reference contracts. Reverse reads required only to preserve the legacy Teacher HTTP profile are performed by the outer coordinator, not by Workforce importing those consumer modules.

```text
Workforce HTTP compatibility adapter
                 |
                 v
   Workforce Compatibility Coordinator
      |        |        |        |
      v        v        v        v
 Workforce  Identity  Groups/   Audit
                      Lessons/
                      Org/etc.

Every arrow targets a public application contract.
No arrow targets a repository, table, or private module package.
```

The coordinator is not a new bounded context, shared repository, or authoritative read store.

## Ownership Decisions

| Context | Authoritative facts used by Workforce flows |
|---|---|
| Workforce | Teacher profile/status/reference; Working Hour identity and policy; Teacher-safe projection policy |
| Identity & Access | User identity, username/credentials, roles/permissions, portal status, Branch grants, sessions |
| Organization & Branches | Branch existence, tenant ownership, active validity, main/default Branch |
| Academic Groups | Group lifecycle/assignment, active Group blocker, Group summary |
| Scheduling | Recurring rules and scheduled-workload projection |
| Lesson Delivery | Lesson lifecycle, upcoming/completed projection, upcoming Lesson blocker |
| Student Information | Student lifecycle and Teacher-directory count source facts |
| Audit & History | Audit identity, immutable storage, conventions, retention, and queries |

Equal legacy identifiers do not merge ownership. A Teacher ID may currently equal an Identity User ID, but Teacher and User remain separate context-owned concepts.

## Approved Seam Matrix

| ID | Capability | Providers | Mode | Required failure behavior |
|---|---|---|---|---|
| WF-SEAM-01 | Portal-access lifecycle | Workforce + Identity | Synchronous commands through coordinator | Any required provider failure prevents success; no partial DTO |
| WF-SEAM-02 | Credential reset/session invalidation | Workforce reference + Identity command | Synchronous command | Identity failure prevents success; no credential/session details cross seam |
| WF-SEAM-03 | Branch validity/default | Organization & Branches | Synchronous query before mutation | Invalid/unavailable reference fails closed |
| WF-SEAM-04 | Active Group archive blocker | Academic Groups | Synchronous semantic query | Unknown/unavailable blocker state prevents archive |
| WF-SEAM-05 | Upcoming Lesson archive blocker | Lesson Delivery | Synchronous semantic query | Unknown/unavailable blocker state prevents archive |
| WF-SEAM-06 | Directory/profile composition | Six provider read contracts | Synchronous composed query | Required-provider failure fails whole query; no partial/stale/raw result |
| WF-SEAM-07 | Audit append | Audit & History | Synchronous command for first extraction | Mandatory append failure prevents success acknowledgement |

Synchronous mode is the approved first-extraction contract direction because current HTTP operations require an immediate outcome and no Workforce integration event exists. WF-PRE-12 subsequently reviewed all dependencies and retained every seam synchronously with zero approved event versions.

## Identity Seam

### Portal lifecycle

Create, update-access, access-disable, and archive are compatibility workflows over two authorities:

- Workforce changes Teacher-owned profile/lifecycle facts.
- Identity provisions/updates/deactivates User, Teacher role, Branch grant, credentials, and sessions.
- The coordinator maps provider outcomes to the frozen HTTP result.

Neither provider writes the other's state. The current SQLite transaction spanning `teachers`, `users`, `user_roles`, `user_branch_access`, and `sessions` is legacy debt, not a target transaction boundary.

### Password reset

The `/api/teachers/{teacherId}/reset-password` route remains transport-compatible, but:

- Workforce supplies only the tenant-scoped Teacher reference;
- Identity owns portal-link existence, credential validation/hash/update, and invalidation of every session;
- the coordinator maps missing portal access and validation outcomes to the frozen response.

Workforce must never hash/store passwords or delete sessions.

WF-PRE-11 subsequently approves exact ordering, failure, retry, compensation, and reconciliation: unsafe Identity-crossing variants remain legacy-held and no target write is enabled.

## Organization Seam

Organization & Branches is the sole authority for:

- explicit Branch validity within the active tenant;
- Branch active state;
- main/default Branch selection.

Workforce persists only the resolved `BranchId` reference. It must not query `branches`, infer the main Branch, or treat Identity Branch grants as business-validity evidence.

`WF-SEAM-RISK-01` remains blocking for routing: current Working Hour creation accepts an explicit `branchId` without validation. WF-PRE-08 prohibited direct access, WF-PRE-09 approved target `BRANCH_INVALID` remediation, and WF-PRE-13 approved exact legacy-characterization/target-remediation assertions. Those assertions must pass before Working Hour target routing.

## Archive-Blocker Seams

Teacher archive requires two independent semantic decisions:

- Academic Groups answers whether any active Group assignment blocks archive.
- Lesson Delivery answers whether any non-cancelled upcoming Lesson blocks archive.

Providers return blocker outcomes, not mutable entities or raw rows. Unknown/unavailable state fails closed.

Workforce performs the lifecycle transition only after both decisions permit it. WF-PRE-11 subsequently keeps all archive variants on legacy because no provider reservation/version or approved reconciliation invariant closes the blocker race.

## Read-Composition Seam

The compatibility coordinator composes the Teacher directory/profile from provider-owned reads:

- Workforce: base Teacher and Working Hours;
- Identity: Admin-only portal-access projection;
- Academic Groups: Group assignment/summary facts;
- Scheduling: scheduled workload;
- Lesson Delivery: completed/upcoming Lesson facts;
- Student Information: count source facts.

The result is a non-authoritative compatibility DTO. No distributed snapshot is required; required provider failure fails the whole query instead of returning a partial profile.

Privacy is enforced at the composition boundary:

- Teacher actors receive an actor-safe Workforce projection;
- credential material never crosses the seam;
- raw provider database rows never cross the seam;
- target Teacher self-profile omits Group `monthlyFee`.

`WF-CONTRACT-RISK-01` therefore remains an intentional legacy-versus-target delta, proven separately by `WFT-PROFILE-006` and `WFT-PROFILE-007`.

## Audit Seam

Audit & History owns the append operation and audit record. The coordinator submits the minimum intent after a successful business outcome:

- verified tenant and actor;
- action;
- entity type and stable reference;
- correlation metadata;
- no password, credential hash, session token, or sensitive provider payload.

For first-extraction contract design the append is synchronous and mandatory: failure prevents success acknowledgement. It is not written inside a Workforce transaction.

Current audit calls occur after business persistence, so an append failure can leave committed state with a failed response. WF-PRE-11 classifies this as `committed_unacknowledged` and forbids automatic replay. WF-PRE-12 retains synchronous required acceptance through `WorkforceAuditAppenderPortV1`, explicitly accepts the non-atomic handoff limitation, and requires fault tests/reconciliation under WF-PRE-13/14.

## Operation Disposition

| Operation | Cross-context seams |
|---|---|
| List Teachers | WF-SEAM-06 |
| Get Teacher Profile | WF-SEAM-06 |
| Create Teacher | WF-SEAM-01, WF-SEAM-03, WF-SEAM-07 |
| Update Teacher | WF-SEAM-01, WF-SEAM-03, WF-SEAM-07 |
| Archive Teacher | WF-SEAM-01, WF-SEAM-04, WF-SEAM-05, WF-SEAM-07 |
| Restore Teacher | WF-SEAM-07 |
| Reset Teacher Password | WF-SEAM-02, WF-SEAM-07 |
| List Working Hours | None: Teacher and Working Hour facts are Workforce-owned |
| Create Working Hour | WF-SEAM-03, WF-SEAM-07 |
| Delete Working Hour | WF-SEAM-07 |

Verified actor/tenant context is a mandatory Platform/Identity interface precondition for all operations. It is not reclassified as a Workforce business seam.

## Forbidden Shortcuts

The target design may not:

- write another context's table from Workforce;
- import another context's repository, Infrastructure, private Domain, or database model;
- place credentials, sessions, Branch lifecycle, Groups, Lessons, Students, or audit records inside Workforce aggregates;
- introduce a shared multi-context repository or reproduce `AppRepository`;
- use the compatibility coordinator as an authoritative store;
- return partial composed profiles on provider failure;
- create a synchronous logical cycle between Workforce and its consumers;
- invent an event without a new consumer-evidenced, versioned delivery decision.

No temporary target exception is approved. Frozen legacy SQL remains visible debt only. WF-PRE-08 must record any exact migration-adapter table exception before implementation.

## Blocking Risks

| Risk | Severity | Treatment owner |
|---|---|---|
| WF-SEAM-RISK-01: Working Hour Branch is currently unvalidated | High | WF-PRE-08 direct-access prohibition, WF-PRE-09 target contract, and WF-PRE-13 executable compatibility/remediation specification complete; implementation must pass before activation |
| WF-CONTRACT-RISK-01: Teacher self-profile can expose `monthlyFee` | High | Security-approved target omission and parity evidence |
| WF-SEAM-RISK-02: Teacher/Identity share a legacy transaction | High | WF-PRE-11 keeps unsafe variants legacy-held; no target distributed transaction |
| WF-SEAM-RISK-03: audit can fail after state commits | High | WF-PRE-12 approves synchronous required acceptance; failure remains `committed_unacknowledged`, never auto-retried, and requires WF-PRE-13/14 test/reconciliation evidence |

These risks do not invalidate the seam ownership decision. They block extraction until their assigned gates pass.

## Deferred Decisions

WF-PRE-07 did not pre-empt the ordered decisions below; WF-PRE-08 through WF-PRE-10 have since passed:

- WF-PRE-08 exact table access and temporary compatibility exceptions — completed;
- WF-PRE-09 exact public commands, queries, DTOs, errors, and Teacher-reference contract — completed;
- WF-PRE-10 exact focused ports/adapters — completed;
- WF-PRE-11 transaction ordering, atomicity, compensation, retry, idempotency, and reconciliation — completed;
- WF-PRE-12 event need/version/delivery — completed with zero events and synchronous mandatory Audit acceptance;
- WF-PRE-13 contract/parity/tenant/failure test specification — completed; suite implementation remains per activation gate;
- WF-PRE-14 migration routing and rollback.

## Verification

Repeatable structural verification:

```bash
npm run architecture:workforce-seams
```

The verifier checks the manifest hash, eight evidence fingerprints, eight participating contexts, seven seam decisions, 10/10 operation dispositions, communication/failure/consistency fields, forbidden shortcuts, four blocking risks, follow-on gate ownership, and all affected owner approvals.

The verifier proves decision completeness. It does not prove future public-contract, port, transaction, event, parity, or runtime implementation.

## Approval Result

**WF-PRE-07: PASSED**

Identity, Branch, Group/Lesson blocker, profile composition, and Audit boundaries now have explicit ownership and communication rules without permitting foreign-table access or cyclic module dependencies.

WF-PRE-08 through WF-PRE-14 subsequently approved table access, public contracts, focused ports, consistency, event/Audit, test/parity, and the [migration/rollback runbook](workforce-migration-runbook.md). [WF-PRE-16](workforce-module-readiness-decision.md) then passed ordered extraction entry; WF-EXT-01 is next.
