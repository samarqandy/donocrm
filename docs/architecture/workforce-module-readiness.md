# Workforce Module Readiness Review

Status: Candidate selected; not ready for migration
Assessment date: 2026-07-22
Candidate source: [migration-candidate-evaluation.md](migration-candidate-evaluation.md)

## Post-Review Decision Update

WF-PRE-03, WF-PRE-04, and WF-PRE-05 passed on 2026-07-23; WF-PRE-06 through WF-PRE-13 passed on 2026-07-24. The [Workforce Product Scope Decision](workforce-product-scope.md) approves Teacher profile/lifecycle, working hours, portal-access coordination, the current ten-operation compatibility surface, owned/non-owned product responsibilities, and explicit first-extraction non-goals. The [Workforce Module Definition](workforce-module-definition.md) completes every mandatory template section. The [Workforce Contract Freeze](workforce-contract-freeze.md) binds all ten current HTTP operations to exact request, response, error, authorization/privacy, ordering, and OpenAPI evidence. The [Workforce Behavior and Test Matrix](workforce-behavior-matrix.md) maps all required behavior categories to stable test IDs while explicitly preserving missing automation. The [Workforce Bounded-Context Seam Decision](workforce-bounded-context-seams.md) assigns provider authority, outer orchestration, synchronous communication, failure boundaries, and forbidden shortcuts. The [Workforce Table Ownership and Access Manifest](workforce-table-ownership-access.md) binds 10/10 operations to exact tables/verbs, owners, provider treatments, risks, and zero target exceptions. The [Workforce Public Application Contracts](workforce-public-application-contracts.md) approve two versioned surfaces, exact canonical DTO/error/auth/idempotency rules for 10/10 compatibility operations, and one minimal downstream Teacher reference/status query. The [Workforce Focused Port Decision](workforce-focused-ports.md) approves 18 cohesive ports, 11/11 operation closures, nine adapter groups, and zero foreign direct access or exceptions. The [Workforce Transaction and Consistency Decision](workforce-transaction-consistency.md) fixes 14 variant dispositions, five provider-local atomic units, Audit/write admission, unknown outcomes, retry, compensation, and reconciliation without distributed transactions. The [Workforce Integration-Event and Audit Delivery Decision](workforce-event-requirements.md) gives 19/19 dependencies synchronous/no-event dispositions and approves synchronous mandatory Audit acceptance without inventing event infrastructure. The [Workforce Executable Test and Parity Plan](workforce-test-parity-plan.md) fixes ten suites, eight fixtures, 69 behavior IDs, 11 contracts, 18 ports/32 methods, 14 consistency variants, zero-tolerance parity, and seven rollback cases while preserving missing implementation truthfully.

This resolves product scope, module-definition completeness, current HTTP contract baselining, behavior-inventory approval, bounded-context seam direction, exact table access, public Application contracts, focused ports, transaction/consistency, event/Audit delivery, and executable test/parity specification only. The original readiness score below is retained as the 2026-07-22 gate measurement and is not selectively recalculated before the complete Module Readiness Gate is rerun. The migration/rollback runbook and final gate keep the candidate not ready; planned target suite implementation remains a per-increment activation condition and zero target write routes are enabled.

## Scope of Review

This review assesses the Workforce bounded context currently implemented as Teacher Management. It does not define new behavior or authorize extraction.

Repository evidence identifies these current capability areas:

- teacher profile and employment state;
- portal-access coordination;
- branch assignment;
- working hours and overlap policy;
- workload/profile projections;
- archive/restore and password reset;
- references consumed by Groups, Scheduling, Lessons, Attendance, and Lesson Finance.

## Business Boundaries

### Approved product responsibility

- Teacher business profile and lifecycle.
- Employment type, specialization, contact data, hire date, workload ceiling, and note.
- Teacher working-hour intervals.
- Stable Teacher identity/reference for downstream contexts.
- Coordination of portal-access requests without owning credentials or sessions.

Approval: [WF-PRE-03](workforce-product-scope.md). Evidence: `bounded-contexts.md` Workforce section; `src/db/schema.js:42-56`, `:535-545`; `AppService:472-591`, `:767-809`.

### Explicitly outside Workforce ownership

