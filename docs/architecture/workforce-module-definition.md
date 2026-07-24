# Workforce Module Definition

Definition ID: WF-PRE-04
Definition status: Approved and complete
Implementation status: Legacy; target module not created
Module Readiness: Failed; later prerequisites remain blocking
Last reviewed: 2026-07-23

This document instantiates every mandatory section of [module-template.md](module-template.md). It distinguishes approved scope, current legacy evidence, target constraints, and decisions deliberately reserved for later Workforce preparation gates.

## Module Metadata

| Field | Required value |
|---|---|
| Module name | Workforce |
| Bounded context | Workforce |
| Status | Legacy |
| Module Owner | Sukhrob Khaydarov |
| Product Authority | Sukhrob Khaydarov |
| Current source location | `src/services/appService.js`, `src/repositories/appRepository.js`, `src/http/api.js`, and `src/db/schema.js` |
| Approved future source location | `src/modules/workforce/`, created only after migration authorization |
| Last reviewed | 2026-07-23 |
| Related decisions | [ADR-001](adrs/ADR-001-target-architecture.md), [ADR-004](adrs/ADR-004-migration-strategy.md), [ADR-005](adrs/ADR-005-bounded-context-strategy.md), [ADR-006](adrs/ADR-006-dependency-rule.md), [ADR-007](adrs/ADR-007-shared-kernel.md), [ADR-008](adrs/ADR-008-api-versioning.md), and [WF-PRE-03](workforce-product-scope.md) |

`Legacy` means the capability is operational but has no compliant Workforce module boundary. A documented future path is not evidence that migration started.

## Purpose

Workforce manages a tenant's Teacher business profiles, employment lifecycle, working-hour availability, and coordination of Teacher portal-access outcomes. Tenant Admins manage Teachers; authenticated Teachers receive only their own safe profile and working-hours view. Academic Groups, Scheduling, Lesson Delivery, Attendance, and Lesson Finance consume stable Teacher references.

The capability exists in the current Teacher HTTP routes, `AppService` Teacher/working-hours methods, `AppRepository` Teacher persistence/projections, the `teachers` and `teacher_working_hours` tables, OpenAPI, and the Teacher Management backend scenario.

## Responsibilities

### Owns

- Teacher business identity and tenant-scoped stable reference.
- Teacher name, contact data, specialization, employment type, hire date, workload ceiling, note, and active/inactive status.
- Teacher create, update, soft archive, and restore lifecycle.
- Teacher working-hour interval identity, weekday/time validity, and non-overlap policy.
- The Workforce side of portal-access coordination without owning Identity state.
- Teacher-safe privacy projection rules at the Workforce application boundary.
- Workforce-owned persistence intent for `teachers` and `teacher_working_hours`.

### Does not own

- Tenant lifecycle or settings; owned by Platform Administration & Tenancy.
- Credentials, password hashing, users, roles, permissions, sessions, authentication, or branch-access grants; owned by Identity & Access.
- Branch lifecycle, defaulting authority, or organization hierarchy; owned by Organization & Branches.
- Group lifecycle or Teacher assignment/history; owned by Academic Groups.
- Schedule assignment, recurring workload, or conflict policy; owned by Scheduling.
- Lesson occurrences, Teacher snapshots, homework, or lesson history; owned by Lesson Delivery.
- Student records or roster state; owned by Student Information.
- Attendance facts or attendance workflows; owned by Attendance.
- Teacher rate rules, accruals, settlements, or payroll; owned by Lesson Finance & Payroll.
- Audit-log storage, retention, or queries; owned by Audit & History.
- Telegram or any other external-provider communication.

## Bounded Context

