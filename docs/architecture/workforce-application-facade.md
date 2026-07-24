# Workforce Public Application Facade

Status: WF-EXT-03 completed; target contracts implemented, runtime activation disabled

Decision date: 2026-07-24

Next ordered increment: WF-EXT-04

Implementation manifest SHA-256:
`6d7d3ca9decfcccd47127788c683ef4674ae62fdd53ba44a465cc0d95999bb64`

Live extraction state SHA-256:
`c4989137c2f1b31986438d9367851f3c4d42e14ab3432b29ca6962489b265b3c`

## Decision

**WF-EXT-03: PASSED.**

One `WorkforceApplication` facade now implements the two approved public surfaces:
the ten-operation HTTP compatibility Application and the minimum Teacher reference
Application. Coverage is 11/11 public contracts.

The facade accepts only verified actor/service contexts and canonical inputs. Every
operation returns an immutable typed `Result`; expected outcomes use the closed
semantic error catalog, provider/unknown outcomes map to the technical union, and
incomplete keyed projections fail the whole result rather than returning partial
data.

## Domain and Focused Ports

The target Domain implements Teacher lifecycle/profile invariants and Working Hour
weekday/time/overlap invariants. The dependency boundary contains all 18/18
approved focused ports with all 32/32 methods:

- five owned repository/query ports;
- eleven provider anti-corruption ports;
- two system clock/ID ports.

The facade constructor rejects a missing dependency or method before any use case
can execute. Domain/Application source has no legacy service/repository/database
dependency and contains no SQL.

## Executable Evidence

Three PRE-13 target suites are now implemented:

| Suite | Result |
|---|---:|
| `WF-TEST-SUITE-01` — Domain | 6/6 |
| `WF-TEST-SUITE-02` — Application | 12/12 |
| `WF-TEST-SUITE-05` — system ports | 3/3 |

The combined result is 21/21 cases passing and 3/10 target suites implemented.
The PRE-13 manifest remains the immutable planning-time approval showing the
original missing state; this increment manifest is the implementation evidence.
The other seven suites remain blocking.

Application tests prove admin/self authorization, Teacher privacy, Group
`monthlyFee` omission for self view, complete projection enforcement, provider
failure mapping, lifecycle/audit ordering, credential redaction, Working Hour
adjacency/overlap, empty delete `teacherName` compatibility, and minimum reference
DTO behavior.

## Runtime Boundary

After WF-EXT-03:

- legacy remains the sole runtime authority;
- public facade implementations are 1, but Bootstrap instances are 0;
- owned/provider adapter implementations and bindings remain 0;
- HTTP adapters, route bindings, shadow routes, and target routes remain 0;
- production cohorts and authority transfers remain 0;
- schema, table ownership, and legacy source remain unchanged;
- `WF-CONS-03B`, `WF-CONS-04B`, `WF-CONS-05A`, and `WF-CONS-05B` remain explicit
  legacy holds.

The existing Bootstrap registration intentionally stays `structure_only`,
`publicApplication: null`, and `activation: disabled`.

## Architecture Transition

`src/modules/workforce/application` is now the approved public path. The executable
configuration hash changes from
`7e17f5d2633a11940c2c9ac625e8818afcd6b5ebac41fcb33e637feab0e734ba`
to
`adde24e84a4f43b7e6771489e574b2ce3f647b558e823a9b70b944d55d1d5d91`.

All 68 approved fingerprints remain unchanged. New findings, active exceptions,
legacy metric changes, and ownership changes are zero.

`npm run architecture:workforce-facade` verifies source fingerprints, exact
contract/port topology, module layers, public path, target suites, live state,
baseline transition, secret/no-partial-result policies, and zero activation. It
runs inside both `architecture:workforce` and required `architecture:enforce`.

Architecture, Workforce Module, Security, and Quality owners approve WF-EXT-03 with
zero temporary exceptions. The next ordered increment is **WF-EXT-04 — introduce
the compatibility SQLite adapter for only the approved owned tables, without a
schema change or route activation**.
