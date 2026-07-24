# Workforce Focused Port Decision

Decision ID: WF-PRE-10

Status: Approved

Decision date: 2026-07-24

Catalog version: `1.0.0`

## Decision

The first Workforce extraction uses 18 focused outbound ports:

- five Workforce-owned persistence/base-read ports;
- eleven provider anti-corruption ports, each bound to one provider capability;
- two deterministic system ports for clock and Workforce-owned identifiers.

The authoritative machine catalog is [workforce-focused-ports.json](../../architecture/workforce-focused-ports.json), SHA-256:

`7ea1b5bb22bf8d2db80050c1f90ab40cf3360f53b48e81078ac40e139c2ba231`

It fixes exact method signatures, contexts, inputs/results, provider authority, seam linkage, allowed direct tables, operation closure, DTO composition, adapter placement, negative boundaries, and approvals. Run:

```bash
npm run architecture:workforce-ports
```

No adapter, module source, transaction, event, route, schema, table, or runtime behavior is created or changed by this decision.

## Port Design Rules

The use-case consumer owns each outbound port interface. A provider bounded context owns its public Application language and data. An anti-corruption adapter translates the consumer-owned port to that provider contract; it does not import the provider's repository, Infrastructure, private Domain, model, or table.

Each port represents one of:

- one Workforce aggregate persistence boundary;
- one Workforce-owned base read model;
- one provider-owned semantic command/query capability;
- one deterministic system capability.

Provider projection queries are explicit and batch-keyed by unique `teacherIds` or `groupIds`. No generic filters, provider entities, lazy collections, SQL, or arbitrary database access cross a port.

Unknown or unavailable provider state fails closed. Missing keyed projection data cannot be silently converted to a zero/default complete DTO.

## Verified Contexts

`WorkforcePersistenceContextV1` contains only `tenantId` and `correlationId`. It is used by owned repositories/query adapters and cannot carry HTTP, actor, role, credential, session, or provider records.

`WorkforcePortCallContextV1` contains only `tenantId`, the fixed caller `workforce-compatibility-coordinator`, and `correlationId`. The anti-corruption adapter authenticates the service caller to its provider. A human session or credential is never reused as service identity.

## Workforce-Owned Ports

| ID | Port | Methods | Direct tables |
|---|---|---|---|
| WF-PORT-OWN-01 | `TeacherAggregateRepositoryV1` | `findById`, `insert`, `replaceProfile`, `setStatus` | `teachers` |
| WF-PORT-OWN-02 | `TeacherWorkingHourRepositoryV1` | `list`, `findById`, `findOverlap`, `insert`, `deleteById` | `teacher_working_hours` |
| WF-PORT-OWN-03 | `TeacherDirectoryBaseQueryV1` | `listTenantBase` | `teachers` |
| WF-PORT-OWN-04 | `TeacherProfileBaseQueryV1` | `getBaseProfile` | `teachers` |
| WF-PORT-OWN-05 | `TeacherReferenceQueryV1` | `getReference` | `teachers` |

`TeacherAggregateSnapshotV1` contains only the 13 Workforce-owned Teacher facts. It excludes portal access, workload, Groups, Students, Lessons, and Audit.

`TeacherWorkingHourRepositoryV1` owns interval persistence and overlap lookup only. It cannot resolve Branches, mutate Teacher lifecycle, append Audit, or perform Teacher joins. For list/profile, `teacherName` is composed in Application memory from a tenant-scoped Teacher base; create uses the already-loaded Teacher reference. Delete preserves the frozen empty `teacherName` quirk without an extra lookup.

The three owned queries are deliberately separate:

- directory base preserves the approved list ordering;
- profile base retrieves one Teacher without foreign joins;
- reference query emits the five-field public `TeacherReferenceV1` only.

This separation prevents a “read everything” repository from becoming a new `AppRepository`.

## Provider Anti-Corruption Ports