- **Context name:** Workforce.
- **Ubiquitous language:**
  - **Teacher:** a tenant-scoped employed or contracted educator business profile; not an authentication account.
  - **Teacher status:** Workforce lifecycle state, currently `active` or `inactive`.
  - **Employment type:** `full_time`, `part_time`, or `contract`.
  - **Workload ceiling:** maximum intended weekly minutes; it is not scheduled workload.
  - **Working hour:** one weekday clock interval during which an active Teacher is available.
  - **Portal access:** Identity-owned ability to authenticate as a Teacher.
  - **Portal-access coordination:** Workforce request for an Identity outcome while preserving separate ownership.
  - **Teacher reference:** stable Teacher ID plus the minimum approved status/display facts a consumer needs.
  - **Profile projection:** a read result composed from Workforce facts and explicitly contracted foreign facts.
- **Upstream contexts:** Platform Administration & Tenancy for tenant context; Identity & Access for portal outcomes; Organization & Branches for Branch validity/default; Academic Groups and Lesson Delivery for archive blockers/profile facts; Scheduling and Student Information for workload/count projections; Audit & History for audit recording.
- **Downstream contexts:** Academic Groups, Scheduling, Lesson Delivery, Attendance, Lesson Finance & Payroll, and Reporting consume Teacher references or approved projections.
- **Context-map pattern:** customer/supplier for owned provider contracts; anti-corruption adapters at provider boundaries; the approved `TeacherReferenceV1` published language; an outer compatibility Application coordinator for cross-context lifecycle/profile composition.
- **Boundary uncertainties:** [WF-PRE-07](workforce-bounded-context-seams.md) fixes context authority/direction, [WF-PRE-08](workforce-table-ownership-access.md) fixes exact table access/transition, [WF-PRE-09](workforce-public-application-contracts.md) fixes public Application signatures/DTOs/errors, and [WF-PRE-10](workforce-focused-ports.md) fixes focused port/adapter boundaries. Consistency/compensation, events, tests, and migration routing remain WF-PRE-11 through WF-PRE-14.

No target code module currently exists. The bounded context is implemented across legacy technical layers and cross-context SQL. The future directory will implement this bounded context; the directory itself will not define or expand it.

## Public API

The table accounts for required application capabilities. WF-PRE-05 froze the legacy transport contract in the [Workforce Contract Freeze](workforce-contract-freeze.md); WF-PRE-09 subsequently approved exact Application method signatures, DTOs, errors, authorization contexts, and idempotency in [Workforce Public Application Contracts](workforce-public-application-contracts.md).

| Operation/contract | Type | Input | Output | Authorization | Compatibility owner |
|---|---|---|---|---|---|
| List Teachers | Query | Verified actor/tenant context | Role-safe Teacher summaries | Admin: tenant directory; Teacher: self only | Workforce Module Owner |
| Get Teacher Profile | Query | Actor context and Teacher ID | Teacher profile plus approved composed facts | Admin: tenant Teacher; Teacher: self only | Workforce Module Owner |
| Create Teacher | Command | Actor context and Teacher profile/access intent | Created Teacher summary | Admin only | Workforce Module Owner |
| Update Teacher | Command | Actor context, Teacher ID, profile/access intent | Updated Teacher summary | Admin only | Workforce Module Owner |
| Archive Teacher | Command | Actor context and Teacher ID | Inactive Teacher summary | Admin only; blockers apply | Workforce Module Owner |
| Restore Teacher | Command | Actor context and Teacher ID | Active Teacher summary | Admin only | Workforce Module Owner |
| Reset Teacher Password | Facade | Actor context, Teacher ID, new credential intent | Success acknowledgement | Admin only | Workforce for route compatibility; Identity for credential semantics |
| List Working Hours | Query | Verified actor/tenant context | Working-hour summaries | Admin: tenant; Teacher: self only | Workforce Module Owner |
| Create Working Hour | Command | Actor context, Teacher ID, weekday/time/Branch reference | Created working-hour summary | Current `lessons.manage` permission | Workforce Module Owner |
| Delete Working Hour | Command | Actor context and Working Hour ID | Deleted working-hour summary | Admin only | Workforce Module Owner |
| Teacher Reference/Status | Query contract | Tenant and Teacher ID | Minimum approved Teacher reference/status | Approved in-process consumers only | Workforce Module Owner |

