# Workforce Product Scope Decision

Decision ID: WF-PRE-03
Status: Approved
Decision date: 2026-07-23
Candidate: Workforce (Teacher Management)
Migration state: Preparation only; extraction is not authorized

## Decision Authority

Under [Single-Founder Governance](architecture-governance.md#architecture-governance-model), the following logically distinct concerns were reviewed and approved by the currently assigned authority:

| Concern | Approval role | Approver | Decision |
|---|---|---|---|
| Product capability and non-goals | Product Authority | Sukhrob Khaydarov | Approved |
| Bounded-context alignment | Architecture Owner | Sukhrob Khaydarov | Approved |
| Workforce responsibility | Workforce Module Owner | Sukhrob Khaydarov | Approved |
| Compatibility commitment | Product Authority and Quality Owner | Sukhrob Khaydarov | Approved |
| Identity, tenant, and privacy constraints | Security Reviewer | Sukhrob Khaydarov | Approved as product boundary; detailed seams remain gated |

The temporary lack of segregation of duties is an accepted governance risk already recorded in `architecture-governance.md`. It does not waive any later Module Readiness evidence.

## Decision

The first Workforce extraction is limited to preserving the current Teacher Management product capability:

1. teacher business profile and employment lifecycle;
2. teacher working-hour intervals;
3. stable, tenant-scoped Teacher references for current consumers;
4. coordination of portal-access outcomes through Identity & Access;
5. compatibility of the ten existing Teacher and working-hours HTTP operations.

This is a scope freeze, not a feature proposal. No new product behavior, route, field, schema, integration, client, or migration authority is created by this decision.

## Product Outcomes In Scope

### Teacher business profile and lifecycle

Workforce owns the business meaning and lifecycle of a Teacher:

- stable Teacher identifier inside a tenant;
- name, phone, email, and specialization;
- employment type: `full_time`, `part_time`, or `contract`;
- hire date, workload ceiling, and note;
- active/inactive Workforce status;
- branch reference attached to the Teacher profile;
- create, update, soft archive, and restore behavior.

Archiving remains a soft lifecycle transition. It must remain blocked while current active-group or upcoming-lesson facts say reassignment is required. Those facts are supplied by their owning contexts; Workforce does not acquire Group or Lesson ownership.

### Teacher working hours

Workforce owns Teacher working-hour interval records and their product rules:

- tenant and Teacher scoping;
- weekday values `1` through `7`;
- normalized start and end clock times;
- end time later than start time;
- no overlapping interval for the same Teacher and weekday;
- an active Teacher is required when an interval is created;
- optional branch reference on the interval;
- list, create, and delete behavior.

These intervals are Workforce availability inputs. Schedule assignment, schedule conflict policy, and concrete lesson timing remain Scheduling and Lesson Delivery concerns.

### Portal-access coordination

The existing product surface may request these outcomes while operating on a Teacher:

- optionally provision portal access during Teacher creation;
- enable or disable portal access during Teacher update;
- deactivate access and invalidate sessions when a Teacher is archived;
- keep portal access separately controlled when a Teacher is restored;
- reset a configured Teacher portal password and invalidate existing sessions.

Workforce owns only the request and business coordination from the Teacher workflow. Identity & Access owns users, credentials, password hashing, roles, branch-access grants, sessions, authentication, and the execution semantics of those operations. WF-PRE-07 through WF-PRE-12 subsequently approved seam direction, public workflow contracts, focused provider ports, consistency/route-admission behavior, and synchronous no-event/Audit delivery disposition.

### Role-sensitive access

The current externally observable access boundary is in scope for compatibility:

- an Admin can manage Teacher profiles and lifecycle within the active tenant;
- a Teacher can list only their own Teacher record;
- a Teacher can retrieve only their own Teacher profile;
- Teacher-safe responses omit credential-management fields;
- a Teacher can list only their own working hours;
- create/delete working-hour authorization remains exactly as implemented and documented until contract freeze approves a change.

This decision does not broaden the Teacher role beyond the current BRD principle that a Teacher is self-scoped.

## Ten Current Operations Accounted For

All current Teacher/working-hours operations are included as compatibility obligations. The later contract-freeze gate must inventory exact request/response/error details; this product decision does not rename or redesign them.

| # | Product operation | Existing HTTP entrypoint | Scope decision | Ownership boundary |
|---:|---|---|---|---|
| 1 | List Teachers | `GET /api/teachers` | In scope | Workforce query; foreign projection facts must be composed |
| 2 | Get Teacher Profile | `GET /api/teachers/{teacherId}` | In scope | Workforce profile plus composed Group/Lesson facts |
| 3 | Create Teacher | `POST /api/teachers` | In scope | Workforce profile; Identity provisioning is delegated |
| 4 | Update Teacher | `PUT /api/teachers/{teacherId}` | In scope | Workforce profile; Identity access changes are delegated |
| 5 | Archive Teacher | `DELETE /api/teachers/{teacherId}` | In scope | Workforce lifecycle; blockers and Identity effects are delegated |
| 6 | Restore Teacher | `POST /api/teachers/{teacherId}/restore` | In scope | Workforce lifecycle; access remains independently controlled |
| 7 | Reset Teacher Password | `POST /api/teachers/{teacherId}/reset-password` | In scope as a compatibility facade | Credential and session behavior belongs to Identity & Access |
| 8 | List Working Hours | `GET /api/teacher-working-hours` | In scope | Workforce-owned interval query |
| 9 | Create Working Hour | `POST /api/teacher-working-hours` | In scope | Workforce-owned interval mutation |
| 10 | Delete Working Hour | `DELETE /api/teacher-working-hours/{workingHourId}` | In scope | Workforce-owned interval mutation |

No current operation is excluded. This table satisfies product-operation accounting only; WF-PRE-05 and WF-PRE-06 still own exact contract and behavior-matrix approval.

## Data and Projection Boundary

### Workforce-owned authoritative data

| Data | Product meaning |
|---|---|
| `teachers` | Teacher business profile, employment attributes, and active/inactive lifecycle |
| `teacher_working_hours` | Teacher availability intervals |

`tenant_id` scopes Workforce records but does not transfer Tenant ownership. `branch_id` is a reference to an Organization-owned Branch, not shared Branch ownership.

### Compatibility projections, not Workforce-owned facts

Current Teacher responses contain or compose facts such as:

- username, access status, and whether access exists;
- active group and student counts;
- scheduled weekly minutes and workload percentage;
- completed and upcoming lessons;
- Group summaries and Teacher assignment information.

Those response shapes remain compatibility obligations during migration, but their source facts remain owned by Identity & Access, Academic Groups, Student Information, Scheduling, and Lesson Delivery. A response field does not transfer write authority or table ownership to Workforce.

### Non-owned data and capabilities

| Data/capability | Owning context | Workforce relationship |
|---|---|---|
| Tenant and tenant lifecycle | Platform Administration & Tenancy | Verified tenant context/reference only |
| Users, credentials, roles, permissions, sessions, branch access | Identity & Access | Portal-access coordination contract |
| Branch identity, validity, and default branch | Organization & Branches | Reference/validation contract |
| Group identity and Teacher assignment/history | Academic Groups | Consumer and archive-blocker/profile projection |
| Schedule assignment, recurring workload, and conflicts | Scheduling | Consumer and workload/availability projection |
| Lesson occurrence and Teacher snapshot/history | Lesson Delivery | Consumer and profile/archive-blocker projection |
| Student roster and status | Student Information | Count/projection only |
| Attendance facts and marking workflow | Attendance | Stable Teacher reference consumer |
| Teacher rate rules, accruals, settlement, and payroll | Lesson Finance & Payroll | Stable Teacher reference consumer |
| Audit records and retention | Audit & History | Audit intent only |

Direct target-module access to these owners' private tables or repositories is not approved.

## Product Invariants and Compatibility Commitments

The first extraction must preserve these observable outcomes:

- every Teacher and working-hour read/write is tenant-scoped;
- a Teacher user cannot read another Teacher profile or directory entry;
- Teacher-facing DTOs omit `username` and `accessStatus`;
- Teacher identity remains stable across update, archive, and restore;
- archive is soft and is rejected while active groups or upcoming lessons remain;
- archive disables configured portal access and invalidates existing sessions;
- restore reactivates the Teacher business profile without implicitly enabling portal access;
- portal password reset requires an existing portal identity and invalidates existing sessions;
- username conflicts and invalid branch/access/profile inputs retain compatible failure behavior;
- working-hour intervals require valid Teacher, lifecycle, weekday, and time values;
- overlapping working-hour intervals retain conflict behavior;
- historical lesson Teacher meaning is not rewritten by Workforce lifecycle changes;
- current unversioned `/api` routes remain compatible while ADR-008 is Proposed.

Exact payload fields, ordering, status codes, error texts, permissions, idempotency expectations, and transaction semantics are intentionally delegated to WF-PRE-05 through WF-PRE-11.

## Explicit Non-Goals

The following are explicitly outside WF-PRE-03 and the first Workforce source extraction unless a later approved scope change says otherwise:

1. Adding, removing, renaming, or versioning public HTTP routes or supported fields.
2. Introducing a new Teacher feature, workflow, lifecycle state, role, permission model, client, dashboard, or UI redesign.
3. Migrating the root Teacher frontend or changing user-visible navigation.
4. Moving Workforce authority from SQLite to PostgreSQL, changing schemas, backfilling data, or changing tenancy enforcement.
5. Owning or directly implementing users, credentials, password algorithms, roles, permissions, sessions, authentication, or branch-access grants.
6. Owning Branch records, tenant settings, or organization hierarchy.
7. Owning Group records, Teacher assignment/history, capacity, subjects, or levels.
8. Owning schedule recurrence, Teacher assignment, room/group/Teacher conflict policy, or lesson generation.
9. Owning Lesson records, attendance, homework, Teacher snapshots, or historical lesson correction.
10. Owning students, guardians, enrollment, subscriptions, billing, payments, debt, rate rules, accruals, payroll, or accounting.
11. Owning the audit log store, retention policy, or audit-query product.
12. Adding Telegram, SMS, email, payment, storage, video, or other third-party provider integration to Workforce.
13. Inventing domain/integration events without an evidenced consumer and an approved WF-PRE-12 decision.
14. Creating an independently deployed Workforce service, separate database, or distributed transaction.
15. Adding mobile-, parent-, or partner-specific Teacher contracts.
16. Deciding enterprise SLOs, capacity, event retention, or general reporting platform scope.
17. Removing the legacy path, changing source authority, starting a canary, or executing any extraction item.

These are first-extraction non-goals, not permanent product prohibitions. Moving one into scope requires the change control below.

## Scope Change Control

A proposed change is outside this approved scope when it adds or changes any of the following:

- a product operation, workflow, role, or lifecycle state;
- an externally observable field, error, authorization rule, or client commitment;
- an owned table or authoritative writer;
- a direct dependency, provider, event, or cross-context responsibility;
- a schema, source-of-truth, deployment, or supported-client decision.

Such a change must:

1. identify the affected scope item and consumer;
2. be classified under `architecture-governance.md`;
3. receive Product Authority and Architecture Owner approval;
4. receive affected Module Owner and specialist approval;
5. update this decision or supersede it with an ADR when the change is architectural;
6. update contracts, tests, backlog, exit criteria, and rollback evidence before implementation.

Implementation cannot silently expand Workforce because the legacy repository happens to join or write another context's tables.

## Evidence Reviewed

- [`Dono_02_Business_Requirements.md`](../../Dono_02_Business_Requirements.md), especially BR-02 through BR-04 and the v1 out-of-scope list.
- [`bounded-contexts.md`](bounded-contexts.md#4-workforce).
- [`workforce-module-readiness.md`](workforce-module-readiness.md).
- `src/http/api.js` Teacher and working-hours routes.
- `src/services/appService.js` Teacher and working-hours behavior.
- `src/repositories/appRepository.js` Teacher persistence, projections, Identity coordination, and working-hour persistence.
- `src/db/schema.js` `teachers` and `teacher_working_hours`.
- `docs/openapi.yaml` Teacher and working-hours contracts.
- Existing Teacher Management characterization in `scripts/test-backend-logic.js`.

No repository evidence supports expanding the first extraction beyond the approved scope.

## Approval Result

**WF-PRE-03: PASSED**

Teacher profile/lifecycle, working hours, portal-access coordination, ten current operations, owned/non-owned responsibilities, compatibility commitments, and explicit non-goals are approved.

This result closes only WF-PRE-03. Workforce remains **NOT READY** for migration.

Post-decision status: WF-PRE-04 and WF-PRE-05 subsequently passed on 2026-07-23; WF-PRE-06 through WF-PRE-13 passed on 2026-07-24 through the approved behavior, seam, table-access, public-Application, focused-port, [consistency](workforce-transaction-consistency.md), [event/Audit](workforce-event-requirements.md), and [test/parity](workforce-test-parity-plan.md) decisions. The current next ordered prerequisite is WF-PRE-14.
