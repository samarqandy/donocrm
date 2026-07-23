# DONOCRM Architecture Test Plan

Status: Proposed test design; no tests implemented in Phase 1A
Related assessment: [Architecture Enforcement Report](architecture-enforcement-report.md)

## Purpose

This plan defines deterministic architecture tests for the current CommonJS/Node.js repository. It does not refactor code, change behavior, or declare current violations acceptable. Tests must enforce the accepted architecture while allowing explicitly approved, fingerprinted legacy exceptions to remain visible until their migration phase.

## Test Design Principles

- Parse the complete repository dependency graph; do not rely only on changed files.
- Use stable fingerprints such as rule, source path, target path/table, and access mode. Do not baseline line numbers.
- Separate `violation`, `approved temporary exception`, and `legacy baseline`; none means “compliant.”
- Fail immediately for a new violation even while an old fingerprint remains warning-only.
- Keep structural tests separate from business/use-case tests.
- Treat runtime wiring and table access as dependencies in addition to imports.
- Produce human-readable and machine-readable results with rule ID and repository evidence.
- An `N/A` result requires an objective reason; a missing scanner result is not a pass.

## Proposed Tooling

| Capability | Primary tool | Reason for selection | Repository impact in a future implementation |
|---|---|---|---|
| CommonJS graph and path rules | Read-only custom Node.js scanner using the repository's existing runtime | Current production code uses static `require()` and no lint/graph dependency is installed | Future test script and rule configuration only |
| JavaScript AST/symbol rules | Approved JavaScript parser or ESLint restricted-import/custom rules | Required for constructors, mutable module state, `process.env`, and reliable SQL-call detection | New dev dependency requires dependency review |
| Cycles and graph output | Same graph scanner; optional Dependency Cruiser only after approval | One canonical graph prevents conflicting rule interpretations | Optional future dependency/configuration |
| SQL table ownership | SQL string extractor plus reviewed ownership manifest; parser for complex SQL | Regex alone cannot reliably distinguish aliases, CTEs, and dynamic SQL | Machine-readable table ownership document and test |
| Runtime composition contracts | Node.js characterization tests using injected fakes | DV-10 has no direct cross-module import | Test-only code |
| Adapter contract parity | Shared behavioral contract suite | Required by dependency governance and exposes SQLite/PostgreSQL drift | Test-only code; controlled databases/fakes as appropriate |
| OpenAPI compatibility | OpenAPI parser and semantic diff approved by API owner | Route regex/string search cannot prove schema compatibility | Future dev dependency or CI tool |
| Documentation/governance | Custom Markdown/link/status/expiry validator | Formats and status rules are repository-specific | Test script only |

No tool is selected by this plan as a production dependency. Tool versions and supply-chain approval belong to Phase 1B planning.

## Architecture Test Catalog

### AT-001 — Source Dependency Inventory

- **Assertion:** Every statically resolvable internal `require()`/`import` is represented once in the graph; unresolved relative imports fail.
- **Scope:** `src/**/*.js`, production entrypoints, and operational scripts; tests are separate consumers.
- **Evidence:** Current baseline is 75 `src` JavaScript files and 145 internal CommonJS edges.
- **Output:** Edge list, layer/module classification, fan-in/fan-out, unresolved edges.
- **Initial mode:** Warning if graph count changes unexpectedly; failure for unresolved relative imports.

### AT-002 — Module Cycle Test

- **Assertion:** Strongly connected components contain no more than one business module.
- **Scope:** Physical imports plus declared runtime/public-contract dependencies.
- **Current evidence:** No direct Attendance/Students import cycle; Students receives Attendance repository at `stranglerContainer.js:87-90`.
- **Output:** Minimal cycle path.
- **Initial mode:** Immediate failure for a new physical cycle; warning for declared legacy semantic cycles.

### AT-003 — Domain Boundary Test