WF-PRE-09 defines the sole downstream contract as `TeacherReferenceApplicationV1.getTeacherReference`, returning exactly `tenantId`, `teacherId`, `displayName`, `status`, and `branchId`. In the target source tree, only the declared Workforce public facade/contract package may be imported by another module. `domain/`, `application/`, `infrastructure/`, `http/`, adapter, mapper, and repository implementation packages are private.

## Use Cases

This matrix defines current product intent. WF-PRE-06 subsequently expanded it into the approved [Workforce Behavior and Test Matrix](workforce-behavior-matrix.md); WF-PRE-11 must still approve target transaction and idempotency semantics.

| Use case | Actor/trigger | Preconditions | Outcome | Failure cases | Current transaction/idempotency |
|---|---|---|---|---|---|
| List Teachers | Admin or Teacher | Authenticated, active tenant | Tenant directory or safe self row | Unauthorized/tenant failure | Read-only; no idempotency concern |
| Get Teacher Profile | Admin or Teacher | Teacher exists in tenant; Teacher actor requests self | Profile, hours, and composed facts | `403` other-profile; `404` missing | Read-only composed query |
| Create Teacher | Admin | Valid profile, Branch reference, access intent, unique username when access requested | Active Teacher; optional portal outcome | Validation; `409` username; Identity/infrastructure failure | Current SQLite transaction spans Teacher and Identity; no request idempotency |
| Update Teacher | Admin | Existing Teacher; valid profile/access transition | Updated profile and coordinated access state | `404`; validation; `409` username; Identity failure | Current SQLite transaction spans Teacher and Identity; no request idempotency |
| Archive Teacher | Admin | Existing Teacher; zero active groups and upcoming lessons | Teacher inactive; portal disabled/sessions invalidated | `404`; `409` blocker; Identity/infrastructure failure | Blocker reads precede current cross-context SQLite transaction |
| Restore Teacher | Admin | Existing inactive Teacher | Teacher active; portal state unchanged | `404`; persistence failure | Current single Workforce-table update; retry outcome not specified |
| Reset Teacher Password | Admin | Configured portal identity; credential length valid | Credential replaced; sessions invalidated | Validation; `404` no portal access; Identity failure | Current Identity update then session delete without explicit transaction; no idempotency |
| List Working Hours | Admin or Teacher | Authenticated active tenant | Tenant intervals or self intervals | Unauthorized/tenant failure | Read-only |
| Create Working Hour | Authorized actor | Existing active Teacher; valid weekday/time; no overlap | New interval | `404` Teacher; validation; `409` overlap; persistence failure | Check then insert; concurrency/idempotency not specified |
| Delete Working Hour | Admin | Interval exists in tenant | Interval removed and returned | `404`; persistence failure | Read then delete; no explicit transaction/idempotency |

## Entities

These are approved target domain meanings; implementation and persistence-independent tests do not yet exist.

| Entity/Aggregate Root | Identity | Lifecycle | Owned invariants | Persistence independence evidence |
|---|---|---|---|---|
| **Teacher (Aggregate Root)** | Tenant-scoped `TeacherId` | Created active; updated; archived to inactive; restored to active | Valid employment type/status; workload ceiling 60–4,800 minutes; required name; stable identity; portal state is not embedded | Target definition only; Domain tests required by WF-PRE-13 |
| **TeacherWorkingHour (Aggregate Root)** | Tenant-scoped `WorkingHourId`, referencing `TeacherId` | Created and deleted | Weekday 1–7; normalized start/end; end after start; no overlap for same Teacher/weekday; creation only for active Teacher | Target definition only; Domain and repository contract tests required by WF-PRE-13 |

`BranchId`, tenant identity, Group IDs, Lesson IDs, User IDs, and consumer references are external identities, not Workforce entities.

## Value Objects

