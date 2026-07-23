# DONOCRM Contract Testing Strategy

Status: Mandatory test design; implementation pending
Effective date: 2026-07-22
Scope: Existing behavior and approved Attendance migration only
Owners: Quality Owner, affected Module Owner, Data Owner, and Architecture Owner

## Purpose

Contract tests prove that architectural replacement preserves supported semantics across use cases, adapters, HTTP compatibility, replay, and rollback. They do not create new requirements, authorize a module migration, or substitute for domain/unit, integration, security, or operational tests.

The current legacy behavior, OpenAPI, accepted decisions, database effects, and approved migration runbooks are the sources of expected behavior. An undocumented ambiguity is escalated to Product/Architecture governance; a test must not silently invent the answer.

## Contract Evidence Model

Every contract row records:

- contract ID, owner, version/status, and source evidence;
- preconditions, actor/tenant/branch context, input, and operation;
- normalized output or semantic error;
- persisted effects, emitted events/messages, and prohibited effects;
- ordering, privacy projection, idempotency, transaction, and concurrency expectations;
- applicable legacy/SQLite/PostgreSQL/rollback implementations;
- fixture, cleanup, command, environment, and evidence artifact.

Driver messages, stack traces, generated timestamps/IDs, and database row representation are normalized unless the supported contract explicitly includes them. Semantic meaning is never normalized away.

## Test Pyramid and Ownership

| Suite | Contract owner | Primary comparison | Required before |
|---|---|---|---|
| Application contract | Module Owner | Use-case semantic behavior independent of adapters | Module Readiness and every application change |
| Repository contract | Module/Data Owner | Port semantics across adapter implementations | Adapter merge and authority eligibility |
| SQLite/PostgreSQL parity | Data/Module Owner | Equivalent results, effects, errors, and isolation | PostgreSQL canary/cutover |
| HTTP compatibility | Product/Module Owner | Supported request/response/status/privacy contract | Route dispatch change and release |
| Migration replay | Data/Operations Owner | Repeatable backfill/relay/reconciliation outcome | Canary and migration cutover |
| Rollback validation | Operations/Data/Module Owner | Restored authority and reconciled writes | Canary and release gates |

## Application Contract Tests

Application contracts execute a public command/query/use case with in-memory or deterministic fake ports. They validate business semantics without HTTP, SQL, provider, environment, or migration dependencies.

Required dimensions per operation:

1. authorized success;
2. required-field and invariant validation;
3. not-found and conflict semantics;
4. tenant, actor, role, and applicable branch isolation;
5. idempotent retry/reuse behavior where declared;
6. transaction intent and prohibited partial effects;
7. dependency failure mapping and retry/compensation intent;
8. stable DTO and privacy projection;
9. deterministic clock/ID behavior;
10. event/publication intent without executing a provider.

Pass requires the use case to run without a concrete database, HTTP object, global request context, provider client, or store router. Existing Attendance use cases need contract rows for lesson eligibility, complete roster, corrections, closed finance periods, reason semantics, alerts, and audit intent.

## Repository Contract Tests

One shared suite is defined per focused repository/port. Every equivalent SQLite, PostgreSQL, fake, or future adapter runs the same suite against isolated fixtures.

The suite verifies:

- create/read/update semantics and stable DTO mapping;
- missing-row behavior;
- uniqueness/conflict and optimistic/concurrent update behavior;
- transaction commit and injected failure rollback;
- idempotency and replay behavior;
- tenant isolation on base tables and every join;
- ordering, pagination/filter semantics, null/default handling, and precision;
- audit/outbox effects when they belong to the port contract;
- connection/driver failure translation to semantic failures;
- cleanup leaves no cross-test or cross-tenant state.

A broad repository that spans multiple contexts cannot be legitimized by a passing suite. Port cohesion and table ownership remain independent architecture gates.

## SQLite/PostgreSQL Parity Tests

Parity tests seed logically identical tenant-scoped datasets in both stores, execute the same repository contract commands/queries, and compare normalized results and persisted effects.

Mandatory comparison categories:

| Category | Compared evidence |
|---|---|
| Results | DTO values, ordering, filtering, defaults, date/time and numeric meaning |
| Errors | semantic code/category, conflict/not-found behavior, no driver leakage |
| Effects | rows inserted/updated/retained, audit/history, outbox/inbox, versions |
| Transactions | all-or-nothing outcome under injected failure |
| Concurrency | locks/version conflicts and idempotent duplicate handling |
| Isolation | identical two-tenant denial/no-leak behavior |
| References | mirrored snapshot/version handling and missing/stale reference behavior |

