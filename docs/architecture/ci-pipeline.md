# DONOCRM Architecture CI Pipeline

Status: Provider-neutral mandatory design; no CI configuration implemented
Effective date: 2026-07-22
Owners: Architecture Owner, Quality Owner, Operations Owner
Related documents: [Architecture Gates](architecture-gates.md), [Contract Testing](contract-testing.md), [Legacy Freeze Manifest](legacy-freeze-manifest.md)

## Purpose and Constraints

This pipeline turns architecture policy into reproducible evidence without changing runtime behavior, APIs, business logic, or database schema. Provider selection, branch protection, runner credentials, and artifact retention remain implementation decisions.

All jobs run from a clean checkout with a locked dependency graph. Production secrets and production data are prohibited. New tooling is development/CI-only, version-pinned, and subject to dependency review.

## Pipeline Topology

```text
lint ───────────────┐
unit ───────────────┼──► architecture ─┐
                    │                  ├──► contract ─► parity ─┐
                    └──────────────────┘                       │
unit ───────────────────────────────────────► integration ─────┤
                                                               ├──► smoke
parity ─────────────────────────────────────────► migration ────┤
                                                               ▼
                                                            release
```

Jobs without data dependencies should run in parallel. `release` is an evidence aggregator and gate decision input; it does not deploy by itself.

## Stage 1 — `lint`

**Purpose:** Fail fast on parse errors, unsafe repository hygiene, invalid documentation structure, and deterministic configuration defects.

**Required checks**

- JavaScript syntax and approved style/static rules;
- unresolved relative imports;
- JSON/YAML parse and lockfile consistency;
- Markdown links, required sections, ADR statuses, duplicate IDs, and exception expiry;
- no committed secrets, production data, generated database files, or unapproved binary artifacts;
- machine-readable manifests validate against their approved schemas.

**Pass:** zero errors; warnings are enumerated and non-architectural only.

**Artifacts:** lint report, documentation validation, manifest validation, tool/version inventory.

**Current gap:** no linter or CI provider is configured. Tool selection and pinned versions require approval.

## Stage 2 — `unit`

**Purpose:** Verify deterministic pure Domain/Application/helper behavior without external services.

**Required checks**

- existing approved unit/use-case tests;
- architecture scanner positive/negative fixtures;
- deterministic clock, ID, parser, fingerprint, and normalization tests;
- no network or shared database dependency;
- no flaky retry as a pass mechanism.

**Pass:** 100% required tests pass; zero skipped/quarantined unknown result.

**Artifacts:** machine-readable test report and configuration hash.

## Stage 3 — `architecture`

**Purpose:** Execute structural Gates A, B, C, and D and prepare Gate F no-growth evidence.

**Required jobs**

| Job | Scope |
|---|---|
| `architecture-dependencies` | Full import/runtime graph, cycles, forbidden edges, composition roots |
| `architecture-layers` | Restricted symbols/imports by Domain/Application/Presentation/Infrastructure/Bootstrap |
| `architecture-sql` | SQL placement, statement extraction, cross-context and table access |
| `architecture-ownership` | Module, table, public contract, event, Shared Kernel, and store-authority manifests |
| `architecture-freeze` | Semantic legacy baseline diff and exception validation |
| `architecture-docs` | Rule/document/ADR ownership and lifecycle validation |

**Pass:** no new/changed violation; exact approved baselines remain visible; zero unknown; all enforced Gate A–D assertions pass.

**Artifacts:** graphs, access matrix, fingerprints, Shared Kernel report, ownership resolution, gate results, tool/configuration hash.

## Stage 4 — `contract`

**Purpose:** Prove Application, repository, and HTTP contracts without relying on implementation similarity.

**Required checks**

- Application contract suites for affected approved modules;
- shared repository contract suite for every affected adapter;
- HTTP/OpenAPI semantic compatibility diff;
- role/tenant/privacy/error/idempotency rows;
- existing legacy behavior suite required by the changed scope.

**Pass:** all mandatory contract rows pass on all applicable implementations; zero undocumented API drift.

**Artifacts:** contract matrix, normalized result/error/effect diff, OpenAPI diff, test reports.

## Stage 5 — `parity`

**Purpose:** Execute Gate E and prove equivalent store/adapter semantics before migration authority changes.

**Required checks**

- SQLite and PostgreSQL use the same logical fixtures and repository contract suite;
- result, semantic error, persisted effect, ordering, transaction, concurrency, and tenant-isolation comparison;
- reference snapshot/version and outbox/inbox comparison;
- known-difference register validation.

**Pass:** zero unexplained semantic difference; known-difference register is empty for an adapter/store proposed as authoritative.

**Artifacts:** adapter/database-version matrix, normalized parity diff, data hashes/counts, transaction/isolation reports.

**Current blocker:** Attendance `hasActiveSettlement` semantics differ between SQLite and PostgreSQL.

## Stage 6 — `integration`

**Purpose:** Verify real boundaries with isolated services and databases.

**Required checks**

