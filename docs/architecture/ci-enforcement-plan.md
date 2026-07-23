# DONOCRM CI Architecture Enforcement Plan

Status: Proposed provider-neutral plan; no CI configuration implemented in Phase 1A
Related documents: [Architecture Test Plan](architecture-test-plan.md), [Architecture Enforcement Report](architecture-enforcement-report.md), [Architecture Governance](architecture-governance.md)

## Current CI State

No GitHub Actions, GitLab CI, Jenkins, or Azure Pipelines configuration was found in the repository locations inspected during Phase 1A. `package.json` has a `test:architecture` command, but it runs behavioral Attendance and Students checks rather than static architecture enforcement.

The CI provider, branch-protection authority, artifact-retention location, and accountable CI owner are missing decisions. This plan therefore defines required behavior without inventing a provider.

## Enforcement Strategy

Architecture enforcement advances only when the prior stage has stable output, approved owners, and a rollback path for the enforcement mechanism. A stage may tighten one high-confidence rule earlier than another; the stage of each rule must be visible in configuration.

```text
Stage 1: Warning only
          ↓
Stage 2: CI warnings and review evidence
          ↓
Stage 3: CI failures for new/high-confidence violations
          ↓
Stage 4: Mandatory architecture gates
```

## Stage 1 — Warning Only

### Goal

Make the current architecture measurable without blocking local development.

### Scope

- build source and runtime-wiring dependency inventories;
- produce layer, cycle, Shared Kernel, SQL placement, table ownership, legacy, and hotspot reports;
- draft stable violation fingerprints;
- run existing behavior-focused architecture tests separately.

### Entry criteria

- named Architecture Owner and provisional enforcement owner;
- reviewed test rule identifiers;
- agreed scan scope and exclusions.

### Exit criteria

- reports reproduce Phase 1A findings or explain every difference;
- positive/negative test fixtures prove each scanner rule;
- no unresolved internal import or unknown table ownership is reported as pass;
- owners review and classify every current fingerprint.

### Rollback

Disable the warning job if it destabilizes development, retain its artifacts, and correct the scanner/configuration. No source behavior is affected.

## Stage 2 — CI Warnings

### Goal

Run enforcement on every pull request and make architecture impact reviewable without making all findings merge-blocking.

### Required CI jobs

| Job | Output | Merge effect |
|---|---|---|
| `architecture-graph` | dependency/layer graphs and cycles | Warning except invalid/unresolved graph |
| `architecture-boundaries` | forbidden imports, Shared Kernel, composition, legacy edges | Warning for baseline; new-edge alert |
| `architecture-data-ownership` | SQL placement and table coupling matrix | Warning until manifest approval |
| `architecture-contracts` | existing use-case tests and adapter contract status | Existing test failures remain failures |
| `architecture-docs` | links, sections, ADR statuses, exception expiry | Documentation errors fail when deterministic |
| `architecture-diff` | added/removed/changed fingerprints and hotspot trend | PR annotation |

### Pull-request evidence

- change classification and affected modules;
- architecture checklist result;
- new/removed violation summary;
- owner or required-reviewer assignment;
- approved exception links.

### Exit criteria

- CI provider and required-check names are stable;
- warning noise is low enough that every warning is reviewed;
- legacy baseline is signed by Architecture and affected Module Owners;
- table/public-contract/module manifests exist for modules subject to failure rules;
- exception creation and expiry are tested.

### Rollback

Return a noisy individual rule to Stage 1, retaining other jobs. The Architecture Owner records why and the correction criterion.

## Stage 3 — CI Failures

### Goal

Prevent new architecture debt while allowing exact approved legacy fingerprints to remain temporarily.

### Immediate failure rules

- new module cycle;
- new Domain/Application → Infrastructure/Presentation/provider/database/environment edge;
- new direct cross-module infrastructure/repository/private import;
- new Shared Kernel item or consumer without Accepted ADR admission;
- new SQL in Presentation/Application/Domain;
- new table access outside approved ownership/exception;
- new concrete adapter construction outside approved bootstrap;
- new dependency on `AppService`/`AppRepository` from a Partial/Migrating/Active module;
- invalid or expired exception;
- missing module definition/owner for a module declared Migrating or Active;
- undocumented new or changed HTTP route;
- regression in existing behavior or adapter contract tests.

### Baseline behavior

- exact legacy fingerprints remain warnings with owner and review status;
- any changed target, table, access mode, or additional consumer creates a new failing fingerprint;
- removal decreases the baseline automatically but does not authorize unrelated refactoring;
- broad path wildcards cannot suppress new edges.

### Exit criteria

- required checks are protected against bypass by ordinary authors;
- emergency bypass follows `architecture-governance.md` and creates an expiring exception/incident record;
- reports are retained for the approved audit period;
- at least one rollback of an enforcement configuration has been rehearsed without disabling all architecture checks.

