# DONOCRM First Post-Attendance Migration Candidate Evaluation

Status: Architecture recommendation; migration not authorized
Assessment date: 2026-07-22
Scope: All bounded contexts in [bounded-contexts.md](bounded-contexts.md)

## Decision Framework

Every bounded context is scored from repository evidence on six dimensions:

- **Business Risk:** 1 low, 5 critical if behavior or data is disrupted.
- **Technical Risk:** 1 localized/simple, 5 complex consistency, concurrency, or infrastructure risk.
- **Dependencies:** 1 few/stable, 5 many or bidirectional/unresolved dependencies.
- **Migration Complexity:** 1 narrow seam, 5 broad workflows/data/contracts.
- **Rollback Complexity:** 1 simple routing fallback, 5 reconciliation or irreversible state risk.
- **Testing Readiness:** 1 weak evidence, 5 strong focused behavior/parity evidence.

The suitability score is:

```text
round(100 × ((6 − Business Risk)
           + (6 − Technical Risk)
           + (6 − Dependencies)
           + (6 − Migration Complexity)
           + (6 − Rollback Complexity)
           + Testing Readiness) / 30)
```

The formula favors lower risk/complexity and stronger tests. It does not override product approval, migration order, or an unresolved bounded-context decision. A technically high score can therefore be ineligible.

## Context Evaluation

| Bounded context | Business risk | Technical risk | Dependencies | Migration complexity | Rollback complexity | Testing readiness | Suitability | Eligibility and repository evidence |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| Platform Administration & Tenancy | 5 | 4 | 4 | 4 | 5 | 2 | 33 | Not first. Tenant authority and Super Admin switching affect every context; routes/tables are in `src/http/api.js:123-163` and `AppRepository:793-1080`. |
| Identity & Access | 5 | 4 | 5 | 5 | 5 | 2 | 27 | Not first. `users`, `sessions`, roles, permissions, branch access, and login are shared by every request; `src/services/context.js:1-22` resolves identity through the legacy container. |
| Organization & Branches | 3 | 3 | 4 | 3 | 3 | 2 | 53 | Eligible later. `branches` and rooms are compact, but branch scope is consumed by IAM, Workforce, Groups, Scheduling, and Finance; bounded-context documentation records incomplete propagation. |
| **Workforce** | **3** | **3** | **3** | **3** | **2** | **3** | **63** | **Recommended.** Primary tables are `teachers` and `teacher_working_hours`; focused routes and an end-to-end management test exist; approved order names Teachers second. Identity/branch/group/lesson seams still require preparation. |
| Academic Groups | 4 | 4 | 5 | 4 | 4 | 3 | 40 | Not first. Groups own assignments/capacity and are parent references for schedules, enrollments, lessons, Attendance, and Finance; repository logic includes historical reassignment constraints. |
| Scheduling | 5 | 5 | 5 | 5 | 5 | 4 | 30 | Not first. Series lineage, preview/apply, occurrence materialization, conflicts, immutable history, and finance isolation are documented in schedule migration files and tests. |
| Lesson Delivery | 5 | 5 | 5 | 5 | 5 | 4 | 30 | Not first. Lesson state is consumed by Attendance and Finance and depends on Groups/Scheduling/Workforce; lifecycle mutations and history share large legacy transactions. |
| Student Information | 4 | 4 | 5 | 4 | 4 | 4 | 43 | Already MIGRATING but not selected next. `ListStudents` exists, yet its repository joins Groups, Guardians, and Billing and its Application receives Attendance repository infrastructure. |
| Guardians & Enrollment | 5 | 4 | 5 | 5 | 5 | 2 | 27 | Ineligible until boundary is approved. No independent HTTP API exists; creation, conversion, Telegram linking, group rosters, and enrollment history are embedded in shared workflows. |
| Attendance | 5 | 4 | 5 | 5 | 5 | 5 | 37 | Excluded: it is the current migration reference, not a post-Attendance candidate. Explicit module/tests exist, but Phase 1A found cross-context repositories and adapter parity risk. |
| Student Billing & Ledger | 5 | 5 | 5 | 5 | 5 | 4 | 30 | Not first. Payments, two transaction representations, balance projections, idempotency, voiding, closed periods, notifications, and audit create high authority/rollback risk. |
| Lesson Finance & Payroll | 5 | 5 | 5 | 5 | 5 | 4 | 30 | Ineligible pending product/context confirmation. Immutable settlements/postings/accruals have strong tests but original BRD excluded complex accounting/payroll from v1. |
| Communications | 4 | 4 | 4 | 4 | 4 | 3 | 43 | Not first. Queue/retry/linking/provider behavior is separable but recipient resolution spans Students/Guardians and tenant configuration; worker/repository/provider are combined. |
| Admissions CRM | 3 | 3 | 5 | 4 | 4 | 2 | 43 | Not first. Lead conversion writes Student, Guardian/Enrollment, Groups, and Billing in one legacy workflow; consistency ownership is open. |
| Work Management | 2 | 2 | 2 | 2 | 2 | 2 | 73 | Technically smallest, but not eligible without Product Authority. `tasks` and two routes exist, while governance identifies its durable product/context status as open and it is absent from the approved migration order. |
| Reporting & Export | 3 | 4 | 5 | 4 | 2 | 2 | 47 | Not first. It consumes almost every context and current exports issue SQL in `src/http/api.js:48-81`; projection ownership/freshness is undecided. |
| Audit & History | 5 | 4 | 5 | 4 | 5 | 2 | 30 | Not first. It is cross-cutting, immutable, and used by security/finance/operational changes; retention and context-history ownership remain unresolved. |