| ID | Port | Provider | Exact purpose |
|---|---|---|---|
| WF-PORT-PROV-01 | `TeacherPortalLifecycleCommandPortV1` | Identity & Access | Provision, apply access intent, disable |
| WF-PORT-PROV-02 | `TeacherCredentialResetCommandPortV1` | Identity & Access | Replace credential and invalidate sessions |
| WF-PORT-PROV-03 | `TeacherPortalAccessProjectionPortV1` | Identity & Access | Batch safe access projection |
| WF-PORT-PROV-04 | `BranchReferenceResolverPortV1` | Organization & Branches | Resolve active explicit/main/null Branch reference |
| WF-PORT-PROV-05 | `ActiveGroupArchiveBlockerPortV1` | Academic Groups | Semantic active-assignment blocker decision |
| WF-PORT-PROV-06 | `TeacherGroupProjectionPortV1` | Academic Groups | Teacher Group counts and Group base profile |
| WF-PORT-PROV-07 | `TeacherScheduleProjectionPortV1` | Scheduling | Teacher workload and Group schedule summaries |
| WF-PORT-PROV-08 | `UpcomingLessonArchiveBlockerPortV1` | Lesson Delivery | Semantic upcoming-Lesson blocker decision |
| WF-PORT-PROV-09 | `TeacherLessonProjectionPortV1` | Lesson Delivery | Completed counts, upcoming profile Lessons, Group Lesson metrics |
| WF-PORT-PROV-10 | `TeacherStudentCountProjectionPortV1` | Student Information | Teacher/Group active Student counts |
| WF-PORT-PROV-11 | `WorkforceAuditAppenderPortV1` | Audit & History | Append minimum audit intent |

All provider ports have an empty direct-table allowlist. Their `providerAuthorityTables` are evidence of provider ownership, not permission for Workforce SQL.

### Identity isolation

Portal lifecycle and credential reset are separate because they have different seams, secret handling, and consistency obligations. Neither returns password hashes, session IDs, role rows, Branch grants, or mutable User entities.

The read port returns only `teacherId`, `hasAccess`, `username`, and `accessStatus`. It cannot query arbitrary Users.

### Branch resolution

`resolveActive` receives `requestedBranchId|null` plus the explicit defaulting intent. It returns only:

- `branchId`;
- resolution source: `explicit`, `main`, or `none`.

An invalid explicit reference yields `BRANCH_REFERENCE_INVALID`, mapped by the coordinator to `BRANCH_INVALID`. Workforce never reads the Branch table or infers main Branch itself.

### Blockers versus projections

Archive blockers are independent semantic ports returning only `{ teacherId, blocked }`. They do not return raw Group/Lesson rows. This prevents the coordinator from reimplementing Group assignment or Lesson lifecycle meaning.

Profile/directory projections remain separate read capabilities. Every returned fragment is keyed and immutable; provider mutations are forbidden.

### Audit intent

The audit input contains only actor ID, action, entity type/reference, and correlation ID. Tenant comes from the verified port context. Password, username, contact fields, request body, mutable entity, provider response, and credential data are forbidden.

Audit & History owns record ID, timestamp, retention, query policy, and storage.

## System Ports

| ID | Port | Method | Scope |
|---|---|---|---|
| WF-PORT-SYS-01 | `WorkforceClockPortV1` | `now` | UTC timestamp for deterministic Workforce-owned creation |
| WF-PORT-SYS-02 | `WorkforceIdGeneratorPortV1` | `nextId` | Teacher or Teacher Working Hour ID only |

The clock does not own Lesson “upcoming” date semantics; Lesson Delivery owns that decision. The ID generator cannot create provider or Audit IDs.

## Application-to-Port Closure

| Contract | Focused port purpose |
|---|---|
| WF-APP-01 List Teachers | Directory base plus Identity, Group, Scheduling, Lesson, Student batch projections |
| WF-APP-02 Get Profile | Profile base, Working Hours, and the five provider projections required for the exact profile |
| WF-APP-03 Create Teacher | Teacher persistence, portal provision, Branch resolution, complete return projection, Audit, clock, ID |
| WF-APP-04 Update Teacher | Teacher persistence, portal access change, Branch resolution, complete return projection, Audit |
| WF-APP-05 Archive Teacher | Teacher persistence, Group/Lesson semantic blockers, portal disable, complete return projection, Audit |
| WF-APP-06 Restore Teacher | Teacher persistence, complete return projection, Audit |
| WF-APP-07 Reset Password | Minimal Teacher reference, Identity credential reset, Audit |
| WF-APP-08 List Working Hours | Working Hour repository plus Teacher directory base for in-memory `teacherName` composition |
| WF-APP-09 Create Working Hour | Teacher reference/status, Branch resolution, Working Hour repository, Audit, clock, ID |
| WF-APP-10 Delete Working Hour | Working Hour repository and Audit |
| WF-REF-01 Teacher Reference | Minimal owned Teacher reference query only |