| Value object | Meaning | Validity/equality rules | Serialization boundary |
|---|---|---|---|
| `TeacherId` | Stable Workforce identity | Non-empty opaque string; equal by exact value within tenant | HTTP/persistence adapters map strings |
| `WorkingHourId` | Stable interval identity | Non-empty opaque string; equal by exact value within tenant | HTTP/persistence adapters map strings |
| `TeacherName` | Required display/business name | Trimmed, non-empty; exact maximum remains contract decision | Transport/persistence mapper |
| `EmploymentType` | Employment relationship | Exactly `full_time`, `part_time`, or `contract` | String at adapters |
| `TeacherStatus` | Workforce lifecycle state | Exactly `active` or `inactive`; transitions through lifecycle use cases | String at adapters |
| `WorkloadCeiling` | Maximum weekly workload | Integer minutes from 60 through 4,800 | Legacy HTTP maps `maxWeeklyHours`; persistence uses minutes |
| `Weekday` | Weekly availability day | Integer-domain meaning 1–7; legacy serialization is string | Adapter maps legacy string |
| `ClockInterval` | One local weekday time interval | Normalized `HH:mm`; start before end; equal by start/end | Adapter maps two legacy fields |
| `BranchReference` | Organization-owned Branch reference | Empty/default or opaque Branch ID according to approved Organization contract | Application boundary and persistence mapper |

Tenant identity is supplied in verified Application context and is not admitted to Shared Kernel by this definition.

## Domain Services

| Domain service | Domain policy | Why behavior does not belong to one entity/value object | Dependencies |
|---|---|---|---|
| `WorkingHourOverlapPolicy` | Candidate interval must not intersect another interval for the same Teacher and weekday | The rule compares a collection of intervals rather than one interval alone | `ClockInterval` and existing interval values only |

Archive blocker evaluation and multi-context profile composition are outer Application orchestration under [WF-PRE-07](workforce-bounded-context-seams.md), not Workforce Domain services, because their facts belong to other contexts.

## Repositories

WF-PRE-10 approves the exact port division and signatures in [Workforce Focused Ports](workforce-focused-ports.md); WF-PRE-13 still supplies executable contract suites.

| Port | Layer owning port | Aggregate/query | Required operations | Implementing adapters | Contract tests |
|---|---|---|---|---|---|
| `TeacherAggregateRepositoryV1` | Domain | Teacher aggregate | `findById`, `insert`, `replaceProfile`, `setStatus` | Target adapter absent; direct allowlist `teachers` | Missing; WF-PRE-13 |
| `TeacherWorkingHourRepositoryV1` | Domain | TeacherWorkingHour aggregate | `list`, `findById`, `findOverlap`, `insert`, `deleteById` | Target adapter absent; direct allowlist `teacher_working_hours` | Missing; WF-PRE-13 |
| `TeacherDirectoryBaseQueryV1` | Application | Workforce-owned Teacher facts | `listTenantBase`; outer coordinator composes keyed foreign projections | Target adapter absent; direct allowlist `teachers` | Missing; WF-PRE-13 |
| `TeacherProfileBaseQueryV1` | Application | Workforce-owned Teacher facts | `getBaseProfile`; Working Hours and provider facts stay separate | Target adapter absent; direct allowlist `teachers` | Missing; WF-PRE-13 |
| `TeacherReferenceQueryV1` | Application | Five-field Teacher reference | `getReference` for internal/public reference use | Target adapter absent; direct allowlist `teachers` | Missing; WF-PRE-13 |

Identity, Branch, blocker/projection, Audit, clock, and ID capabilities are approved focused Application ports, not Workforce repositories. Unit-of-work semantics and any resulting owned port remain deferred to WF-PRE-11. A single broad replacement for `AppRepository` is forbidden.

## Events

### Published events

None in current behavior. Repository search and readiness evidence show no Workforce domain or integration event. No event is approved by this definition; WF-PRE-12 must decide each evidenced consumer need before any event name/version exists.

