# Workforce Extraction Entry

Status: WF-EXT-01 completed; structure registered, runtime activation disabled  
Decision date: 2026-07-24  
Next ordered increment: WF-EXT-02

State manifest SHA-256: `a4cb5d5c339a6a507f797ee2d0829026b47d0619dad024fe94b589d1c19b89cc`

## Decision

**WF-EXT-01: PASSED.**

The approved `src/modules/workforce/` source root now exists and Workforce is
registered in Bootstrap composition as a `structure_only` module. The registration
is immutable metadata; it has no public Application instance, adapters, routes, or
target authority.

## Exact Structure

The module directory contains only `README.md`. Empty Domain, Application,
Infrastructure, and HTTP directories were deliberately not created. This preserves
the smallest truthful module shape until later increments introduce real
responsibilities.

Bootstrap exposes one exact registration:

| Field | Value |
|---|---|
| Module | `workforce` |
| Increment | `WF-EXT-01` |
| Lifecycle | `structure_only` |
| Source root | `src/modules/workforce` |
| Public Application | `null` |
| Adapter bindings | 0 |
| Route bindings | 0 |
| Default authority | `legacy` |
| Activation | `disabled` |

`src/bootstrap/stranglerContainer.js` publishes this metadata through
`moduleRegistrations()`. It does not register a Workforce HTTP matcher with
`StranglerRouter` and does not construct any Workforce use case or adapter.

## Enforcement Transition

`architecture/modules.yaml` now records Workforce as `migrating` with the exact
source root. The executable architecture configuration hash changes from
`2732cc47b0b0913cf35aa4c176750c9cd4abafe16657d19fc2e00c9ef7b7f15d`
to `7e17f5d2633a11940c2c9ac625e8818afcd6b5ebac41fcb33e637feab0e734ba`.

The approved 68 legacy fingerprints, legacy metrics, table ownership, and empty
exception register remain unchanged. The hash change records the authorized module
lifecycle transition only.

## Runtime Boundary

After WF-EXT-01:

- legacy remains the sole authority for all tenants and operations;
- public Application implementations remain 0;
- adapter and route bindings remain 0;
- shadow and target routes remain 0;
- production cohort tenants and authority transfers remain 0;
- schema changes remain 0;
- PRE-13 implemented target suites remain 0/10;
- all four PRE-11 legacy-hold variants remain target-ineligible.

WF-EXT-01 does not authorize a route, target dispatch, production change, schema,
adapter, or business behavior.

## Verification

`npm run architecture:workforce-structure` verifies the exact module root,
composition registration, lifecycle manifest, baseline transition, zero-runtime
state, immutable registration, documentation hash, approvals, and next increment.
The verifier is part of the required `architecture:enforce` chain.

## Approval and Next Work

Architecture, Workforce Module, Operations, and Quality owners approve WF-EXT-01.
The next ordered task is **WF-EXT-02 — add characterization fixtures for focused
contracts**. It must reproduce legacy behavior and cannot activate target routing.