| Data/capability | Target owner | Current coupling evidence |
|---|---|---|
| Users, passwords, sessions, roles, branch access | Identity & Access | `AppRepository:1998-2096` writes `users`, `user_roles`, `user_branch_access`, and `sessions` inside teacher transactions |
| Branch identity/main branch | Organization & Branches | `AppService:500-503`; `AppRepository:2001`, `:2035`, `:5009` |
| Group teacher assignment/history | Academic Groups | `group_teacher_assignments` owned by Groups; Group repository/profile logic around `AppRepository:1846-1933` |
| Schedule assignment/conflict | Scheduling | schedule queries reference `teacher_id`; working-hour checks appear at `AppRepository:3116-3136` |
| Concrete lesson teacher snapshots/history | Lesson Delivery | Teacher profile queries join lessons at `AppRepository:1984-1994` |
| Teacher rate rules/accruals | Lesson Finance & Payroll | `teacher_rate_rules` and `teacher_accruals` are finance-owned, not Workforce |
| Audit records | Audit & History | `AppService` calls the shared audit repository after mutations |

### Boundary readiness

The product boundary/non-ownership list, target seam direction, and exact access disposition are approved. Current transactions still cross Workforce and Identity, and current projections still join Groups, Students, Schedules, Lessons, and Users. WF-PRE-07/08 require these to become provider public contracts coordinated outside Workforce with no target foreign-table exception; exact contracts, ports, and consistency remain blocking.

## Current Application Use Cases

These are observable legacy operations, not extracted use-case implementations:

| Use case candidate | Current behavior evidence | Current entrypoint |
|---|---|---|
| List Teachers | Role-sensitive list and safe Teacher DTO | `AppService:472-478`; `GET /api/teachers` at `api.js:385-387` |
| Get Teacher Profile | Own-profile rule for Teacher; profile includes groups, hours, upcoming lessons | `AppService:480-498`; `AppRepository:1972-1995`; `GET /api/teachers/{id}` |
| Create Teacher | Validate profile/branch/access; create Teacher and optionally identity | `AppService:500-536`; `AppRepository:1998-2029` |
| Update Teacher | Validate lifecycle/access; update profile and identity state | `AppService:539-548`; `AppRepository:2032-2069` |
| Archive Teacher | Reject active groups/upcoming lessons; disable identity and sessions | `AppService:551-566`; `AppRepository:2072-2083` |
| Restore Teacher | Restore Workforce status | `AppService:569-578`; `AppRepository:2086-2088` |
| Reset Teacher Password | Validate password; update credential and invalidate sessions | `AppService:581-591`; `AppRepository:2091-2096` |
| List Working Hours | Teacher sees own hours; Admin sees tenant hours | `AppService:767-770`; `AppRepository:4990-5003` |
| Create Working Hour | Validate teacher/status/time/weekday/overlap | `AppService:772-798`; `AppRepository:5005-5030` |
| Delete Working Hour | Tenant-scoped deletion and audit | `AppService:801-809`; `AppRepository:5033-5037` |

The ten product operations and their inclusion are approved by WF-PRE-03. WF-PRE-09 fixes their exact public Application method names, canonical DTOs, semantic errors, authorization contexts, and idempotency expectations. WF-PRE-10 subsequently fixes the focused outbound port signatures and operation closures.

## Repository Ports

### Current and approved target state

Runtime still uses the 5,411-line `AppRepository`; no Workforce adapter has been implemented. WF-PRE-10 now approves the target boundaries:

- five Workforce-owned aggregate/base-read ports;
- eleven provider anti-corruption ports for Identity, Organization, Group, Schedule, Lesson, Student, and Audit capabilities;
- deterministic clock and Workforce ID ports;
- nine future adapter groups;
- direct access limited to `teachers` and `teacher_working_hours`.

Every PRE-09 public contract has an exact port closure. Five machine-verified guards prohibit a broad replacement for `AppRepository`, generic CRUD/query/SQL ports, multi-provider authority, foreign direct access, and premature Unit of Work/event infrastructure. WF-PRE-13 now defines the exact shared adapter contract suites; implementation and passing evidence remain mandatory before each adapter activation.

## Infrastructure Adapters

### Current state

No dedicated Workforce Infrastructure adapter exists. SQLite SQL resides in `AppRepository` at `:1946-2096` and `:4990-5037`.

There is no Workforce PostgreSQL schema/adapter. The PostgreSQL migrations under `src/infrastructure/database/postgres/` cover Attendance/reference data only.

### Readiness requirement

The first extraction may use a compatibility SQLite adapter, but its table access must match approved ownership and its contract suite must characterize current results/errors. PostgreSQL authority is a separate data migration gate and is not implied by source extraction.

## Public Contracts

### Existing HTTP contracts