### Rollback

If a rule is proven wrong, the Architecture Owner may revert that rule to Stage 2 using an exception describing exact affected fingerprints, owner, and deadline. Business tests and unrelated rules remain mandatory.

## Stage 4 — Mandatory Architecture Gates

### Goal

Use architecture evidence as part of Module Readiness, Pull Request, Migration Cutover, Release, and Legacy Retirement decisions.

### Mandatory controls

- all Stage 3 checks are required and non-bypassable except through the emergency exception process;
- PR template/check records all architecture checklist fields;
- code ownership requests named Module Owner and specialist reviews from changed paths/manifests;
- Module Readiness fails without a completed module definition;
- Migration Cutover fails without adapter parity, authority, backfill, canary, reconciliation, and rollback evidence;
- Release fails with an expired exception, undocumented breaking change, incompatible OpenAPI diff, or missing operational evidence;
- Legacy Retirement fails without zero-use and closed rollback/retention evidence.

### Success criteria

- every module and owned table resolves to a named owner;
- every cross-module dependency resolves to a public contract or approved event;
- all non-compliant edges have current, narrow, owned treatment;
- architecture reports are reproducible from a clean checkout;
- gate decisions identify approvers, evidence, date, and unresolved non-blocking actions.

### Rollback

Architecture gates cannot be silently disabled. A CI-platform outage follows the emergency process and requires equivalent recorded manual evidence plus retrospective verification when CI returns.

## Rule Promotion Matrix

| Rule group | Stage 1 | Stage 2 | Stage 3 | Stage 4 |
|---|---|---|---|---|
| Import/layer direction | Inventory | PR warning | New violations fail | Required gate evidence |
| Cycles | Inventory | New-cycle warning | New cycles fail | No active cycle/exception |
| Shared Kernel | Inventory/freeze | Warning and ADR link | New item/consumer fails | Membership reviewed per release |
| SQL/table ownership | Extract/compare | Warning | Manifest violation fails | Owner/cutover evidence required |
| Legacy no-growth | Measure | Diff warning | New fingerprint fails | Baseline reduction reviewed |
| Adapter parity | Identify suites | Report gaps | Changed/authoritative adapter failure blocks | Cutover gate mandatory |
| Documentation/ADR | Validate | Deterministic errors fail | Required | Gate record required |
| Checklist | Optional evidence | Required PR annotation | Missing evidence fails scoped PR | Mandatory gate input |
| Hotspot metrics | Warning | Warning | Warning unless tied to explicit no-growth rule | Review signal only |

## CI Change Scope

Future implementation is expected to affect only test/tooling/governance surfaces such as:

- `package.json` test scripts and approved development dependencies;
- a future architecture-test directory under `scripts/` or `tests/`;
- provider-specific CI configuration after the provider is selected;
- machine-readable module, table-ownership, Shared Kernel, legacy-baseline, and exception records under an approved architecture configuration location;
- PR/release templates and ownership configuration.

No rule implementation requires changing business logic, API behavior, database schema, or module placement. Any such request is outside this enforcement plan and requires a separate gate.

## Risk Controls

| Enforcement risk | Control |
|---|---|
| False positives block urgent work | Positive/negative fixtures, staged promotion, narrow expiring exception |
| Baseline legitimizes debt | Label every item non-compliant, require owner/removal condition, fail growth |
| Regex misses dynamic dependency/SQL | AST/parser, fail `Unknown`, behavior/contract tests |
| Developers bypass checks | Protected required checks and audited emergency process |
| CI becomes too slow | Cache graph inputs, run focused diff annotations plus full deterministic graph; retain correctness |
| Tool supply-chain risk | Prefer current Node runtime; approve/pin any new parser/tool |
| Architecture tests duplicate business tests | Separate structural jobs and use-case/contract jobs |
| Rules drift from documents | Rule IDs link canonical documents; documentation validator checks decision/status hash |
| Line-number baseline becomes stale | Fingerprint semantic edge/table, not line |
| Unnamed owners leave warnings unresolved | Stage entry criteria require named accountability |

## Required Decisions Before Stage 1

1. Assign Architecture Owner, enforcement owner, and owners for Attendance and Students.
2. Select CI provider and branch-protection authority.
3. Approve the architecture-test toolchain and dependency policy.
4. Approve machine-readable manifest and exception locations/formats.
5. Approve the initial rule scope, legacy fingerprints, and promotion authority.
6. Decide treatment of the SQLite/PostgreSQL `hasActiveSettlement` contract discrepancy before target-store authority.
7. Complete module definitions sufficient to establish table and public-contract ownership.

These are governance prerequisites. They do not require starting a module migration.
