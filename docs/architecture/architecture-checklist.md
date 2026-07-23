# DONOCRM Architecture Checklist

Status: Mandatory for architecture-relevant pull requests and releases
Related documents: [architecture-governance.md](architecture-governance.md), [module-dependencies.md](module-dependencies.md), [coding-standards.md](coding-standards.md)

## How to Use This Checklist

Copy or link this checklist in the pull request and release evidence. For each applicable item, provide a file, test, command result, schema/contract diff, metric, or approved decision. For a non-applicable item, record `N/A` and a verifiable reason. An unchecked item with no approved exception is not complete.

The Change Author completes the checklist. The Module Owner verifies module items; required specialist reviewers verify their concerns. Reusing evidence is allowed, but an assertion without evidence is not.

## Architecture

- [ ] The change names exactly which bounded context or platform capability owns it; evidence: module definition or context-map link.
- [ ] Every changed responsibility is listed under the owner's `Owns` section and absent from conflicting owners; evidence: module/context diff.
- [ ] The change conforms to all linked Accepted ADRs; evidence: ADR impact list.
- [ ] Any new system-wide decision has an Accepted ADR before merge; evidence: ADR link and status.
- [ ] Current-state and target-state descriptions are explicitly distinguished; evidence: document/diagram labels.
- [ ] No unapproved runtime, database, framework, or deployment topology is introduced; evidence: dependency and deployment diff.
- [ ] No legacy exception is expanded without a valid exception record; evidence: exception ID or dependency diff showing none.

## Dependency Rules

- [ ] An automated dependency check or reviewable import graph shows no forbidden edge from Domain or Application to outer layers.
- [ ] No module imports another module's infrastructure, repository implementation, private domain object, or private presentation code; evidence: dependency scan.
- [ ] Cross-module imports resolve only through documented public facades/contracts; evidence: import paths and module definition.
- [ ] The module dependency graph remains acyclic; evidence: architecture test/graph output.
- [ ] Bootstrap is the only location selecting concrete adapters; evidence: construction/configuration diff.
- [ ] No migrated capability introduces a dependency on legacy `AppService` or `AppRepository`; evidence: search result.

## Layer Separation

- [ ] Domain code can load and execute without HTTP, database drivers, filesystem, network, provider SDKs, or environment access; evidence: isolated tests/dependency scan.
- [ ] Application code depends only on its Domain, its ports, and approved Shared Kernel items; evidence: dependency scan.
- [ ] Controllers/workers/scripts only validate/map input, invoke use cases, and map output/errors; evidence: review of changed adapters.
- [ ] SQL and database mapping exist only in the owning persistence/reporting adapter; evidence: search/diff.
- [ ] Provider-specific payloads and failures are translated at adapter boundaries; evidence: adapter contract tests.
- [ ] Composition code contains no business decisions; evidence: bootstrap diff.

## DDD

- [ ] Business terminology in the change matches the owning context's documented ubiquitous language.
- [ ] Every entity has explicit identity, lifecycle, and owned invariants; evidence: module definition and domain tests.
- [ ] Aggregate roots and transaction boundaries are named; evidence: module definition.
- [ ] Value objects enforce meaningful validity/equality and are not transport DTOs or rows; evidence: domain tests.
- [ ] Cross-context references use stable identities or published snapshots, not foreign domain entities; evidence: contract/schema review.
- [ ] Domain events are past-tense committed facts with documented owner and version; evidence: event catalog.
- [ ] A Domain Service exists only where policy cannot naturally belong to an entity/value object; evidence: documented rationale.

## SOLID

- [ ] Each changed class/function has one cohesive reason to change within its layer; evidence: responsibility review.
- [ ] New behavior extends through an existing stable port or an explicitly reviewed contract instead of conditionals distributed across consumers.
- [ ] Every adapter implementation satisfies the same port contract tests and failure semantics.
- [ ] Interfaces expose only operations required by their consumers; evidence: no unrelated methods in changed ports.
- [ ] Use cases depend on abstractions they own rather than concrete infrastructure; evidence: constructor/import review.

## Use Cases

