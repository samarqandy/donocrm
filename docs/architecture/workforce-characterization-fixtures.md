# Workforce Legacy Characterization Fixtures

Status: WF-EXT-02 completed; deterministic legacy evidence active, target runtime disabled

Decision date: 2026-07-24

Next ordered increment: WF-EXT-03

Fixture manifest SHA-256:
`8df39a2fd086db79df248b8bd56cbedfd275e8eb958b97e8746300a2dc5ad2ed`

Immutable WF-EXT-02 extraction state SHA-256:
`e89871dc7836bf9470a98928739c90a34197f733132fa827a30ea98f085a65f8`

The hash refers to `architecture/workforce-extraction-state-wf-ext-02.json`.
The live extraction pointer may advance without rewriting this gate.

## Decision

**WF-EXT-02: PASSED.**

All eight fixtures approved in WF-PRE-13 now have executable characterization
evidence. The suite invokes the real legacy `AppService` and `AppRepository` for
tenant, Teacher/Identity lifecycle, and Working Hour behavior, and uses immutable
fixtures for provider, parity, HTTP, and rollback boundaries that do not yet have a
target implementation.

The command is:

```text
npm run test:workforce:characterization
```

Its exact admission result is 8/8 cases passing.

## Deterministic Boundary

- timezone is `Asia/Tashkent`;
- clock is `2026-07-24T06:00:00.000Z`;
- generated IDs use the `wf-test-` sequence;
- tenant identities are `tenant_wf_a` and `tenant_wf_b`;
- every characterization case owns an isolated in-memory SQLite database;
- fixtures use synthetic data only;
- randomness, network calls, sleeps, and timing races are prohibited;
- only generated IDs/timestamps and storage representation may be normalized.

Business fields, ordering, tenant identity, status, semantic errors, privacy,
authorization, audit intent, and side effects are exact comparison fields.

## Covered Fixture Set

| Fixture | Executable evidence |
|---|---|
| `WF-FIX-01` | two-tenant actors, directory isolation, foreign Branch rejection |
| `WF-FIX-02` | Teacher/User creation, username conflict rollback, session invalidation, archive/restore |
| `WF-FIX-03` | complete keyed provider zero projections |
| `WF-FIX-04` | adjacent intervals, overlap conflict, ordering, foreign-tenant Teacher rejection |
| `WF-FIX-05` | ordered provider success and failure scripts |
| `WF-FIX-06` | narrow normalization and two explicit governed deltas |
| `WF-FIX-07` | all ten frozen Workforce HTTP method/path pairs |
| `WF-FIX-08` | rollback/reconciliation states and clean legacy-authority terminal invariant |

## Runtime and Admission Boundary

After WF-EXT-02:

- legacy remains the sole runtime authority;
- Public Application implementations remain 0;
- target ports, adapters, and route bindings remain 0;
- target/shadow routes and production cohorts remain 0;
- schema and table ownership remain unchanged;
- PRE-13 target suites remain 0/10 implemented and blocking;
- no fixture result is represented as target parity.

The existing `structure_only` Bootstrap registration deliberately remains at
WF-EXT-01 because WF-EXT-02 adds test evidence, not a runtime component. The
evolving extraction state advances to WF-EXT-02 while the immutable WF-EXT-01
entry baseline remains independently verifiable.

## Enforcement

`npm run architecture:workforce-fixtures` verifies source fingerprints, the exact
eight-fixture catalog, deterministic controls, ten HTTP pairs, live extraction
state, zero target activation, the unchanged PRE-13 target-suite status, and then
executes the characterization command. It is part of both
`architecture:workforce` and required `architecture:enforce`.

Architecture, Workforce Module, and Quality owners approve WF-EXT-02 with zero
temporary exceptions. The next ordered increment is **WF-EXT-03 — introduce the
approved public Workforce Application facade and focused ports**; it remains
ineligible for routing until its own target suites exist and pass.
