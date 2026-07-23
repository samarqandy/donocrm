# ADR-004: Migration Strategy

- **Status:** Accepted
- **Date:** 2026-07-22
- **Decision owners:** Architecture governance

## Context

DONOCRM must preserve business continuity while replacing centralized legacy boundaries and moving persistence from SQLite to PostgreSQL. The repository's existing migration guide defines an incremental Attendance strangler with shadow reads, backfill, parity checks, canary tenants, a reverse relay, and rollback. It explicitly prohibits synchronous request-path dual writes.

The current application contains active tenant, attendance, payment, Telegram, and finance workflows. A big-bang replacement would couple architecture, behavior, data, and deployment changes into one release.

## Decision

Use an incremental **strangler migration** based on business contexts and reversible tenant cohorts.

Every migrated capability follows an expand–migrate–contract sequence:

1. Establish the module boundary and characterization tests without changing authority.
2. Introduce domain and application contracts around existing behavior.
3. Add new adapters, schema, observability, and compatibility paths.
4. Backfill historical data and verify repeatable parity.
5. Shadow reads or otherwise compare outcomes without affecting users.
6. Canary explicitly selected tenants.
7. Transfer authority only after entry criteria are met.
8. Maintain a tested rollback path and reconcile rollback-period writes.
9. Remove the legacy path only after an agreed observation period and evidence that rollback is no longer required.

For a given tenant and data set, exactly one store or module is authoritative at any instant. Synchronous request-path dual writes are forbidden. Required propagation uses durable, idempotent asynchronous delivery such as an outbox/inbox or the documented temporary reverse relay. Compatibility paths are temporary and must have an owner and removal criterion.

The repository's documented initial migration order—Attendance, Teachers, Groups/Schedules, Students/Guardians, Telegram, Payments—remains the starting hypothesis, not an irrevocable schedule. Changes require evidence and architecture review.

## Consequences

### Positive

- Releases remain small, observable, and reversible.
- Data parity can be established before authority changes.
- Architecture can evolve while users continue current workflows.
- Production learning can alter later migration sequencing.

### Negative

- Legacy and target paths coexist, increasing temporary complexity.
- Backfill, parity, relay, and reconciliation tooling require operational ownership.
- Migration takes longer than a replacement cutover.
- Incorrect authority tracking can create divergence even without synchronous dual writes.

### Required governance

Each phase must document scope, authority, entry and exit criteria, tenant cohort, metrics, reconciliation, rollback trigger, rollback steps, and legacy-removal conditions. No phase may remove a rollback mechanism merely to simplify the transition.

## Alternatives

### Big-bang rewrite and cutover

Rejected because it offers insufficient isolation and rollback for the current interconnected operational data.

### Synchronous dual writes

Rejected because partial failures create ambiguous authority and user-visible request failures.

### Permanent dual persistence

Rejected because two lasting authorities create reconciliation and ownership ambiguity.

### Change-data-capture-only migration

Not selected as the general strategy. CDC may be an adapter within a migration, but it does not replace explicit business parity, cutover, and rollback decisions.