### Consumed events

None in current behavior. Current Teacher workflows are HTTP-triggered and synchronous. Event consumption may not be added without WF-PRE-12 evidence and approval.

## External Integrations

| System/provider | Purpose | Port owner | Adapter | Timeout/retry | Failure mode | Sensitive data |
|---|---|---|---|---|---|---|
| None | Workforce has no direct third-party provider in current scope | Not applicable; approved by Architecture Owner because repository evidence shows no provider call | None | Not applicable | Not applicable | None |

Identity & Access is an internal bounded context, not an external integration. Password hashing is Identity-owned infrastructure and must not enter Workforce Domain/Application.

## Dependencies

### Allowed dependencies

WF-PRE-09/10 approve exact public Application and consumer-owned port signatures; provider adapter implementations and executable contract suites remain gated.

| Dependency | Contract used | Direction | Synchronous/asynchronous | Rationale |
|---|---|---|---|---|
| Platform Administration & Tenancy | Verified tenant/actor context | Workforce consumer → Platform provider | Synchronous context | Tenant isolation and active-tenant authority |
| Identity & Access | Provision/access-state/reset/session outcome | Compatibility coordinator → Identity provider | Synchronous command; cross-provider consistency remains WF-PRE-11 | Preserve portal outcomes without credential ownership |
| Organization & Branches | Branch validity/default reference | Compatibility coordinator → Organization provider | Synchronous fail-closed query | Validate/default external Branch reference without table access |
| Academic Groups | Active assignment blocker/profile summary | Compatibility coordinator → Groups provider | Synchronous fail-closed query/composition | Archive safety and compatible profile without a Workforce→Groups module cycle |
| Scheduling | Scheduled workload projection | Compatibility coordinator → Scheduling provider | Synchronous composed query | Compatible non-authoritative directory projection |
| Lesson Delivery | Upcoming blocker and completed/upcoming projection | Compatibility coordinator → Lesson provider | Synchronous fail-closed query/composition | Archive safety and compatible profile without a Workforce→Lesson module cycle |
| Student Information | Active-student count source facts | Compatibility coordinator → Student provider | Synchronous composed query | Compatible non-authoritative directory projection |
| Audit & History | Mandatory audit append | Compatibility coordinator → Audit provider | Synchronous command for first extraction; durable handoff remains WF-PRE-11/12 | Preserve mutation accountability without foreign-table writes |
| Approved downstream consumers | Teacher reference/status contract | Consumer → Workforce provider | Synchronous query unless WF-PRE-12 approves facts | Stable Teacher references |

### Forbidden or removed dependencies

- Workforce Domain/Application importing legacy `AppService`, `AppRepository`, `db/client`, HTTP helpers, or SQL.
- Any Workforce package importing another module's repository, Infrastructure, private Domain, or database model.
- Workforce adapters reading or writing `users`, `sessions`, `user_roles`, `user_branch_access`, `branches`, `groups`, `group_teacher_assignments`, `schedules`, `lessons`, `students`, finance, or audit tables as a target design.
- Other modules reading `teachers` or `teacher_working_hours` directly after their approved migration increment.
- Teacher or any Workforce entity entering Shared Kernel.
- Direct external-provider, password-hashing, environment, migration-router, or outbox implementation imports in Domain/Application.
- Cyclic dependency from Workforce to downstream consumer internals.

### Temporary exceptions

| Exception | Owner | Expiry/removal condition | Compensating control |
|---|---|---|---|
| None approved | Sukhrob Khaydarov | Any required target deviation must use the formal exception process before implementation | Required architecture no-growth check; legacy baseline remains visible |

Current legacy cross-table behavior is classified debt, not a new-module exception.

## Database Ownership

WF-PRE-08 authoritative access evidence: [human decision](workforce-table-ownership-access.md) and [machine manifest](../../architecture/workforce-table-access-manifest.json). It binds all ten operation closures to 12 direct tables, two schema-only dependencies, exact verbs/owners, provider-contract treatment, and zero temporary target exceptions. The summary below remains the module-definition view.

