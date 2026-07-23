# DONOCRM Executable Architecture Enforcement Rules

Status: Mandatory rule specification; automation pending
Effective date: 2026-07-22
Owners: Architecture Owner and affected Module Owner
Related decisions: [ADR-001](adrs/ADR-001-target-architecture.md), [ADR-002](adrs/ADR-002-why-modular-monolith.md), [ADR-004](adrs/ADR-004-migration-strategy.md), [ADR-005](adrs/ADR-005-bounded-context-strategy.md), [ADR-006](adrs/ADR-006-dependency-rule.md), [ADR-007](adrs/ADR-007-shared-kernel.md)

## Purpose

This document translates accepted architecture decisions into deterministic rules for source, SQL, manifests, contracts, and CI. It does not authorize a module migration or classify an existing violation as compliant.

Every automated finding has one of four outcomes:

- `PASS` — the inspected fact conforms to an enforceable rule;
- `FAIL` — a new, changed, unknown, expired, or unapproved fact violates a rule;
- `BASELINE` — an exact approved legacy fingerprint remains visible and unchanged;
- `EXCEPTION` — an exact, unexpired exception approved through architecture governance applies.

`Unknown`, parser failure, unresolved internal import, unresolved table, missing owner, or missing manifest entry is `FAIL`. A directory-wide ignore cannot create `PASS`.

## Executable Inputs

Automation must evaluate the complete repository, not only changed files, using these controlled inputs:

1. the internal JavaScript dependency graph;
2. module/layer classification derived from `src/modules/<module>/<layer>/` plus approved composition roots;
3. the bounded-context and table-ownership registry;
4. the Shared Kernel allowlist linked to an Accepted ADR;
5. the semantic Legacy Freeze fingerprints;
6. approved public module contracts and events;
7. approved, narrow, expiring exceptions;
8. the current and target store-authority register for migration cohorts.

Fingerprints use rule ID, source path, dependency/table/contract target, and read/write mode. Line numbers and file sizes are evidence, not identity.

## Layer and Dependency Rules

| ID | Assertion | Deterministic failure |
|---|---|---|
| AR-001 | Domain imports only its own Domain and approved Shared Kernel exports. | Domain imports Application, Presentation, Infrastructure, Bootstrap, legacy code, provider, database, filesystem, environment, worker, or migration code. |
| AR-002 | Application imports only its own Application, own Domain, consumer-owned ports, and approved Shared Kernel. | Application imports a concrete adapter, HTTP utility, database driver/client, provider SDK/client, worker, filesystem, environment configuration, migration router, or another module's private code. |
| AR-003 | Presentation invokes its module's public Application API and protocol mapping utilities only. | HTTP/controller/worker/CLI imports a database client, repository implementation, another module's private code, or bootstrap. Exact legacy fingerprints remain baseline-only. |
| AR-004 | Infrastructure implements inward-facing Domain/Application ports. | Infrastructure imports HTTP request/response types, another module's Infrastructure, or embeds business policy not required for translation. |
| AR-005 | Bootstrap is the only target-state composition root. | Concrete business use cases/adapters are constructed elsewhere without an exact legacy fingerprint or approved entrypoint classification. |
| AR-006 | Business-module dependencies are acyclic. | A physical or declared runtime dependency creates a cycle between bounded contexts. |
| AR-007 | Cross-module calls use the provider's declared public Application contract or approved integration event. | A module imports or receives another module's repository, private Domain object, Infrastructure adapter, table, or global legacy service. |
| AR-008 | Migrating/active modules have no new dependency on `AppService`, `AppRepository`, legacy container, or central database client. | A new edge from module code targets `src/services/**`, `src/repositories/**`, or `src/db/**`. |

Allowed source direction is:

```text
Presentation ─► Application ─► Domain
Infrastructure ──────────────► Application/Domain ports
Bootstrap ───────────────────► all concrete layers for composition
```

Runtime control may call an injected adapter through a port; source dependency still points inward.

## Forbidden Imports

The scanner must fail these patterns for new or migrated code:

- `src/modules/*/domain/**` importing outside its own Domain except an allowlisted Shared Kernel export;
- `src/modules/*/application/**` importing `infrastructure`, `http`, `bootstrap`, `services`, `repositories`, `db`, `integrations`, `workers`, or process environment/configuration;
- any module importing another module's `domain`, `infrastructure`, `http`, repository implementation, or non-public file;
- Presentation importing `src/db/**`, repository implementations, or another module's adapter;
- Shared Kernel importing any business module;
- business modules importing `src/infrastructure/migration/**` or store-routing implementations;
- production code importing test fixtures, generated reports, or architecture scanner internals;
- unresolved relative imports or computed internal imports that cannot be classified.

The current HTTP-aware `src/core/errors/DomainError.js` and its exact consumers are non-compliant legacy fingerprints. They are not Shared Kernel admissions, and no new consumer is allowed.

## Shared Kernel Rules

The approved Shared Kernel is empty by default under ADR-007. A file/export is allowed only when a machine-readable entry records:

- exact file and export;
- Accepted ADR admission;
- identical semantics in at least two contexts;
- accountable semantic owners;
- framework-neutral contract;
- approved consumers and review date.

Student, Teacher, Group, Lesson, Payment, Attendance, HTTP errors/status, SQL helpers, provider DTOs, password helpers, date formatting, and phone normalization are forbidden Shared Kernel members by default.

## Module Ownership Rules