- **Assertion:** Domain imports only same-module Domain and approved Shared Kernel exports and references no HTTP, database, filesystem, environment, worker, provider, migration, or other-module symbol.
- **Current violation:** `Attendance.js:1` imports unapproved HTTP-aware `DomainError`.
- **Output:** Source, target, forbidden category, rule ID.
- **Initial mode:** Baseline DV-01; fail every new edge/symbol.

### AT-004 — Application Boundary Test

- **Assertion:** Application imports only same-module Application/Domain and approved Shared Kernel; concrete adapters and provider/database/environment APIs are forbidden.
- **Current violations:** Eight Application consumers of unapproved `DomainError`.
- **Output:** Exact edge and Shared Kernel admission state.
- **Initial mode:** Baseline known error edges; fail new consumers and all outer-layer imports.

### AT-005 — Presentation Shortcut Test

- **Assertion:** HTTP, worker, CLI, and presentation adapters do not import database clients, repository implementations, private module infrastructure, or bootstrap and contain no business SQL.
- **Current violations:** `src/http/api.js`, `src/http/server.js`, module controllers through global context, and `telegramQueueWorker.js` as cataloged in DV-03 through DV-08.
- **Output:** Shortcut category and edge/SQL location.
- **Initial mode:** Exact baseline warnings; new shortcut fails.

### AT-006 — Bootstrap-only Composition Test

- **Assertion:** Concrete business adapters/use cases are constructed only in approved composition roots.
- **Scope:** `new` expressions and factory calls for module Infrastructure/Application types.
- **Current violations:** `services/container.js`, `appRepository.js`, and `telegramQueueWorker.js`; root `server.js` is an entrypoint requiring explicit composition classification.
- **Output:** constructed type, location, approved composition-root status.
- **Initial mode:** Warning for classified legacy construction; fail new non-bootstrap construction.

### AT-007 — Shared Kernel Admission Test

- **Assertion:** Every file/export under `src/core/` appears in a machine-readable allowlist linked to an Accepted ADR; forbidden framework/transport concepts are absent.
- **Current violation:** `DomainError` is the only item, is unapproved, and has `status`.
- **Output:** file/export, ADR, semantic owners, consumers.
- **Initial mode:** Fail any new item or consumer; existing item remains a visible baseline violation.

### AT-008 — Cross-module Import Visibility Test

- **Assertion:** Imports from another module resolve only to its declared public Application facade/contracts/events. Imports of `domain/`, `infrastructure/`, `http/`, and repository implementations are forbidden.
- **Current evidence:** no direct physical inter-module import.
- **Output:** consumer, provider, imported path, public/private status.
- **Initial mode:** Immediate failure.

### AT-009 — Runtime Wiring Contract Test

- **Assertion:** Bootstrap injections are declared as public ports/facades, and one module is not handed another module's repository implementation.
- **Current violation:** Students' `attendanceQueries` returns a store-routed Attendance query repository.
- **Method:** Construction manifest or characterization test records provider contract type rather than relying on static import.
- **Initial mode:** Baseline DV-10; fail new repository-shaped cross-module injection.

### AT-010 — SQL Placement Test

- **Assertion:** SQL tokens/database APIs occur only in approved migrations, persistence adapters, reporting adapters, and test fixtures.
- **Current violations:** SQL in `src/http/api.js`, `src/http/server.js`, and `src/workers/telegramQueueWorker.js`.
- **Output:** file, statement category, owning adapter/module.
- **Initial mode:** Existing fingerprints warn; new production placement fails.

### AT-011 — Table Ownership Test

- **Assertion:** Each SQL statement reads/writes only tables permitted for that adapter by the bounded-context ownership manifest.
- **Current violations:** CM-01 through CM-08 in the enforcement report.
- **Output:** module, adapter, table, read/write mode, owner, exception/baseline ID.
- **Initial mode:** Warning until the ownership manifest is approved; then fail new/unapproved edges.