| Table/view/stream | Ownership | Authoritative store | Tenant key | Aggregate/projection | Writers | Readers |
|---|---|---|---|---|---|---|
| `teachers` | Owned | SQLite | `tenant_id` | Teacher aggregate persistence | Current legacy `AppRepository`; future Workforce adapter only after authorization | Workforce contracts; current legacy consumers during migration |
| `teacher_working_hours` | Owned | SQLite | `tenant_id` | TeacherWorkingHour aggregate persistence | Current legacy `AppRepository`; future Workforce adapter only after authorization | Workforce contracts; current legacy consumers during migration |
| `tenants` | External: Platform | SQLite | `id` | Tenant reference | Platform only | Verified context/reference contract |
| `users`, `sessions`, `user_roles`, `user_branch_access` | External: Identity | SQLite | `tenant_id` where present | Portal-access state | Identity only in target | Identity public contract |
| `branches` | External: Organization | SQLite | `tenant_id` | Branch reference/default | Organization only | Organization public contract |
| `groups`, `group_teacher_assignments` | External: Academic Groups | SQLite | `tenant_id` | Assignment/blocker/projection | Academic Groups only | Groups public contract/composition |
| `schedules` | External: Scheduling | SQLite | `tenant_id` | Workload/assignment projection | Scheduling only | Scheduling public contract/composition |
| `lessons` | External: Lesson Delivery | SQLite | `tenant_id` | Blocker/history/projection | Lesson Delivery only | Lesson public contract/composition |
| `students` | External: Student Information | SQLite | `tenant_id` | Count projection | Student Information only | Student public contract/composition |
| `teacher_rate_rules`, `teacher_accruals`, settlement data | External: Lesson Finance & Payroll | SQLite | `tenant_id` | Teacher-reference consumers | Finance only | Workforce Teacher reference only |
| `audit_logs` | External: Audit & History | SQLite | `tenant_id` | Immutable audit record | Audit only in target | Audit contract |

Current constraints and decisions:

- `teachers.tenant_id` references `tenants(id)` with cascade deletion; `teacher_working_hours` references both Tenant and Teacher.
- Current schemas do not enforce a composite `(tenant_id, teacher_id)` foreign key. Tenant consistency is enforced by queries and must receive explicit contract/isolation tests.
- `branch_id` is not currently protected by a composite foreign key; validation/default behavior is an Organization contract decision.
- Teacher IDs are globally keyed strings and currently equal a configured Teacher User ID. Shared identity value does not imply shared aggregate ownership.
- Current create/update/archive transactions write Workforce and Identity tables together. Reset and working-hour check/write sequences have atomicity/concurrency gaps. WF-PRE-11 owns the target consistency decision.
- Teacher archive is soft. Working-hour deletion is hard, and current records have no separate retention/history policy.
- Tenant deletion can cascade owned rows under Platform authority. No independent Workforce hard-delete or retention authority is approved.
- Group/Schedule/Lesson `teacher_id` fields are consumer references or snapshots, not duplicate Workforce profile ownership.
- No schema or authority change is included in the first extraction.

## API Endpoints

All endpoints are legacy compatibility adapters. Exact fields, errors, ordering, limits, authorization, status, and OpenAPI gaps are frozen by [WF-PRE-05](workforce-contract-freeze.md).

