# DONOCRM CI Architecture Gates

Status: Mandatory gate design; CI implementation pending
Effective date: 2026-07-22
Final authority: Sukhrob Khaydarov under Single-Founder Governance
Rule source: [Executable Architecture Enforcement Rules](enforcement-rules.md)

## Gate Semantics

Gates evaluate the complete repository at the candidate commit. Changed-file analysis may annotate a pull request but cannot replace the full scan.

A gate result is `PASS` or `FAIL`. Existing non-compliance may remain only as an exact approved `BASELINE` fingerprint. A new, changed, unknown, ownerless, or expired fingerprint fails. An approved exception passes only its exact scope until expiry and remains visible in evidence.

All six gates are mandatory for architecture-relevant pull requests and release candidates once their CI checks are promoted to blocking. No score compensates for a failed gate.

## Gate A — Dependency Violations

**Purpose**

Prevent forbidden source/runtime dependencies, cross-module private access, cycles, unauthorized composition roots, and new legacy coupling.

**Pass criteria**

- complete internal dependency graph resolves without unknown relative imports;
- zero new module cycles;
- zero new forbidden imports under AR-001 through AR-008;
- all runtime injections resolve to declared public contracts or exact baseline fingerprints;
- approved composition roots are the only target-state constructors of concrete adapters/use cases;
- baseline and exception fingerprints are unchanged and owned.

**Fail criteria**

- any unresolved internal edge;
- Domain/Application outward dependency;
- cross-module private/repository/infrastructure import or injection;
- new dependency on legacy service/repository/database code from module code;
- new cycle or constructor outside an approved composition root;
- broad ignore, expired exception, or unexplained graph drift.

**Evidence**

- machine-readable edge list and strongly connected components;
- layer/module graph;
- current/new/removed/changed fingerprint diff;
- composition and runtime-wiring report;
- tool/configuration hash.

**Owner**

Architecture Owner; affected Module Owner for remediation. Quality Owner verifies deterministic execution.

## Gate B — Cross-Context SQL

**Purpose**

Detect SQL that crosses bounded-context ownership even when no source import reveals the coupling.

**Pass criteria**

- every SQL statement is parsed or explicitly reported as unsupported and failed;
- each statement resolves to one executing component and all referenced tables;
- module adapters use only owned tables or approved read projections;
- cross-context baseline statements are unchanged in tables and access modes;
- migrations and reporting exclusions are narrow and correctly classified.

**Fail criteria**

- a statement in one context reads or writes another context's table without exact approved treatment;
- a target-state transaction writes more than one context's owned data;
- computed/dynamic SQL cannot be resolved;
- a baseline statement adds a table, changes read to write, or broadens tenant scope;
- an exclusion hides application SQL rather than classifying it.

**Evidence**

- SQL statement inventory;
- module-to-table read/write matrix;
- cross-context findings with statement fingerprints;
- migration/reporting exclusion report;
- approved exception or baseline references.

**Owner**

Data Owner and Architecture Owner; affected source and target Module Owners approve any explicit temporary treatment.

## Gate C — Forbidden Table Access

**Purpose**

Enforce table ownership, tenant isolation, read/write permissions, and one-authority migration rules.

**Pass criteria**

- every referenced business table has exactly one target owner;
- executing component has an approved read/write permission;
- tenant-owned SQL contains validated tenant scope across base tables and joins;
- current/target authoritative store is explicit for every active migration cohort;
- no synchronous request-path dual write exists.

**Fail criteria**

- unknown, shared-by-default, or ownerless table;
- unapproved write or read of a foreign table;
- missing/ambiguous tenant scope;
- two authoritative writers for the same tenant/data set;
- authority configuration does not match the approved cohort manifest;
- access relies on an expired exception.

**Evidence**

- versioned table-ownership/access manifest;
- statement-level access results;
- tenant-isolation test artifacts;
- store-authority and cohort report;
- exception expiry report.

**Owner**

Data Owner; Architecture Owner makes the gate decision. Security Reviewer owns tenant-isolation findings.

## Gate D — Layer Violations

**Purpose**

Enforce Domain, Application, Presentation, Infrastructure, and Bootstrap responsibilities beyond path-to-path imports.

**Pass criteria**