### AT-012 — Repository Port Cohesion Test

- **Assertion:** Port vocabulary and method count do not silently grow across bounded contexts.
- **Current violation:** `AttendanceRepository.js:2-14` includes Lesson, roster, reason, Finance, alert, persistence, and Audit capabilities.
- **Method:** vocabulary/threshold warning plus mandatory Module Owner review; semantics cannot be fully automated.
- **Initial mode:** Warning and no-growth check.

### AT-013 — Query Port Placement Test

- **Assertion:** new `*Query*Repository`/projection ports are in Application unless an approved module decision records why Domain owns them.
- **Current evidence:** `AttendanceQueryRepository.js` and projection-oriented `StudentRepository.list()` are under Domain.
- **Initial mode:** Warning for current files; failure for an unapproved new query port in Domain.

### AT-014 — Adapter Contract Parity Test

- **Assertion:** every active adapter implementing a port passes the same behavioral contract, including errors, concurrency, tenancy, and unavailable foreign data.
- **Current violation:** `hasActiveSettlement()` queries SQLite and returns constant false in PostgreSQL.
- **Output:** port method, adapter results, invariant mismatch.
- **Initial mode:** Mandatory failure before a target adapter becomes authoritative; warning in ordinary PR CI until the contract fixture is approved.

### AT-015 — Legacy Boundary No-growth Test

- **Assertion:** additions to `AppService`, `AppRepository`, legacy API routes/SQL, root frontend global state, and legacy container dependencies require a valid exception and cannot add a new context responsibility.
- **Method:** changed-line/path rules, method/route/table inventory, and baseline fingerprints.
- **Current baseline candidates:** metrics in the enforcement report; no baseline is approved yet.
- **Initial mode:** Warning until Architecture Owner signs baseline; then failure without exception.

### AT-016 — Environment and Provider Leak Test

- **Assertion:** Domain/Application contain no `process.env`, provider package, network, filesystem, database, or migration imports.
- **Current result:** extracted inner layers have no environment/provider access; legacy `AppService` imports Telegram.
- **Initial mode:** Immediate failure for modules; baseline legacy provider edge.

### AT-017 — Mutable Context/Singleton Test

- **Assertion:** module-level mutable tenant, actor, request, transaction, or branch state is forbidden; technical singleton additions require explicit platform classification.
- **Current result:** no global tenant/user variable found; DB/pool/router/worker/rate limiter and browser state are inventoried in the report.
- **Initial mode:** Fail tenant/actor/request globals; warn on other new mutable module state.

### AT-018 — Tenant Scope Static and Contract Test

- **Assertion:** tenant-owned repository operations accept tenant context and SQL predicates/keys include it; cross-tenant identifiers are behaviorally rejected.
- **Method:** signature/SQL heuristic plus two-tenant contract tests. Static scanning alone cannot prove isolation.
- **Current evidence:** extracted SQL commonly includes `tenant_id`; a complete operation-by-operation proof was not produced by this phase.
- **Initial mode:** Warning on heuristic; failure on behavioral isolation test.

### AT-019 — Module Definition Conformance Test

- **Assertion:** every Partial, Migrating, or Active module has a completed module document with named owner, public API, owned tables, events, dependencies, tests, status, and approvals.
- **Current violation:** neither Attendance nor Students has an instantiated module definition.
- **Initial mode:** Failure at Module Readiness Gate; warning in repository CI until governance assigns owners.

### AT-020 — ADR and Exception Validity Test

- **Assertion:** ADR has exactly one permitted status; Superseded links successor; Deprecated has exit condition; exceptions have owner, approver, exact fingerprint, and unexpired date.
- **Current result:** eight ADRs are structurally valid; no approved exception registry/baseline exists.
- **Initial mode:** Immediate documentation failure once the exception format/location is approved.

### AT-021 — Architecture Documentation Link/Section Test