| Method/path | Application use case | Request/response contract | Auth/permission | Version/status | OpenAPI evidence |
|---|---|---|---|---|---|
| `GET /api/teachers` | List Teachers | No body; `{ teachers: Teacher[] }` | Authenticated; role-sensitive self projection | Legacy stable | `docs/openapi.yaml` `/api/teachers` |
| `POST /api/teachers` | Create Teacher | Legacy profile/access body; Teacher | Admin | Legacy stable | `docs/openapi.yaml` `/api/teachers` |
| `GET /api/teachers/{teacherId}` | Get Teacher Profile | Path ID; profile/details | Admin or self Teacher | Legacy stable | `docs/openapi.yaml` `/api/teachers/{teacherId}` |
| `PUT /api/teachers/{teacherId}` | Update Teacher | Path ID plus legacy profile/access body; Teacher | Admin | Legacy stable | `docs/openapi.yaml` `/api/teachers/{teacherId}` |
| `DELETE /api/teachers/{teacherId}` | Archive Teacher | Path ID; inactive Teacher | Admin | Legacy stable | `docs/openapi.yaml` `/api/teachers/{teacherId}` |
| `POST /api/teachers/{teacherId}/restore` | Restore Teacher | Path ID; active Teacher | Admin | Legacy stable | `docs/openapi.yaml` restore path |
| `POST /api/teachers/{teacherId}/reset-password` | Reset Teacher Password | Path ID plus new password; acknowledgement | Admin | Legacy stable | `docs/openapi.yaml` reset-password path |
| `GET /api/teacher-working-hours` | List Working Hours | No body; `{ workingHours: WorkingHour[] }` | Authenticated; Teacher self-scoped | Legacy stable | `docs/openapi.yaml` `/api/teacher-working-hours` |
| `POST /api/teacher-working-hours` | Create Working Hour | Legacy interval body; WorkingHour | `lessons.manage` | Legacy stable | `docs/openapi.yaml` `/api/teacher-working-hours` |
| `DELETE /api/teacher-working-hours/{workingHourId}` | Delete Working Hour | Path ID; deleted WorkingHour | Admin | Legacy stable | `docs/openapi.yaml` working-hour item path |

HTTP routes do not define ownership. ADR-008 remains Proposed, so no `/api/v1` route is authorized.

## Tests

| Test type | Required behavior | Evidence/path | Status |
|---|---|---|---|
| Domain | Teacher lifecycle, value rules, interval validity/overlap | No Workforce Domain package/test | Missing; WF-PRE-13 |
| Use case | Ten operations, authorization, semantic failures, provider failures | Current behavior is embedded in `scripts/test-backend-logic.js` | Partial legacy coverage; dedicated tests missing |
| Repository contract | Equivalent SQLite/target adapter behavior | 18 focused ports approved; no adapters/tests | Missing; WF-PRE-13 |
| Integration | Teacher/Identity transaction and SQLite behavior | Teacher Management scenario in `scripts/test-backend-logic.js` | Passing legacy characterization |
| HTTP contract | Ten routes, DTO privacy, validation/errors | Teacher Management and RBAC scenarios; OpenAPI | Partial; exact matrix/comparison missing |
| Tenant isolation | Two-tenant reads and cross-ID attempts for every operation | General repository JOIN scenario follows Teacher test | Partial; per-operation matrix missing |
| Migration | Route parity, shadow comparison, authority, rollback/reconciliation | No Workforce migration harness/runbook | Missing; WF-PRE-13/14 |
| End-to-end | Profile, access, workload, hours, archive, history | `scripts/test-backend-logic.js` Teacher Management scenario | Passing: `npm run test:backend` expects 20/20 |
| Architecture | No legacy growth or forbidden module edges | `npm run architecture:enforce` and required CI check | Passing baseline; Workforce-specific checks missing |

Current objective commands are `npm run test:backend` and `npm run architecture:enforce`. Their success characterizes legacy behavior only and does not pass Module Readiness.

## Migration Status

| Field | Current evidence |
|---|---|
| Current architecture | Legacy HTTP branches call Teacher methods in shared `AppService` and shared cross-context `AppRepository` |
| Current authority by tenant/data set | SQLite legacy path is authoritative for every tenant and all Teacher/working-hour operations |
| Target authority | Workforce module through an approved SQLite compatibility adapter for first extraction; no transfer is authorized |
| Migration phase | Not started; scope and module definition characterized only |
| Backfill/parity state | No Workforce backfill; parity plan/harness missing |
| Canary scope | None |
| Rollback trigger and path | Not approved; legacy remains sole active path |
| Legacy removal criterion | Approved cutover, observation, zero-use, reconciliation, rollback-window closure, and Legacy Retirement Gate |
| Blocking decisions | WF-PRE-11 through WF-PRE-14 and final WF-PRE-16 |