- server startup and clean database bootstrap in test mode;
- SQLite integration suite;
- PostgreSQL integration suite for approved Attendance scope;
- authentication/session/RBAC and two-tenant isolation;
- transaction rollback, outbox/inbox, worker/provider fakes, export behavior;
- readiness dependency behavior;
- no production network call.

**Pass:** all required integration scenarios pass with clean setup/cleanup and no leaked state.

**Artifacts:** test reports, service logs, database/schema hashes, environment definition.

## Stage 7 — `smoke`

**Purpose:** Validate critical supported user/API flows through a production-like assembled process.

**Required checks**

- health and readiness;
- static frontend and private-file denial;
- login/session/logout and critical role restrictions;
- tenant-scoped core workflows;
- Attendance legacy/strangler route behavior;
- queue processing with controlled provider fake;
- critical security headers and malformed-input resilience.

**Pass:** every approved critical smoke scenario passes; no 5xx, leak, or unexplained log error.

**Artifacts:** scenario report, application logs, request correlation/evidence, environment hash.

## Stage 8 — `migration`

**Purpose:** Prove migration tools are replayable, reconcilable, cohort-safe, and rollback-ready. This stage does not authorize Workforce or a production cutover.

**Required checks**

- Attendance backfill and repeat replay;
- relay/outbox/inbox idempotency and interruption recovery;
- parity/reconciliation with zero unexplained mismatch;
- explicit tenant cohort and one-authority configuration validation;
- reverse relay and rollback drill in a production-like environment;
- stop trigger and recovery evidence;
- temporary component owner/removal condition validation.

**Pass:** replay and rollback tests pass; objective thresholds are met; authority is unambiguous; zero unexplained data mismatch.

**Artifacts:** migration/replay report, checkpoints, counts/hashes, parity results, rollback timing and reconciliation evidence.

## Stage 9 — `release`

**Purpose:** Aggregate immutable evidence and decide whether a candidate may proceed to a separately authorized release process.

**Required checks**

- all required upstream stages green for the candidate commit;
- Gates A through F consolidated result;
- zero expired exception;
- architecture checklist, contract compatibility, security, operations, backup/restore, and rollback evidence present;
- artifact provenance and commit/configuration hashes match;
- required owner approvals recorded by role;
- current Phase/Module/Migration gate explicitly authorizes the proposed scope.

**Pass:** all mandatory inputs pass and Release Authority records `Passed` or `Passed with non-blocking actions` under governance. A green pipeline alone does not authorize migration or deployment.

**Artifacts:** signed release evidence index, consolidated gate report, SBOM/dependency inventory if adopted, approval record.

## Pull Request Versus Scheduled Execution

| Frequency | Required scope |
|---|---|
| Every pull request | lint, unit, full architecture graph/gates, affected contract suites, existing behavior regression, integration/smoke as required by risk |
| Main branch | all PR checks plus full contract/integration/smoke and immutable artifacts |
| Nightly/on demand | PostgreSQL parity, migration replay, rollback drill, dependency/security scans when too costly for PR |
| Release candidate | all nine stages against the exact candidate commit and production-like versions |

Nightly checks that are mandatory for release remain release blockers. Their cost does not make them optional.

## Caching and Reproducibility

- dependency cache keys include lockfile, runtime, and tool versions;
- databases are fresh or restored from a versioned sanitized fixture;
- architecture results are never reused across a changed source or manifest hash;
- full graph/table scans run even when PR annotations use changed-file focus;
- artifacts identify commit, branch, command, runner image, timezone, locale, database versions, and configuration hash;
- timestamps do not affect expected business fixtures.

## Secrets, Permissions, and Artifacts

- CI receives least-privilege ephemeral credentials;
- provider/network tests use fakes unless an approved isolated sandbox is required;
- forks/untrusted changes cannot access protected secrets;
- logs and artifacts redact credentials, tokens, session IDs, and personal data;
- required-check configuration and baseline manifests are protected from ordinary bypass;
- retention duration and artifact store are approved before gates become mandatory.

## Staged Activation

1. **Observe:** run scanners locally and publish reports without merge blocking.
2. **Warn:** execute on every PR; require review of every finding.
3. **Block growth:** approve baseline; new/high-confidence violations and behavior/contract regressions fail.
4. **Mandatory gates:** Gates A–F and release evidence become protected required checks.

Promotion requires stable output, signed baseline, fixture coverage, named owners, tested exception flow, and a scanner rollback procedure. Rollback of one defective rule does not disable unrelated checks.

## Implementation Blockers

Before Stage 1 can be considered operational:

1. select CI provider and branch-protection authority;
2. appoint the operational CI/enforcement owner;
3. approve pinned lint/parser/SQL/OpenAPI toolchain;
4. approve machine-readable manifest locations and schemas;
5. record baseline commit and signed semantic fingerprints;
6. correct the non-deterministic Teacher Management test fixture;
7. define artifact retention and protected-check names;
8. implement and validate scanner fixtures against current findings.

These tasks are enforcement implementation, not module migration.