- [ ] Every changed command or business query maps to one named use case in the module definition.
- [ ] The use case receives tenant and authenticated actor context from a trusted boundary; evidence: signature and tests.
- [ ] Preconditions, authorization, outcome, semantic failures, and side effects are documented and tested.
- [ ] The use case returns application DTOs/results rather than HTTP responses or database rows.
- [ ] Retryable commands define and test idempotency keys, fingerprints, and duplicate outcomes.
- [ ] No alternate controller, worker, import, or script path reimplements the same business policy.

## Repository Rules

- [ ] Each changed repository belongs to exactly one module and one aggregate/query responsibility.
- [ ] Every tenant-owned query and mutation applies tenant scope and tests cross-tenant identifiers.
- [ ] Query repositories return bounded, purpose-specific projections; evidence: explicit limits/pagination tests.
- [ ] Repository ports contain no HTTP, provider-delivery, unrelated audit, or cross-context workflow methods.
- [ ] Active adapter implementations pass one shared repository contract suite.
- [ ] No consumer accesses another module's tables or imports its repository.
- [ ] Table ownership in migrations/schema matches the module definition.

## Ports & Adapters

- [ ] Each outward capability used by Application is represented by a consumer-owned port.
- [ ] Every concrete adapter declares which port and contract version it implements.
- [ ] Environment/store/provider selection occurs outside Domain and Application.
- [ ] Adapter errors are translated into stable semantic categories and tested.
- [ ] Timeouts, retries, idempotency, and terminal-failure behavior are specified for external adapters.
- [ ] Migration adapters are identified as temporary with an owner and removal condition.

## Transactions

- [ ] Every mutation documents its atomic boundary and aggregate/context owner.
- [ ] No external network call executes inside a database transaction; evidence: sequence/test review.
- [ ] Reliable side effects are committed as durable intent with the business change when required.
- [ ] Concurrency conflicts are prevented by constraints/version checks and have deterministic outcomes.
- [ ] Financial and historical corrections use approved reversal/revision behavior rather than destructive overwrite.
- [ ] No synchronous request-path dual write exists; evidence: call sequence and store-selection tests.
- [ ] Cross-context consistency uses an Accepted ADR or approved temporary exception.

## Error Handling

- [ ] Domain/Application failures contain no HTTP status, SQL/driver code, provider payload, or localized presentation text.
- [ ] Interface adapters map every documented semantic failure to the supported protocol contract.
- [ ] Client responses expose no stack trace, secret, internal query, or provider error body.
- [ ] Expected validation, authorization, not-found, conflict, concurrency, and unavailability paths are independently tested as applicable.
- [ ] Every catch block recovers, translates, adds meaningful context, or rethrows; evidence: diff review.

## Security

- [ ] Authentication is required on every non-public operation and its absence is tested.
- [ ] Authorization checks actor, role/permission, tenant, and branch scope where applicable.
- [ ] Tenant-isolation tests use at least two tenants and attempt cross-tenant reads and writes by identifier.
- [ ] Database relationships cannot create cross-tenant references where tenant-owned entities are involved; evidence: constraints/tests.
- [ ] Secrets are obtained from approved configuration and never committed, returned, or logged.
- [ ] Personal and financial fields are minimized and explicitly authorized in every projection/export.
- [ ] Security-significant state changes emit the required immutable audit evidence.
- [ ] Dependency/provider changes have a reviewed security and data-exposure impact.

## Logging

- [ ] Operational logs are structured and include module, operation, correlation ID, and tenant ID when available.
- [ ] Logs do not contain passwords, tokens, cookies, keys, full message payloads, or unnecessary personal/financial data.
- [ ] Errors retain stable internal categories while sensitive provider/database details remain protected.
- [ ] Workers expose claim, retry, backlog/lag, terminal failure, and graceful-shutdown evidence as applicable.
- [ ] Business audit records are separate from operational logs and include actor, tenant, action, entity, and time where required.

## Testing

- [ ] Domain invariants and state transitions pass without concrete infrastructure.
- [ ] Use-case tests cover authorized success, authorization failure, business failure, and infrastructure failure.
- [ ] Repository contract tests pass for every active adapter.
- [ ] Integration tests exercise real constraints, transactions, and durable messaging behavior as applicable.
- [ ] HTTP contract tests verify validation, authorization, error mapping, and response compatibility.
- [ ] Tenant-isolation tests pass with at least two tenant data sets.
- [ ] Migration tests cover backfill repeatability, parity, replay/reordering, reconciliation, and rollback where applicable.
- [ ] Critical end-to-end workflows affected by the change pass through supported interfaces.
- [ ] Test commands, versions, results, and known exclusions are attached as review evidence.