Creating `src/modules/workforce/` is a future WF-EXT-01 action and is not authorized by this definition.

## Future Work

| Item | Reason/evidence | Dependency/decision | Priority authority | Status |
|---|---|---|---|---|
| Freeze ten HTTP/DTO/error/auth contracts | Current behavior and OpenAPI gaps are bound to an approved baseline | [WF-PRE-05](workforce-contract-freeze.md) | Product/Quality | Completed |
| Approve behavior/test matrix | Approved 81-row inventory; automation gaps remain assigned to WF-PRE-13 | [WF-PRE-06](workforce-behavior-matrix.md) | Quality/Module Owner | Completed |
| Decide cross-context seams | Seven seams and outer acyclic coordination approved | [WF-PRE-07](workforce-bounded-context-seams.md) | Architecture/affected owners | Completed |
| Approve access manifest | Exact operation/table/verb/owner/transition manifest; zero target exceptions | [WF-PRE-08](workforce-table-ownership-access.md) | Data/Architecture | Completed |
| Approve public Application contracts | Two exact public surfaces, 10/10 compatibility contracts, and one minimal Teacher reference query approved | [WF-PRE-09](workforce-public-application-contracts.md) | Module Owner/consumers | Completed |
| Approve focused ports | 18 exact ports, 11/11 closures, nine adapter groups, two owned tables, zero foreign direct access | [WF-PRE-10](workforce-focused-ports.md) | Architecture/Module Owner | Completed |
| Approve consistency model | Teacher/Identity operations span authority | WF-PRE-11 | Architecture/Data/Security | Open |
| Decide event requirements | No event or evidenced async need is approved | WF-PRE-12 | Architecture/consumers | Open |
| Approve test/parity plan | Port, tenant, parity, rollback evidence is missing | WF-PRE-13 | Quality | Open |
| Approve migration/rollback runbook | No cohort, threshold, routing, reconciliation, or drill exists | WF-PRE-14 | Operations/Data/Architecture | Open |
| Pass final exit criteria | Migration must remain unauthorized until every mandatory criterion passes | WF-PRE-16 | Architecture and specialist roles | Open |

Future work is preparation, not a feature or extraction commitment.

## Architecture Approval

| Gate | Decision | Approver | Date | Evidence/actions |
|---|---|---|---|---|
| Module Definition Completeness | Passed | Sukhrob Khaydarov, Architecture Owner and Workforce Module Owner | 2026-07-23 | Every mandatory template section is present; current/target/open states and owners are explicit |
| Module Readiness | Failed | Sukhrob Khaydarov, Architecture Owner | 2026-07-24 | WF-PRE-11 through WF-PRE-14 and WF-PRE-16 remain blocking |
| Migration Cutover | Pending | Architecture, Data, Operations, Security, and Module Owner roles | 2026-07-23 | No target path, parity, cohort, thresholds, or rollback drill |
| Legacy Retirement | Pending | Architecture, Data, and Module Owner roles | 2026-07-23 | No migration or zero-use/observation evidence |

## WF-PRE-04 Result

**WF-PRE-04: PASSED — module definition completeness only.**

The module definition is complete, evidence-linked, and owner-approved. WF-PRE-05 subsequently froze the current transport contract, WF-PRE-06 approved the behavior/test inventory, WF-PRE-07 approved bounded-context seams, WF-PRE-08 approved exact table access, WF-PRE-09 approved public Application contracts, and WF-PRE-10 approved focused ports. This decision does not pass Module Readiness or authorize source creation. The next ordered task is WF-PRE-11.