## Recommended Target

### Workforce (Teachers)

Workforce is the recommended first migration target after Attendance.

Evidence:

1. The approved migration runbook explicitly orders “Teachers” immediately after Attendance (`docs/clean-architecture-migration.md:117-124`).
2. Its primary owned data is narrow: `teachers` (`src/db/schema.js:42-56`) and `teacher_working_hours` (`src/db/schema.js:535-545`).
3. Existing HTTP contracts are explicit in `src/http/api.js:283-296` and `:385-418`, and documented in OpenAPI at `docs/openapi.yaml:861-925` and `:1741-1764`.
4. Current business behavior is concentrated in identifiable legacy methods: `AppService:472-591`, `:767-809`; `AppRepository:1946-2096`, `:4990-5037`.
5. A focused backend scenario covers creation with/without portal access, authorization, username conflict rollback, update, working-hour overlap, historical teacher preservation, password reset/session invalidation, archive blocking, archive, and disabled login (`scripts/test-backend-logic.js:1780-1872`).
6. Workforce has no direct third-party provider. Its external dependencies are internal contexts: Identity & Access and Organization & Branches; Groups, Scheduling, Lessons, Attendance, and Lesson Finance consume teacher identity.
7. Initial code extraction can preserve the existing SQLite schema and HTTP contracts, making route-level fallback feasible. This is preparation evidence, not permission to implement.

## Why Higher-scoring Work Management Is Not Selected

Work Management scores 73 because it has one primary table and few observed technical dependencies. However, its product status and final context placement are explicitly open in `bounded-contexts.md` and `vision.md`. Selecting it would invent migration priority and durable product ownership. It is ineligible until Product Authority confirms it.

## Why Organization & Branches Is Not Selected

Organization scores 53 and is relatively compact, but branch identity and access scope are upstream of Identity, Workforce, Groups, Scheduling, and Finance. The repository does not consistently propagate branch authorization, and no approved branch-isolation design exists. Migrating it first would require a broader access-control decision than Workforce profile extraction.

## Why Students Is Not Selected

Students already has a partial extracted query but is scheduled after Groups/Schedules in the approved order. Its current repository directly joins Group, Guardian, and Billing tables (`SQLiteStudentRepository.js:57-86`) and receives Attendance query infrastructure (`ListStudents.js:9-29`; `stranglerContainer.js:87-90`). Extending it now would deepen unresolved ownership dependencies.

## Selection Conditions

The recommendation becomes an approved migration target only when:

- Product and Architecture authorities confirm Workforce scope;
- a named Workforce Module Owner is recorded;
- a completed module definition passes the Module Readiness Gate;
- Identity provisioning, branch validation, group/lesson summary, audit, and password-reset contracts are decided;
- legacy freeze enforcement and rollback evidence meet [phase-1b-exit-criteria.md](phase-1b-exit-criteria.md).

Until then, Workforce remains LEGACY in runtime implementation and recommended only in architecture planning.