The current `hasActiveSettlement` difference is a mandatory parity failure: SQLite evaluates `lesson_financial_settlements`, while PostgreSQL returns a constant. No PostgreSQL Attendance authority expansion may pass Gate E until the approved contract produces equivalent semantics.

Parity thresholds for business correctness are exact unless governance explicitly defines a numeric tolerance for non-semantic metrics. Record-count, state, money, tenant, and authorization mismatches have zero tolerance.

## HTTP Compatibility Tests

HTTP compatibility tests run the existing server boundary and compare the supported unversioned `/api` contract against OpenAPI and recorded behavior.

They cover:

- method/path and route precedence, including strangler fallback;
- authentication, role, tenant, status, and permission behavior;
- request fields, coercion/validation, body-size and malformed input;
- response status, content type, schema, field names, null/default behavior, and ordering;
- semantic error status/code/message policy;
- privacy-sensitive field omission by actor role;
- cookie/session behavior and required security headers;
- idempotency keys and duplicate requests;
- export filename/content type and workbook schema where supported;
- legacy-versus-target response diff for shadowed routes.

Additive documentation corrections may be accepted without behavior change. Any incompatible result is blocking while ADR-008 remains Proposed unless separately authorized through governance.

## Migration Replay Tests

Migration replay tests prove that backfill, outbox/inbox, relay, and reconciliation operations are repeatable and recover safely after interruption.

Required scenarios:

1. empty target replay;
2. partially populated target replay;
3. duplicate delivery and duplicate command;
4. interruption before and after checkpoint/commit;
5. out-of-order event where supported or explicit rejection where not;
6. stale and missing reference snapshot;
7. poison/terminal record with observable failure state;
8. two-tenant cohort isolation;
9. re-run after repair;
10. source/target reconciliation with zero unexplained mismatch.

Evidence includes source count/hash, target count/hash, checkpoint, event IDs/versions, retries, terminal failures, duration, tool/configuration version, and reconciliation result. Replay must not create a second authority or synchronous request-path dual write.

## Rollback Validation Tests

Rollback tests execute in a production-like environment before canary authority transfer. A written procedure without execution evidence does not pass.

Required scenarios:

- route/store authority returns to the approved legacy path;
- writes accepted during the canary/rollback window are reverse-relayed or reconciled exactly once;
- source state, target state, audit/history, and migration inbox/outbox agree;
- sessions, permissions, tenant isolation, and supported HTTP behavior remain valid;
- queued/retried work is not lost or duplicated;
- rollback is safe after partial relay failure;
- readiness and operational alerts identify the resulting authority;
- a forward retry after rollback is possible or explicitly prohibited with reason.

Pass requires objective stop/rollback triggers, named operator, measured recovery time, zero unexplained data mismatch, and a signed rehearsal report. The rollback window remains open until the Migration Cutover Gate closes it.

## Test Data and Determinism

- clocks and IDs are injected or fixtures derive dates from one frozen test clock;
- no hardcoded date may become invalid relative to a dynamically created entity;
- each test owns isolated tenant IDs and database state;
- money uses exact approved semantics; floating tolerance cannot mask ledger mismatch;
- secrets and production personal data are prohibited in fixtures/artifacts;
- database versions and schema/migration hashes are recorded;
- retries and concurrency tests use bounded deterministic controls;
- cleanup failures fail the suite.

The current Teacher Management regression fixture combines a relative group start date with a hardcoded lesson date and can become invalid over time. It must be corrected as test infrastructure before a clean full-suite baseline can be approved; no runtime behavior change is implied.

## CI Evidence and Failure Policy

Each suite publishes JUnit or equivalent machine-readable results plus the contract matrix, environment/tool versions, configuration hash, and normalized diff artifact.

Failures are never updated away by copying target output into expected fixtures. Resolution must be one of:

1. correct implementation to the already approved contract under separately authorized work;
2. correct a demonstrably defective/non-deterministic test without changing runtime behavior;
3. obtain Product/Architecture approval for a contract decision;
4. record an exact, expiring non-security exception where governance permits it.

Skipped, flaky, quarantined, unknown, or adapter-specific omitted contract rows fail migration authority and release gates.