- `GET/POST /api/teachers`
- `GET/PUT/DELETE /api/teachers/{teacherId}`
- `POST /api/teachers/{teacherId}/restore`
- `POST /api/teachers/{teacherId}/reset-password`
- `GET/POST /api/teacher-working-hours`
- `DELETE /api/teacher-working-hours/{workingHourId}`

Evidence: `src/http/api.js:283-296`, `:385-418`; `docs/openapi.yaml:861-925`, `:1741-1764`.

WF-PRE-05 exact evidence: [human-readable decision](workforce-contract-freeze.md) and [machine-readable baseline](../../architecture/workforce-contract-baseline.json). OpenAPI lists all ten operations but remains schema/error-incomplete; those gaps are explicit rather than treated as target precedent.

### Approved and remaining contracts

- `WorkforceCompatibilityApplicationV1` is the approved target public facade for all ten existing HTTP workflows.
- `TeacherReferenceApplicationV1.getTeacherReference` is the sole approved first-extraction downstream query and returns exactly five fields.
- Role-specific Teacher/profile DTOs, closed semantic errors, verified contexts, and no-key idempotency expectations are exact under WF-PRE-09.
- Focused Identity/Organization/Group/Scheduling/Lesson/Student/Audit provider port signatures are approved by WF-PRE-10; adapters and executable contracts do not yet exist.
- WF-PRE-12 approves zero published events, zero consumed events, and zero event versions after resolving every current dependency to a synchronous contract.

Existing HTTP request/response behavior must remain unchanged during any future migration.

## Database Ownership

| Table/data | Target ownership | Current use | Readiness decision |
|---|---|---|---|
| `teachers` | Workforce | Authoritative profile/lifecycle table | Clear candidate ownership |
| `teacher_working_hours` | Workforce | Authoritative availability intervals | Clear candidate ownership |
| `users` | Identity & Access | Created/updated alongside Teacher | Foreign write must become an Identity contract/workflow decision |
| `sessions` | Identity & Access | Deleted on disable/archive/password reset | Foreign write must become an Identity contract |
| `user_roles` | Identity & Access | Teacher role provisioned during create/update | Foreign write must become an Identity contract |
| `user_branch_access` | Identity & Access | Created with portal access | Ownership/coordination decision required |
| `branches` | Organization & Branches | Validated/defaulted during Teacher/working-hour changes | Public reference contract required |
| `groups`, `group_teacher_assignments` | Academic Groups | Profile counts/history/archive blockers | Published query/projection required |
| `schedules` | Scheduling | Workload and conflict inputs | Published query/projection required |
| `lessons` | Lesson Delivery | Profile and archive blocker | Published query/projection required |
| `teacher_rate_rules`, `teacher_accruals` | Lesson Finance & Payroll | Teacher identity consumers | Stable Teacher ID contract only; no Workforce ownership |
| `audit_logs` | Audit & History | Written after changes | Audit port/intent required |

No schema change is permitted or required for this preparation phase.

## External Integrations

Workforce has no direct third-party provider in current teacher-management methods. Password hashing is invoked in the repository as part of Identity coordination (`AppRepository:2002`, `:2036`, `:2092`). This is internal infrastructure leakage, not a Workforce external integration.

Telegram, SMS, email, payment, and storage providers are not Workforce dependencies in repository evidence.

## Events

No Workforce domain or integration event implementation exists. WF-PRE-12 approves that as the first-extraction target: all 19 evidenced dependencies remain synchronous, while current mutations' shared audit calls (`AppService:535`, `:547`, `:565`, `:577`, `:590`, `:797`, `:808`) are replaced only by synchronous required acceptance through the approved Audit port.

No event name or payload may be added without a new consumer-evidenced, versioned delivery decision. WF-PRE-12 specifically prohibits an event bus, business outbox/inbox, replay worker, or `migration_outbox` reuse for Workforce business facts.

## Dependencies

### Required providers

- Identity & Access: portal identity lifecycle and credentials.
- Organization & Branches: branch identity/default/validity.
- Audit & History: immutable audit intent.

### Current read dependencies that require contracts or composition

- Academic Groups: active group/archive blocker and profile summaries.
- Scheduling: workload/conflict/assignment projections.
- Lesson Delivery: upcoming/completed lesson projections and archive blocker.
- Student Information: current student counts in Teacher list.

### Downstream consumers

- Academic Groups, Scheduling, Lesson Delivery, Attendance, and Lesson Finance reference Teacher identity/status.

The target dependency map is conceptually acyclic only if multi-context profile composition and identity provisioning are placed behind explicit contracts/orchestration.

