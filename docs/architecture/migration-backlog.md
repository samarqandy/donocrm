# Workforce Migration Preparation Backlog

Status: Ordered architecture backlog; no implementation authorized
Candidate: Workforce
Source: [Workforce Module Readiness Review](workforce-module-readiness.md)

## Completion Record

| ID | Status | Completed | Decision evidence |
|---|---|---|---|
| WF-PRE-01 | Completed | 2026-07-22 | [Single-Founder Governance ownership register](architecture-governance.md#architecture-governance-model) assigns Sukhrob Khaydarov as Architecture Owner, Product Authority, every Module Owner, and final specialist/gate approver |
| WF-PRE-02 | Completed | 2026-07-23 | Approved 68-fingerprint baseline, commit/configuration hash, owner record, and [formal gate closure](formal-operational-gate-closure-2026-07-23.md) |
| WF-PRE-03 | Completed | 2026-07-23 | [Approved Workforce product scope](workforce-product-scope.md) accounts for all ten operations, owned/non-owned responsibilities, compatibility commitments, and explicit non-goals |
| WF-PRE-04 | Completed | 2026-07-23 | [Approved Workforce module definition](workforce-module-definition.md) instantiates every mandatory template section and records later readiness blockers without authorizing extraction |
| WF-PRE-05 | Completed | 2026-07-23 | [Approved Workforce contract freeze](workforce-contract-freeze.md) and [machine-readable baseline](../../architecture/workforce-contract-baseline.json) inventory all ten HTTP operations, DTOs, status/errors, authorization/privacy, ordering, and OpenAPI gaps |
| WF-PRE-06 | Completed | 2026-07-24 | [Approved Workforce behavior matrix](workforce-behavior-matrix.md) maps 81 explicit behavior rows across ten operations to 69 stable test IDs or 12 explicit N/A decisions, while preserving coverage gaps |
| WF-PRE-07 | Completed | 2026-07-24 | [Approved bounded-context seam decision](workforce-bounded-context-seams.md) assigns eight context authorities, seven synchronous seams, 10/10 operation dispositions, four blocking risk treatments, and an acyclic outer-coordinator rule |
| WF-PRE-08 | Completed | 2026-07-24 | [Approved table ownership/access manifest](workforce-table-ownership-access.md) maps 10/10 operations to 12 direct tables, two schema-only dependencies, exact owners/verbs/provider treatments, five risks, and zero target exceptions |
| WF-PRE-15 | Completed | 2026-07-23 | Required GitHub check `architecture-enforce-blocking`, strict `main` protection, deterministic failure mode, and retained artifact |

WF-PRE-09 through WF-PRE-14 and WF-PRE-16 remain incomplete. No extraction item is authorized by this record.

## Ordering Rules

- Priority order is mandatory within each section unless an approved dependency change is recorded.
- “Before migration” items are gate prerequisites and cannot be deferred into implementation.
- “During extraction” items describe future controlled migration work; they are not authorized by this document.
- “Later” items are explicitly outside the first Workforce extraction unless new evidence changes scope.
- Every item requires a named owner before work begins.
- WF-PRE-04 passes module-definition completeness. The final Module Readiness decision depends on the then-remaining preparation gates, currently WF-PRE-09 through WF-PRE-14, and is recorded only by WF-PRE-16; requiring that final decision inside WF-PRE-04 would create a circular ordering dependency.

## Must Complete Before Migration

| Order | ID | Backlog item | Objective completion evidence | Dependencies/evidence |
|---:|---|---|---|---|
| 1 | WF-PRE-01 | **Completed 2026-07-22 — Assign accountable owners** | Architecture Owner, Workforce Module Owner, Product Authority, Identity/Organization owners, Data, Operations, Quality, and Security approvers are named in governance | [Architecture Governance](architecture-governance.md) |
| 2 | WF-PRE-02 | **Completed 2026-07-23 — Approve Legacy Freeze baseline** | Repository commit, Phase 1A fingerprints, classifications, approvers, and exception register are recorded | [Legacy Freeze Manifest](legacy-freeze-manifest.md); [formal gate closure](formal-operational-gate-closure-2026-07-23.md) |
| 3 | WF-PRE-03 | **Completed 2026-07-23 — Approve Workforce product scope** | Product Authority confirms Teacher profile, lifecycle, working hours, and portal coordination are in scope and lists explicit non-goals | [Workforce Product Scope Decision](workforce-product-scope.md); no new requirements permitted |
| 4 | WF-PRE-04 | **Completed 2026-07-23 — Complete the Workforce module definition** | Every section of [module-template.md](module-template.md) is completed, evidence-linked, owned, and explicitly identifies later readiness blockers; final Module Readiness remains WF-PRE-16 | [Workforce Module Definition](workforce-module-definition.md); readiness review is not a substitute |
| 5 | WF-PRE-05 | **Completed 2026-07-23 — Freeze current contracts** | All ten current Teacher/working-hours HTTP operations, DTO fields, status/error behavior, authorization, and OpenAPI definitions are inventoried | [Workforce Contract Freeze](workforce-contract-freeze.md); [machine baseline](../../architecture/workforce-contract-baseline.json) |
| 6 | WF-PRE-06 | **Completed 2026-07-24 — Approve the behavior matrix** | Ten current use-case candidates and all success/failure/invariant categories are mapped to stable tests or explicit N/A decisions, including tenant and role cases | [Workforce Behavior and Test Matrix](workforce-behavior-matrix.md); [machine matrix](../../architecture/workforce-behavior-matrix.json) |
| 7 | WF-PRE-07 | **Completed 2026-07-24 — Decide bounded-context seams** | Ownership, direction, synchronous communication, failure boundaries, forbidden shortcuts, risk treatment, and outer coordination are approved for Identity, Branch, Group/Lesson blockers, profile composition, and Audit | [Workforce Bounded-Context Seam Decision](workforce-bounded-context-seams.md); [machine seam model](../../architecture/workforce-context-seams.json) |
| 8 | WF-PRE-08 | **Completed 2026-07-24 — Approve table ownership/access manifest** | `teachers` and `teacher_working_hours` are the only owned direct tables; every foreign read/write maps to a provider contract, schema-only dependencies are explicit, and no temporary target exception is approved | [Workforce Table Ownership and Access Manifest](workforce-table-ownership-access.md); [machine manifest](../../architecture/workforce-table-access-manifest.json) |
| 9 | WF-PRE-09 | Define public Application contracts | Commands, queries, DTOs, errors, authorization context, and downstream Teacher reference/status contract are documented without changing HTTP behavior | No current Workforce facade exists |
| 10 | WF-PRE-10 | Define focused ports | Teacher persistence, working hours, identity, branch reference, archive blockers, profile projection, clock/ID, and audit capabilities are separated by consumer ownership | Current `AppRepository` must not become one broad port |
| 11 | WF-PRE-11 | Approve transaction/consistency model | Create, update access, archive, reset password, and session invalidation have defined authority, atomicity, failure, retry, and compensation behavior | Current SQLite operations span Workforce and Identity transactions |
| 12 | WF-PRE-12 | Decide event requirements | For every downstream consumer, record synchronous query/facade, published fact, or no event with evidence; approve event versions only where needed | No current Workforce events exist |
| 13 | WF-PRE-13 | Approve test and parity plan | Domain/use-case/repository/HTTP/tenant/parity/rollback tests have fixtures, commands, expected results, and owners | Existing tests are end-to-end/legacy, not port contracts |
| 14 | WF-PRE-14 | Approve migration and rollback runbook | Route/use-case increments, authority, parity, cohort, stop triggers, fallback, reconciliation, observation window, and retirement conditions are documented | No Workforce runbook exists |
| 15 | WF-PRE-15 | **Completed 2026-07-23 — Activate architecture no-growth evidence** | Blocking deterministic failures for new module/legacy violations are active; current baseline remains visible | Required check `architecture-enforce-blocking`; run `30027584361` |
| 16 | WF-PRE-16 | Pass Phase Exit Criteria | Every item in [phase-1b-exit-criteria.md](phase-1b-exit-criteria.md) has linked evidence and required approval | Final prerequisite |

## Can Migrate During Extraction

These are future migration items, ordered for an approved phase. They do not authorize code changes now.

| Order | ID | Backlog item | Required constraint |
|---:|---|---|---|
| 1 | WF-EXT-01 | Establish the approved module directory and composition registration | Structure only as required by approved definition; no broad empty architecture |
| 2 | WF-EXT-02 | Add characterization fixtures for focused contracts | Must reproduce legacy behavior before target routing |
| 3 | WF-EXT-03 | Introduce one public Application facade and focused ports | No dependency on legacy service/repository from module inner layers |
| 4 | WF-EXT-04 | Introduce a compatibility SQLite adapter | No schema change; only approved owned tables and explicit compatibility access |
| 5 | WF-EXT-05 | Extract read-only Teacher reference/list slice | Preserve DTO, authorization, ordering, and error contracts |
| 6 | WF-EXT-06 | Shadow and compare read results | No user-visible behavior; parity thresholds approved in advance |
| 7 | WF-EXT-07 | Extract working-hours behavior | Preserve overlap, tenant, role, and audit behavior; use focused port contracts |
| 8 | WF-EXT-08 | Extract Teacher profile mutations incrementally | One use case at a time with legacy fallback and no synchronous dual-write authority |
| 9 | WF-EXT-09 | Introduce approved Identity/Organization/Audit adapters or orchestration | No direct foreign-table access in target module |
| 10 | WF-EXT-10 | Canary explicit tenants/operations | Absence from cohort must use legacy path |
| 11 | WF-EXT-11 | Reconcile and verify rollback | Target writes since cutover must have a tested fallback/reconciliation treatment |
| 12 | WF-EXT-12 | Update module state and evidence at each gate | Documentation, graphs, contracts, tests, exceptions, and owner decisions stay current |

## Can Wait Until Later

| Order | ID | Item | Reason/evidence |
|---:|---|---|---|
| 1 | WF-LATER-01 | PostgreSQL authority for Workforce | PostgreSQL repository/schema currently covers Attendance; source extraction can preserve SQLite authority |
| 2 | WF-LATER-02 | Root frontend Teacher page migration | Backend module boundary and compatibility can be stabilized before page extraction; root frontend is frozen |
| 3 | WF-LATER-03 | Independent Academic Groups/Scheduling/Lesson migrations | They follow Workforce in the approved dependency order and remain separate contexts |
| 4 | WF-LATER-04 | Teacher rate/payroll extraction | Owned by Lesson Finance & Payroll; product/context status remains open |
| 5 | WF-LATER-05 | Event publication with no evidenced consumer | Events must not be invented for architectural appearance |
| 6 | WF-LATER-06 | API v1 route migration | ADR-008 remains Proposed; current unversioned API compatibility is mandatory |
| 7 | WF-LATER-07 | Microservice extraction | ADR-001/002 choose a Modular Monolith; no independent deployment evidence exists |
| 8 | WF-LATER-08 | Mobile/partner-specific Teacher contracts | No approved current client requirement exists |
| 9 | WF-LATER-09 | General analytics/read-model platform | Reporting ownership/freshness remains an open context decision |
| 10 | WF-LATER-10 | Database-per-tenant or PostgreSQL RLS changes | ADR-003 leaves topology/RLS open and no Workforce requirement decides them |

## Backlog Governance

- Moving an item between sections requires Architecture Owner and affected Module Owner approval.
- Product-scope changes require Product Authority.
- A backlog item cannot silently resolve an ADR-level decision.
- Implementation pull requests must reference approved backlog IDs and gate evidence.
- Completion means evidence is accepted, not merely that a file or ticket exists.