## Documentation

- [ ] The module definition reflects changed ownership, use cases, contracts, schema, dependencies, events, tests, and migration state.
- [ ] Bounded-context and dependency diagrams remain accurate after the change.
- [ ] Significant decisions are recorded in ADRs with a permitted status.
- [ ] Temporary paths/exceptions include named owner, expiry or removal condition, and tracking evidence.
- [ ] Repository-relative links resolve and no document references a superseded rule as current.
- [ ] User-visible or operator-visible behavioral changes have maintained documentation owned by the relevant authority.

## OpenAPI

- [ ] Every added or changed HTTP route appears in the authoritative OpenAPI contract.
- [ ] Request, response, error, authentication, pagination, and idempotency semantics match contract tests.
- [ ] Contract diff tooling or manual schema comparison classifies the change as additive, compatible, deprecated, or breaking.
- [ ] A breaking API change has approved versioning, consumer migration, deprecation, and rollback evidence.
- [ ] Existing `/api` behavior remains compatible while ADR-008 is Proposed, unless a separately accepted decision authorizes change.

## Migration

- [ ] The migration names current and target authority for every affected tenant/data set.
- [ ] Backfill is resumable/idempotent and its checkpoints and failure behavior are tested.
- [ ] Parity criteria, tolerances, comparison period, and query scope are approved before canary.
- [ ] Canary tenants are explicitly selected; absence from the cohort cannot activate the target path.
- [ ] Observability distinguishes legacy, shadow, canary, and authoritative paths.
- [ ] Rollback triggers, responsible operator, steps, reconciliation, and validation are documented and rehearsed.
- [ ] No legacy write path is removed before the rollback/retention gate closes.
- [ ] Schema contraction occurs only after zero-use and backup/restore evidence.

## Performance

- [ ] Every changed collection/query has an explicit maximum, pagination, deterministic order, and reviewed access path.
- [ ] Query-plan or representative benchmark evidence exists for changed high-volume database access.
- [ ] No changed request performs an unbounded per-item database or provider call pattern; evidence: query/call counts.
- [ ] External calls define timeout and bounded retry behavior and do not hold scarce transactional resources.
- [ ] Worker concurrency, batch size, backpressure, and shutdown behavior are bounded and configurable.
- [ ] Performance evidence is compared with an approved threshold; if no threshold exists, release approval records that missing decision.

## Scalability

- [ ] Tenant data growth and tenant-count assumptions used by the change are stated rather than inferred.
- [ ] Application state required across requests is not confined to one process unless explicitly accepted.
- [ ] Jobs, caches, idempotency, sessions, and locks behave correctly with multiple application/worker processes where that topology is supported.
- [ ] Module contracts do not require direct table access that would prevent later extraction.
- [ ] Large exports, reports, and background work have bounded memory/runtime and observable progress or an approved limit.
- [ ] Database indexing, connection use, retention, and partitioning assumptions are documented for affected high-growth tables.

## Pull Request Decision

| Field | Required record |
|---|---|
| Change classification | `<Local / Contract / Architectural / Breaking / Emergency>` |
| Affected modules | `<names>` |
| Evidence location | `<PR links/artifacts>` |
| Approved exceptions | `<IDs or None>` |
| Module Owner decision | `<Passed / Required Action / Blocking>` |
| Specialist decisions | `<role and decision>` |
| Unresolved items | `<items or None>` |

## Release Decision

- [ ] All included PR checklists passed or have non-expired approved exceptions.
- [ ] Release scope and affected module/contract versions are recorded.
- [ ] Database migrations and rollback/restore procedures were verified in a production-like environment.
- [ ] Security, tenant-isolation, data, operations, and compatibility evidence is complete for affected scope.
- [ ] Required dashboards/alerts and operator runbooks are available before rollout.
- [ ] Canary/rollout stages, stop conditions, decision owners, and communication channels are recorded.
- [ ] Every deprecation and known risk has an owner and approved treatment.
- [ ] The release authority records `Passed`, `Passed with non-blocking actions`, or `Failed` with evidence.