## Risks

| Risk | Severity | Evidence/treatment required |
|---|---|---|
| Teacher and Identity share one ID and one transaction today | High | `AppRepository:1998-2069`; define orchestration and failure/compensation semantics |
| Archive changes Teacher, User, and Sessions together | High | `AppRepository:2072-2083`; preserve authorization and rollback behavior |
| Password reset is Identity behavior exposed under Teacher route | High | `AppService:581-591`; contract ownership and error compatibility required |
| Teacher projections directly join five contexts | High | `AppRepository:1946-1995`; replace with contracts/composed read model, not foreign repositories |
| Group/archive rules depend on current/future assignment facts | High | `AppService:558-563`; exact blocker contract required |
| Working-hour overlap and schedule conflict concepts can diverge | Medium | `AppService:772-789`; `AppRepository:3116-3136`; ownership must be explicit |
| No dedicated port or adapter contract tests | High | all operations use `AppRepository` |
| HTTP compatibility is unversioned | Medium | ADR-008 Proposed; existing `/api` must remain unchanged |

## Rollback Feasibility

Rollback is feasible in principle because preparation requires no schema change and the legacy API/service/repository remain authoritative. A future extraction can be routed per operation/tenant only after a runbook defines:

- exact legacy and target dispatch boundaries;
- source of truth for Teacher and Identity facts;
- handling of in-flight create/update/access transactions;
- parity comparisons for lists, profiles, errors, and authorization;
- stop triggers and route fallback;
- reconciliation for target-side writes before fallback;
- proof that no client contract changed.

Rollback complexity is lower than financial contexts but is not trivial because portal identity writes currently share transactions with Teacher profile writes.

## Testing Feasibility

### Existing evidence

The focused backend scenario at `scripts/test-backend-logic.js:1780-1872` covers:

- create with and without access;
- password hashing and shared Teacher/User identity;
- Teacher authorization denial;
- duplicate username atomicity;
- profile/User name update;
- working-hour creation, overlap rejection, and deletion;
- historical lesson teacher preservation after Group reassignment;
- password reset and session invalidation;
- archive blocker, archive, identity deactivation, and login denial.

Tenant-isolation repository tests follow at `:1874` onward, and smoke tests load Teacher views and authorization paths. WF-PRE-06 now records the accepted coverage of every operation/category as `covered`, `partial`, `missing`, or `not_applicable`; it does not promote planned test IDs to evidence.

### Missing evidence

- isolated Domain tests;
- named use-case tests through ports;
- repository contract tests;
- parity tests between legacy and target flows;
- public Application contract tests;
- explicit two-tenant tests for every Teacher mutation/query;
- rollback/canary tests;
- architecture enforcement for a Workforce module.

Testing feasibility is good because current behavior is observable, but testing readiness is incomplete.

## Readiness Score

Each dimension is scored 0–10, where 10 means ready to begin migration without additional preparation.

| Dimension | Score | Reason |
|---|---:|---|
| Business boundary | 6 | Core ownership is clear; Identity/projection boundaries remain unresolved |
| Application use cases | 5 | Operations are identifiable but embedded in AppService |
| Repository ports | 0 | No Workforce ports exist |
| Infrastructure adapters | 0 | No dedicated adapter exists |
| Public contracts | 6 | HTTP/OpenAPI exist; no Application/internal contracts |
| Database ownership | 4 | Two owned tables are clear; foreign writes/joins remain |
| External integrations | 7 | No third party; Identity/password infrastructure still leaks |
| Events | 0 | Original 2026-07-22 measurement retained; WF-PRE-12 later completed the no-event/Audit decision |
| Dependencies | 4 | Providers/consumers known; contracts absent |
| Risk controls | 4 | Risks observable; transaction/compensation decisions missing |
| Rollback feasibility | 6 | Legacy fallback possible; Identity reconciliation unresolved |
| Testing feasibility | 7 | Strong focused end-to-end characterization; lower-level contracts absent |

**Readiness score: 41/100** (`49 ÷ 120`, rounded).

## Readiness Decision

Workforce is a sound first post-Attendance candidate but is **not ready for migration**. WF-PRE-03 through WF-PRE-13 have resolved scope, definition, compatibility, behavior, seams, access, public contracts, ports, consistency, event/Audit delivery, and executable test/parity specification; the remaining preparation starts with WF-PRE-14 and is recorded in [migration-backlog.md](migration-backlog.md) and [phase-1b-exit-criteria.md](phase-1b-exit-criteria.md).
