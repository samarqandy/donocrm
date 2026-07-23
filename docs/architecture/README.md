# DONOCRM Architecture Documentation

Status: Architecture Foundation
Established: 2026-07-22
Scope: Current DONOCRM repository and the approved evolution toward an Enterprise Modular Monolith

## Purpose

This directory is the authoritative source for DONOCRM architecture. It records the current system, the target architecture, the rules that constrain implementation, and the decisions that explain why those rules exist.

Current governance is the Single-Founder Governance model recorded in [`architecture-governance.md`](architecture-governance.md): Sukhrob Khaydarov is Architecture Owner, Product Authority, all Module Owners, and final approval authority until that policy is superseded by a future ADR.

The documents are written for long-term use. They distinguish:

- **Current state** — behavior and structure evidenced by the repository today.
- **Target state** — architecture decisions accepted for future migration phases.
- **Legacy exception** — current code that does not conform but must remain operational during migration.
- **Open decision** — a question for which the repository does not provide enough evidence or approval.

Architecture documentation does not override business requirements. The primary business source is [`Dono_02_Business_Requirements.md`](../../Dono_02_Business_Requirements.md). Where that draft and current implementation differ, the difference must be resolved through product governance and, when architectural, an ADR.

## Document Map

| Document | Authority and purpose |
|---|---|
| [`vision.md`](vision.md) | Product-aligned technical vision, principles, long-term direction, and non-goals. |
| [`bounded-contexts.md`](bounded-contexts.md) | Current domain capability map, proposed bounded contexts, ownership, public interfaces, and relationships. |
| [`module-dependencies.md`](module-dependencies.md) | Mandatory dependency, layering, ports-and-adapters, shared-kernel, and cross-module communication rules. |
| [`coding-standards.md`](coding-standards.md) | Engineering conventions required when code is added or migrated in later phases. |
| [`architecture-governance.md`](architecture-governance.md) | Decision authority, ownership, reviews, exceptions, change management, phase gates, compatibility, and documentation governance. |
| [`module-template.md`](module-template.md) | Mandatory definition template for every new or migrated module. |
| [`architecture-checklist.md`](architecture-checklist.md) | Objective verification checklist for architecture-relevant pull requests and releases. |
| [`phase-0-gate-review.md`](phase-0-gate-review.md) | Formal Phase 0 documentation review, ADR disposition, readiness scores, blockers, and gate decision. |
| [`architecture-enforcement-report.md`](architecture-enforcement-report.md) | Phase 1A repository assessment, dependency/layer/data violations, static graphs, legacy classification, risks, and gate decision. |
| [`architecture-test-plan.md`](architecture-test-plan.md) | Proposed deterministic architecture-test catalog and violation-baseline model. |
| [`ci-enforcement-plan.md`](ci-enforcement-plan.md) | Provider-neutral staged path from warnings to mandatory architecture gates. |
| [`legacy-policy.md`](legacy-policy.md) | Mandatory Legacy Freeze rules, permitted maintenance, new-development boundaries, enforcement, and retirement policy. |
| [`legacy-freeze-report.md`](legacy-freeze-report.md) | LEGACY/MIGRATING/MODERN classification and evidence for every major repository component. |
| [`migration-candidate-evaluation.md`](migration-candidate-evaluation.md) | Scored evaluation of all bounded contexts and Workforce candidate recommendation. |
| [`workforce-module-readiness.md`](workforce-module-readiness.md) | Workforce boundaries, contracts, data, dependencies, risks, rollback/testing feasibility, and readiness score. |
| [`migration-backlog.md`](migration-backlog.md) | Ordered preparation, future extraction, and deferred Workforce migration backlog. |
| [`phase-1b-exit-criteria.md`](phase-1b-exit-criteria.md) | Objective mandatory criteria for authorizing the first Workforce migration. |
| [`phase-1b-gate-review.md`](phase-1b-gate-review.md) | Phase 1B summary, blockers, and final gate decision. |
| [`remediation-verification-2026-07-23.md`](remediation-verification-2026-07-23.md) | Latest post-review regression, repository parity, enforcement-baseline evidence, and remaining gate blockers. |
| [`adrs/`](adrs/) | Immutable history of significant architectural decisions. |

## ADR Index