| ID | Assertion | Pass condition |
|---|---|---|
| AR-020 | Every `src/modules/<module>` resolves to one bounded context and named Module Owner. | Module definition and governance register agree. |
| AR-021 | Every module exposes an explicit public Application surface. | Every cross-module consumer resolves to a declared command, query, DTO, or event. |
| AR-022 | Private paths remain private. | No external consumer imports module Domain implementation, adapter, controller, or repository. |
| AR-023 | Runtime wiring matches declared contracts. | Injected capabilities are public ports/facades, not repository-shaped shortcuts. |
| AR-024 | Migration status is explicit. | Each module is Legacy, Partial/Migrating, or Active with current authority and gate evidence. |

An owner assignment does not authorize migration. A module may enter Migrating only after its Module Readiness Gate passes.

## Database Ownership and SQL Rules

Every business table has exactly one target owning bounded context. Reads and writes are separate permissions.

| ID | Assertion | Deterministic failure |
|---|---|---|
| AR-030 | SQL appears only in approved migrations, owning persistence/query adapters, approved reporting adapters, and tests. | SQL or database APIs appear in Domain, Application, Presentation, browser code, or workers outside an exact baseline. |
| AR-031 | An adapter accesses only owned tables and explicitly approved projections. | A statement reads/writes an unowned table without an exact baseline or unexpired exception. |
| AR-032 | Writes never cross context ownership in a target-state local transaction. | One target adapter writes tables owned by multiple contexts. |
| AR-033 | Every tenant-owned access preserves tenant isolation. | Tenant predicate/join scope is absent, ambiguous, or not covered by isolation evidence. |
| AR-034 | Reporting is read-only and contract-based. | A reporting/export path writes business data or reads private tables without approved projection ownership. |
| AR-035 | One store is authoritative per tenant and data set. | Configuration or evidence permits ambiguous authority or synchronous request-path dual writes. |

The SQL scanner must classify `SELECT`, `INSERT`, `UPDATE`, `DELETE`, DDL, CTEs, subqueries, triggers, and dynamically assembled statements. Migration SQL is exempt only from placement checks; it still requires ownership, tenant/data-safety, and migration review.

The target table owners are defined by [bounded-contexts.md](bounded-contexts.md). Open-boundary tables cannot be treated as shared ownership; access remains baseline-only until an approved decision assigns them.

## Presentation Restrictions

Presentation may authenticate protocol input, validate syntax/size, construct Application DTOs, invoke one or more explicitly orchestrated use cases, and map semantic results/errors to HTTP/job/CLI output.

Presentation must not:

- execute SQL or use database APIs;
- implement business invariants, transaction policy, settlement decisions, or tenant data selection;
- construct repositories or provider clients;
- call another module's private implementation;
- publish integration events directly unless it is an approved event-ingress adapter invoking an Application use case;
- expose fields absent from the approved contract;
- add or change a route without OpenAPI compatibility evidence and Product Authority approval when required.

## Infrastructure Restrictions

Infrastructure may use drivers, network clients, filesystem, environment configuration, clocks, IDs, observability, and retry libraries only to implement approved ports.

Infrastructure must not:

- decide business eligibility or policy that belongs in Domain/Application;
- import protocol controllers or map directly to HTTP status codes;
- access another context's tables as an integration shortcut;
- expose driver rows/errors as public module contracts;
- create a second authoritative write path;
- hide delivery failure, retry, dead-letter, or reconciliation state;
- make migration adapters permanent or public.

Equivalent adapters must run the same repository contract suite. A semantic difference such as SQLite checking active lesson settlements while PostgreSQL returns a constant is a parity failure, not an acceptable implementation detail.

## Event Publication Rules

| ID | Rule |
|---|---|
| AR-040 | Only Application/Domain intent may authorize a business integration event; Infrastructure delivers it. |
| AR-041 | Event names are past-tense facts, have one owner, and carry stable IDs plus necessary immutable snapshots rather than database rows. |
| AR-042 | Event schema and semantic version are documented; incompatible meaning requires a new version and consumer migration decision. |
| AR-043 | Events are published only after the owning state transition commits, using an outbox/inbox when delivery reliability matters. |
| AR-044 | Producers do not import consumers; consumers are idempotent and record replay/deduplication behavior. |
| AR-045 | Retry, terminal failure/dead-letter state, observability, retention, and recovery ownership are explicit. |
| AR-046 | Migration replication events remain distinct from durable business events and record their removal condition. |
| AR-047 | Event publication does not create dual authority; one store/module remains authoritative per tenant/data set. |

## Legacy No-Growth Rules

The [Legacy Freeze Manifest](legacy-freeze-manifest.md) is enforced semantically:

- no new `AppService` or `AppRepository` business method;
- no new legacy API business route;
- no new SQL statement/table/join in frozen Presentation or worker code;
- no new root frontend global state or business workflow;
- no new provider dependency or cross-context transaction in a frozen component;
- no new Shared Kernel file/export/consumer;
- no broadened legacy fingerprint.

Removed fingerprints reduce the baseline. Their removal does not authorize unrelated refactoring or automatic legacy retirement.

## Exceptions and Evidence

An exception must identify exact rule, source, target, access mode, owner, approver, start and expiry dates, compensating checks, risk, and removal condition. Security, tenant isolation, credential protection, one-authority migration, and irreversible data-loss controls are non-waivable.

Every enforcement run publishes:

1. dependency graph and cycles;
2. new, changed, removed, baseline, and excepted fingerprints;
3. SQL placement and table ownership matrix;
4. Shared Kernel membership and consumers;
5. module/public-contract ownership resolution;
6. event-contract validation;
7. scanner/tool versions and configuration hash;
8. machine-readable gate outcome.

These rules become merge-blocking only through the staged CI adoption and approvals defined in [architecture-gates.md](architecture-gates.md) and [ci-pipeline.md](ci-pipeline.md).