- Domain contains no transport, persistence, environment, provider, worker, or migration concepts;
- Application contains no concrete adapters and expresses external needs through consumer-owned ports;
- Presentation contains no SQL, repository construction, business policy, or provider calls;
- Infrastructure implements approved ports without HTTP semantics or cross-context policy;
- Bootstrap contains composition only;
- Shared Kernel contains only ADR-approved exports and consumers.

**Fail criteria**

- forbidden API/symbol/import in a layer;
- SQL/database API in Domain/Application/Presentation;
- business invariant in controller/adapter/bootstrap;
- HTTP status/request/response type entering Domain;
- new/changed Shared Kernel member or consumer without Accepted ADR;
- new mutable global tenant/actor/request context.

**Evidence**

- restricted-import and AST/symbol report;
- SQL-placement report;
- Shared Kernel allowlist/consumer report;
- mutable-state findings;
- positive and negative scanner fixture results.

**Owner**

Architecture Owner and affected Module Owner; Quality Owner owns scanner fixture confidence.

## Gate E — Repository Contract Parity

**Purpose**

Prove that equivalent adapters preserve the same public repository semantics before an adapter or store becomes authoritative.

**Pass criteria**

- all adapters for one port run the same contract suite;
- outcomes match for success, not-found, validation, conflict, authorization-relevant inputs, idempotency, concurrency, transaction failure, and tenant isolation;
- normalized DTOs, ordering, persisted effects, and semantic errors match;
- no unexplained SQLite/PostgreSQL difference remains;
- authoritative adapters pass against production-equivalent database versions.

**Fail criteria**

- missing contract row or unsupported adapter method;
- constant/stub behavior in one adapter where another evaluates state;
- mismatched result/error/effect/ordering;
- partial commit, non-idempotent replay, tenant leak, or unexplained database-specific behavior;
- test suite cannot prove cleanup and isolation.

**Evidence**

- contract matrix and shared suite result by adapter/database version;
- normalized result/error/effect diff;
- transaction failure and tenant-isolation artifacts;
- known-difference register, which must be empty for authority transfer;
- test fixture and configuration hash.

**Owner**

Quality Owner and Data Owner; Module Owner owns contract semantics. Architecture Owner approves authority eligibility.

## Gate F — Architecture Regression

**Purpose**

Ensure the candidate commit does not grow legacy debt, drift contracts/documents, or weaken previously passing gates.

**Pass criteria**

- Gates A through E pass for their enforced scope;
- semantic Legacy Freeze fingerprint diff contains zero additions or broadened entries;
- removed fingerprints only reduce the baseline;
- no new `AppService`/`AppRepository` business method, legacy route, Presentation/worker SQL, frontend global workflow, or Shared Kernel consumer;
- OpenAPI and HTTP inventory are compatible;
- mandatory architecture documents, owners, exceptions, and links validate;
- behavior regression suites required for the changed scope pass.

**Fail criteria**

- any new/broadened legacy fingerprint;
- invalid/expired exception or missing owner;
- route/OpenAPI drift or breaking contract change without authority;
- changed architecture rule/configuration without approval and fixture evidence;
- a previously passing gate becomes warning/unknown/disabled;
- required behavior test is failing or skipped without approved evidence.

**Evidence**

- baseline-to-candidate semantic diff;
- legacy method/route/SQL/global-state counts and fingerprints;
- OpenAPI semantic diff;
- documentation/governance validation;
- consolidated gate report and required test results.

**Owner**

Architecture Owner and Quality Owner. Product Authority owns supported-contract decisions; Release Authority owns final release acceptance.

## Gate Execution Order

```text
Gate A Dependency
        │
        ├──► Gate D Layers
        │
        └──► Gate B Cross-context SQL ─► Gate C Table Access
                                            │
Gate E Contract Parity ─────────────────────┤
                                            ▼
                                  Gate F Regression
```

Independent scanners may run in parallel. Gate F waits for all upstream results and cannot convert a failure into a warning.

## Adoption and Exceptions

Before mandatory enforcement, every gate must have:

- approved machine-readable inputs and exact baseline;
- positive/negative fixtures;
- stable command and required-check name;
- reproducible clean-checkout result;
- named owner and artifact retention;
- tested narrow exception and scanner rollback procedure.

An architecture-tool defect may return one rule to warning mode only through an approved, expiring governance exception. Unrelated gates and business tests remain blocking. A CI outage requires equivalent recorded manual evidence and retrospective CI execution; it does not silently waive a gate.