The machine manifest fixes the exact ordered port IDs for every row. A required PRE-07 seam cannot disappear from the operation closure.

## Exact Compatibility Composition

`TeacherAdminViewV1` is composed from:

- Workforce Teacher aggregate facts;
- Identity access projection;
- Academic Groups count;
- Scheduling weekly minutes;
- Lesson completed count;
- Student active count;
- coordinator-derived `workloadPercent`.

`TeacherProfileGroupAdminViewV1` is composed from:

- Academic Groups base fields;
- Scheduling summary;
- Lesson metrics;
- Student count;
- coordinator-derived `occupancyPercent`;
- the frozen compatibility `attendanceRate = 0`.

Teacher self removes `monthlyFee` only after complete composition. `TeacherProfileLessonViewV1` is an immutable Lesson Delivery compatibility projection. The verifier proves these fragments equal the exact PRE-09 output field sets without overlap or omission.

Every batch count/access port returns exactly one keyed row for every requested ID, including explicit zero or not-granted values. Missing/duplicate keys fail composition. Group Scheduling/Lesson fragment values remain bound to frozen Teacher-profile compatibility semantics. WF-PRE-13 subsequently approves exact keyed-completeness and governed-delta assertions; they must pass before activation.

## Adapter Plan

Nine future adapter groups implement all 18 ports exactly once:

- one Workforce SQLite adapter group, with direct access limited to `teachers` and `teacher_working_hours`;
- one anti-corruption adapter group per provider context;
- one Bootstrap system adapter group for clock and IDs.

This is a placement/contract plan, not implementation authorization. WF-PRE-13 subsequently specifies adapter contract suites, failure injection, and two-tenant assertions for all nine groups; passing implementations remain required before activation.

## Broad-Port Prohibition

The following are prohibited:

- a generic repository/query/command, generic CRUD, arbitrary filter, raw SQL/row, table/database access, or `execute` port;
- a port claiming multiple provider authorities;
- a Workforce adapter direct allowlist containing any foreign table;
- credentials, hashes, sessions, roles, database rows, or mutable provider entities in results;
- Unit of Work, cross-context transaction, retry executor, event bus, outbox, or migration-router ports under WF-PRE-10.

There are zero temporary port exceptions.

## Explicit Deferrals

WF-PRE-10 does not approve:

- local/cross-provider transaction boundaries, ordering, compensation, retry, reconciliation, and Unit-of-Work disposition — subsequently approved by [WF-PRE-11](workforce-transaction-consistency.md);
- events, versions, publisher/subscriber, and Audit delivery — subsequently approved by [WF-PRE-12](workforce-event-requirements.md) with zero event contracts and synchronous mandatory Audit acceptance;
- executable tests for every adapter/method, two-tenant isolation, parity, privacy/Branch deltas, and failure injection — subsequently specified by [WF-PRE-13](workforce-test-parity-plan.md);
- adapter activation, route cohort, thresholds, rollback, observation, or retirement — WF-PRE-14.

## Approval

Approved on 2026-07-24 under Single-Founder Governance by Sukhrob Khaydarov as Architecture Owner, Workforce Module Owner, Data Owner, affected provider owners, Security Owner, and Quality Owner.

## Gate Result

**WF-PRE-10: PASSED**

The exact focused port catalog covers all 11 PRE-09 Application contracts, both Workforce-owned tables, every foreign direct-access replacement, all seven PRE-07 seams, and nine future adapter groups without reproducing `AppRepository`. Module Readiness remains Failed and no extraction is authorized.

WF-PRE-11 through WF-PRE-14 subsequently approved consistency, event/Audit delivery, test/parity, and the [migration/rollback runbook](workforce-migration-runbook.md). The next ordered prerequisite is WF-PRE-16.