| ADR | Title | Status |
|---|---|---|
| [ADR-001](adrs/ADR-001-target-architecture.md) | Target Architecture | Accepted |
| [ADR-002](adrs/ADR-002-why-modular-monolith.md) | Why Modular Monolith | Accepted |
| [ADR-003](adrs/ADR-003-why-postgresql.md) | Why PostgreSQL | Accepted |
| [ADR-004](adrs/ADR-004-migration-strategy.md) | Migration Strategy | Accepted |
| [ADR-005](adrs/ADR-005-bounded-context-strategy.md) | Bounded Context Strategy | Accepted |
| [ADR-006](adrs/ADR-006-dependency-rule.md) | Dependency Rule | Accepted |
| [ADR-007](adrs/ADR-007-shared-kernel.md) | Shared Kernel | Accepted |
| [ADR-008](adrs/ADR-008-api-versioning.md) | API Versioning | Proposed |

## Authority Order

When documents conflict, use this order and raise the conflict:

1. Approved business requirements and explicit product decisions.
2. Accepted ADRs.
3. `architecture-governance.md` for decision and gate procedure.
4. `vision.md` and `module-dependencies.md`.
5. `bounded-contexts.md` and approved module definitions.
6. `coding-standards.md` and `architecture-checklist.md`.
7. Migration runbooks and implementation-specific documents.
8. Legacy architecture descriptions.

[`ARCHITECTURE.md`](../../ARCHITECTURE.md) describes an earlier layered state and is retained as historical evidence. [`docs/clean-architecture-migration.md`](../clean-architecture-migration.md) remains the operational attendance migration runbook. Neither supersedes accepted ADRs in this directory.

## C4 Documentation Model

Architecture views should use C4 terminology consistently:

- **Software System:** DONOCRM.
- **Person:** Super Admin, tenant Admin, Teacher, and Parent as an external notification recipient. The BRD explicitly states that Parent is not an authenticated product role.
- **Container:** Browser application, Node.js HTTP application, background workers, SQLite legacy database, PostgreSQL target database, and Telegram Bot API.
- **Component:** A bounded-context module, HTTP adapter, use case, repository adapter, relay, or worker inside a container.
- **Code:** Classes, functions, tables, migrations, and tests.

Diagrams must state whether they describe current or target architecture.

## Decision Lifecycle

ADR statuses are:

- **Proposed** — under review and not mandatory.
- **Accepted** — mandatory for new and migrated code.
- **Superseded** — replaced by a later ADR; retained for history.
- **Deprecated** — still present but must not be expanded.

Accepted ADRs are not edited to reverse a decision. A new ADR supersedes the old one. Clarifications that do not alter the decision may be appended with a dated note.

Alternatives that were considered but not selected are recorded inside the deciding ADR; they do not receive a separate ADR status. The complete process is governed by [`architecture-governance.md`](architecture-governance.md#adr-process).

An ADR is required for changes to:

- target architecture or bounded-context ownership;
- database strategy or source-of-truth rules;
- module dependency direction;
- shared-kernel membership;
- public API compatibility/versioning;
- cross-context consistency or messaging guarantees;
- tenant isolation architecture;
- identity/session architecture;
- deployment topology with material operational impact.

## Maintaining These Documents

- Update the bounded-context inventory when ownership changes, not merely when files move.
- Update diagrams and public API descriptions in the same change that alters an accepted boundary.
- Record legacy exceptions with a removal phase or tracking reference.
- Review this foundation at every migration phase gate and before a commercial release.
- Do not copy volatile implementation detail into multiple documents; link to the owning document.
- Repository evidence should be cited with stable repository-relative paths.

## Known Open Architectural Decisions

The foundation deliberately leaves these unresolved:

1. Quantitative enterprise capacity and availability objectives beyond the BRD's 500+ student direction.
2. Whether academic subjects/levels require an independent Academic Catalog context.
3. Whether Guardians and Enrollment remain one context or become separate contexts.
4. The final split among Student Billing, General Ledger, Lesson Finance, and Payroll.
5. Cross-context workflow consistency model for lead conversion, student onboarding, and lesson settlement.
6. Long-term authentication/session mechanism for browser, mobile, and horizontal scaling.
7. PostgreSQL tenancy enforcement strategy, including whether row-level security is required.
8. Public API versioning mechanism and compatibility support duration.
9. Event retention, audit retention, recovery objectives, and migration rollback-window duration.

These questions must not be silently resolved in implementation pull requests. They require product clarification or ADR approval.