- **Assertion:** required governance/module/checklist/report sections exist, relative links resolve, code fences balance, and no conflict markers exist.
- **Current result:** the Phase 0 documentation validation passed; this must become repeatable CI evidence.
- **Initial mode:** Immediate failure.

### AT-022 — Route/OpenAPI Contract Test

- **Assertion:** every supported route/method is represented by OpenAPI and changed schemas are classified for compatibility.
- **Current evidence:** `src/http/api.js` contains 98 route equality/match conditions; module route registrars add further routes; `docs/openapi.yaml` has 1,817 lines. No current CI comparison exists.
- **Initial mode:** Warning for full legacy baseline; failure for a changed/added undocumented route.

### AT-023 — Architecture Checklist Evidence Test

- **Assertion:** architecture-relevant PR/release metadata includes classification, affected modules, evidence, owner decisions, exceptions, and unresolved items required by `architecture-checklist.md`.
- **Current result:** no repository CI/PR workflow was found.
- **Initial mode:** Stage 2 warning, Stage 4 mandatory gate.

### AT-024 — Migration Authority Test

- **Assertion:** enabled tenant/store routing has one declared authority, required relay/readiness state, and a valid rollback record.
- **Current evidence:** `stranglerContainer.js:37-45` guards PostgreSQL canary with reverse-relay readiness; no governed authority manifest exists.
- **Initial mode:** Warning in normal CI; mandatory failure at Migration Cutover Gate.

### AT-025 — Architectural Hotspot Trend Test

- **Assertion:** changes report LOC, method/route count, table count, and dependency fan-out growth for named legacy hotspots and new files.
- **Current evidence:** hotspot metrics in the enforcement report.
- **Initial mode:** Warning only. A metric cannot automatically require decomposition.

## Violation Baseline Model

The future baseline must record one entry per violation:

| Field | Meaning |
|---|---|
| Rule ID | Test that detects it |
| Fingerprint | Source path plus target path/table/symbol and access mode |
| Classification | Legacy baseline or approved temporary exception |
| Architectural impact | Why it is non-compliant |
| Owner | Named accountable individual |
| Scope | Exact files/edges, never a directory-wide wildcard unless justified |
| Removal condition | Migration/gate evidence that closes it |
| Expiry | Required for exceptions; baselines reviewed at each phase gate |
| Compensating evidence | Tests/checks preventing business regression or expansion |

Line numbers and violation counts are evidence, not stable identity. CI must fail when a fingerprint changes in a way that broadens access.

## Exclusions and False-positive Control

- Test fixtures may contain SQL/provider doubles but cannot be imported by production code.
- Database migration SQL is exempt from SQL placement, not from tenant/data-safety review.
- Composition roots may import all layers but may contain no business policy.
- Infrastructure may read environment configuration; Domain/Application may not.
- Generated/vendor code is excluded only through an explicit path list; the repository currently has no generated source under `src/`.
- Dynamic imports or computed SQL unresolved by a scanner produce `Unknown`, not `Pass`.
- A false positive is fixed by improving the rule or adding a narrow approved exception, never by a broad ignore pattern.

## Required Test Outputs

Every CI run should publish:

1. module and layer dependency graphs;
2. cycle report;
3. current, new, removed, and changed violation fingerprints;
4. cross-module/table ownership matrix;
5. Shared Kernel membership/consumer report;
6. architecture checklist evidence result;
7. machine-readable result for required checks;
8. command, runtime/tool versions, and configuration hash.

## Acceptance Criteria for Test Implementation

The test suite is ready for mandatory use only when:

- Architecture and Module Owners approve the rule set and baseline;
- every rule has positive and negative fixture tests;
- the scanner handles current CommonJS resolution and fails closed on unknown internal paths;
- current findings reproduce the report without unexplained differences;
- false-positive and exception processes are documented and exercised;
- execution time and output are suitable for every pull request;
- CI branch protection uses stable required-check names;
- existing behavior tests remain independently visible.
