# Workforce Module Readiness Review

Status: Candidate selected; not ready for migration
Assessment date: 2026-07-22
Candidate source: [migration-candidate-evaluation.md](migration-candidate-evaluation.md)

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

### Proposed owned responsibility based on current context map

- Teacher business profile and lifecycle.
- Employment type, specialization, contact data, hire date, workload ceiling, and note.
- Teacher working-hour intervals.
- Stable Teacher identity/reference for downstream contexts.
- Coordination of portal-access requests without owning credentials or sessions.

Evidence: `bounded-contexts.md` Workforce section; `src/db/schema.js:42-56`, `:535-545`; `AppService:472-591`, `:767-809`.

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

The conceptual boundary is documented, but current transactions cross Workforce and Identity. Read projections also join Groups, Students, Schedules, Lessons, and Users. Those seams must be replaced by public contracts or explicitly composed projections before extraction can be approved.

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

Names and boundaries must be approved in the module definition before implementation. This inventory does not prescribe class names.

## Repository Ports

### Current state

No Workforce-owned repository port exists. Every operation uses the 5,411-line `AppRepository`. The same facade provides branches, users, groups, schedules, lessons, audit, and finance.

### Required port decisions before migration

The module definition must specify focused capabilities for:

- Teacher aggregate persistence;
- Working Hours persistence and overlap query;
- Teacher list/profile projections;
- Identity provisioning, access-state change, password reset, and session invalidation;
- Branch existence/default reference;
- active Group/upcoming Lesson archive blockers;
- audit intent.

Whether each capability is a Domain repository, Application query port, synchronous public module contract, or composed Reporting query is an open design decision. One broad port reproducing `AppRepository` is forbidden.

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

### Missing contracts

- No public Workforce Application facade exists.
- No documented internal Teacher reference/status contract exists for downstream modules.
- No Identity coordination contract exists.
- No versioned event or query contract exists for Workforce consumers.
- The exact Teacher profile projection contract is mixed with Group/Lesson data.

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

No Workforce domain or integration event implementation exists. Current mutations write shared audit records through `AppService` calls (`:535`, `:547`, `:565`, `:577`, `:590`, `:797`, `:808`).

Before extraction, the module definition must decide whether any current synchronous consumer requires a public query only or whether stable committed facts are needed. Event names/payloads must not be invented before consumer evidence and ownership are approved.

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

Tenant-isolation repository tests follow at `:1874` onward, and smoke tests load Teacher views and authorization paths.

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
| Events | 0 | No event contracts or decision |
| Dependencies | 4 | Providers/consumers known; contracts absent |
| Risk controls | 4 | Risks observable; transaction/compensation decisions missing |
| Rollback feasibility | 6 | Legacy fallback possible; Identity reconciliation unresolved |
| Testing feasibility | 7 | Strong focused end-to-end characterization; lower-level contracts absent |

**Readiness score: 41/100** (`49 ÷ 120`, rounded).

## Readiness Decision

Workforce is a sound first post-Attendance candidate but is **not ready for migration**. The required preparation is recorded in [migration-backlog.md](migration-backlog.md) and [phase-1b-exit-criteria.md](phase-1b-exit-criteria.md).
