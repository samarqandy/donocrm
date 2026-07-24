# Workforce Executable Test and Parity Plan

Decision ID: WF-PRE-13

Status: Approved

Decision date: 2026-07-24

Plan version: `1.0.0`

## Decision

The Workforce extraction now has a complete executable test and parity specification. The plan defines exact owners, fixtures, future files, commands, expected outcomes, coverage closures, failure rules, evidence artifacts, and activation gates.

The authoritative plan is [workforce-test-parity-plan.json](../../architecture/workforce-test-parity-plan.json), SHA-256:

`e1d90943abdd0ba94fce59f4ae9db6b476b7eb47f7b0fd8ae54cf41b078520a6`

It covers:

- 10 executable suite specifications and eight deterministic fixtures;
- 69/69 applicable PRE-06 behavior IDs plus three cross-cutting cases;
- 11/11 public contracts, including five new Teacher-reference test IDs;
- 18/18 focused ports, all 32 port methods, and all nine adapter groups;
- 14/14 consistency variants;
- 11 parity rows with zero semantic tolerance and only two governed target deltas;
- seven rollback/reconciliation scenarios;
- five risks, seven guards, and zero temporary exceptions.

Run the structural verifier:

```bash
npm run architecture:workforce-test-plan
```

This gate approves the plan. Target suite implementation missing remains explicit: zero planned suite commands currently exist or pass. WF-PRE-13 enables zero target routes and changes no runtime source, schema, table, adapter, migration, or production behavior.

## Evidence Classification

The existing `Teacher Management` backend scenario, smoke suite, P0 hardening, and architecture enforcement remain valuable legacy regression evidence. They are not focused proof for:

- target Workforce Domain invariants;
- the 11 public Application contracts through fake ports;
- the 18 focused port contracts;
- provider anti-corruption adapters;
- target tenant isolation;
- legacy-target semantic parity;
- PRE-11 unknown/partial outcomes;
- PRE-12 Audit acceptance failure;
- route fallback and reconciliation.

The plan does not upgrade partial legacy evidence into target readiness by assertion. Every new layer has its own blocking suite and exact activation point.

## Deterministic Test Environment

All planned suites use:

- Node.js 24;
- `Asia/Tashkent`;
- fixed clock `2026-07-24T06:00:00.000Z`;
- deterministic IDs prefixed `wf-test-`;
- tenants `tenant_wf_a` and `tenant_wf_b`;
- synthetic actors, credentials, projections, and database records;
- isolated process-owned temporary SQLite databases;
- deterministic fakes for provider success/failure/timeout;
- explicit barriers for concurrency, never sleeps or probabilistic races;
- no network or production data.

Cleanup is part of the assertion. Leaked database state, unresolved barriers, provider scripts, sessions, or temporary files fail the suite.

## Approved Fixtures

| ID | Fixture | Principal proof data |
|---|---|---|
| WF-FIX-01 | Two-tenant actor and Branch | Two tenants, Admin/Teacher actors, sessions, active/inactive/default/foreign Branches |
| WF-FIX-02 | Teacher lifecycle and Identity | Active/inactive Teachers, portal variants, duplicate username, sessions, exact provider snapshots |
| WF-FIX-03 | Profile provider projection | Group/Schedule/Lesson/Student keyed projections including explicit zero rows |
| WF-FIX-04 | Working Hour boundary/concurrency | Adjacent/overlap intervals, inactive Teacher, foreign-tenant same ID, competing inserts |
| WF-FIX-05 | Provider fault/outcome | Success, semantic failure, pre-dispatch unavailable, post-dispatch timeout, commit-before-acknowledgement |
| WF-FIX-06 | Legacy-target parity | Identical inputs, canonical expected outputs/effects, two governed-delta cases |
| WF-FIX-07 | HTTP compatibility | Ten routes, OpenAPI, roles/sessions, malformed/oversized bodies, shadow hooks |
| WF-FIX-08 | Rollback/reconciliation | Route marker, known/unknown outcomes, Audit intent states, correlation evidence |

Fixture manifests record the fixed clock, ID sequence, tenant IDs, schema/config hash, and cleanup result.

## Executable Suite Catalog

The commands are exact future entrypoints. A named suite must be implemented at its planned path and pass from a clean checkout before the corresponding activation.

| ID | Scope | Command | Required before |
|---|---|---|---|
| WF-TEST-SUITE-01 | Teacher and Working Hour Domain | `node --test tests/workforce/domain/*.test.js` | WF-EXT-03 |
| WF-TEST-SUITE-02 | 11 public Application contracts | `node --test tests/workforce/application/workforce-application.contract.test.js` | WF-EXT-03 |
| WF-TEST-SUITE-03 | Five owned SQLite ports | `node --test tests/workforce/contracts/owned-sqlite.contract.test.js` | WF-EXT-04 |
| WF-TEST-SUITE-04 | Eleven provider ACL ports | `node --test tests/workforce/contracts/provider-adapters.contract.test.js` | WF-EXT-09 |
| WF-TEST-SUITE-05 | Clock and ID ports | `node --test tests/workforce/contracts/system-ports.contract.test.js` | First target use case |
| WF-TEST-SUITE-06 | Ten HTTP compatibility operations | `node --test tests/workforce/http/workforce-http.compatibility.test.js` | Any target HTTP route |
| WF-TEST-SUITE-07 | All-contract/all-port two-tenant matrix | `node --test tests/workforce/security/workforce-tenant-isolation.test.js` | Any target route |
| WF-TEST-SUITE-08 | Fourteen consistency/Audit variants | `node --test tests/workforce/consistency/workforce-consistency.test.js` | Any target command route |
| WF-TEST-SUITE-09 | Eleven-contract legacy-target parity | `node --test tests/workforce/parity/workforce-legacy-target.parity.test.js` | Shadow/canary routing |
| WF-TEST-SUITE-10 | Route rollback/reconciliation | `node --test tests/workforce/rollback/workforce-route-rollback.test.js` | WF-PRE-14 rehearsal/canary |

Every suite has named Architecture, Product, Module, Data, Security, Quality, Operations, Audit, or affected provider owners as applicable.

Failed, skipped, flaky, quarantined, unknown, or adapter-specific omitted required cases block activation. A baseline may not be updated by copying target output into expected fixtures.

## Domain Proof

The Domain suite proves persistence-independent behavior:

- `Teacher` creation, profile replacement, status transitions, valid employment type, required trimmed name, and workload range;
- `TeacherWorkingHour` weekday 1–7, normalized `HH:mm`, end-after-start, exact adjacency allowed, overlap denied;
- same-Teacher/day collection semantics;
- no HTTP, SQL, provider, global context, clock environment, or migration dependency.

The concurrency guarantee itself is additionally proven at the owned SQLite port boundary using explicit competing-insert barriers.

## Application Contract Proof

The Application suite covers all 11 PRE-09 contracts through deterministic fakes.

For the ten compatibility contracts it executes all 69 PRE-06 `WFT-*` IDs, including:

- success DTO and ordering;
- validation and semantic errors;
- authentication, role, self-scope, and privacy;
- not-found/conflict/blocker behavior;
- two-tenant isolation;
- provider failure and no partial DTO;
- local rollback, Audit ordering, and prohibited effects;
- the frozen Working Hour delete `teacherName` quirk;
- two separately governed target deltas.

`WF-REF-01` receives five exact IDs:

| ID | Expected proof |
|---|---|
| WFT-REF-001 | Active and inactive same-tenant references return successfully |
| WFT-REF-002 | Only the seven PRE-09 service callers are admitted |
| WFT-REF-003 | Missing reference returns `TEACHER_NOT_FOUND` |
| WFT-REF-004 | Foreign-tenant same ID is not visible |
| WFT-REF-005 | DTO contains exactly tenantId, teacherId, displayName, status, and branchId |

Fakes record exact call order and fail the case on an unexpected call, repeated command, foreign tenant, sensitive field, or partial-result fallback.

## Cross-Cutting Proof

The three PRE-06 common IDs are mandatory:

- `WFT-COMMON-001`: invalid session or tenant returns frozen `401/403` before any business call;
- `WFT-COMMON-002`: malformed/oversized bodies return `400/413` before use-case execution;
- `WFT-COMMON-003`: all public contracts and ports prove two-tenant isolation.

The tenant suite includes same identifier values in both tenants and observes:

- repository reads/writes and conflicts;
- provider query/command calls;
- blocker decisions and keyed projections;
- Identity sessions/access;
- Audit intents;
- HTTP and Application DTOs.

Passing only the HTTP layer is insufficient.

## Focused Port Contract Proof

Every PRE-10 method has exact coverage.

### Owned ports

Five ports and 12 methods prove:

- success, empty/not-found, exact DTOs, ordering, and null/default behavior;
- tenant isolation on every lookup and write;
- conflict/uniqueness translation without driver leakage;
- commit and injected rollback;
- Working Hour overlap recheck and competing insert protection;
- direct-table allowlist limited to `teachers` and `teacher_working_hours`.

### Provider ports

Eleven ports and 18 methods prove:

- minimum request/response DTOs;
- keyed completeness, explicit zero/not-granted rows, and missing/duplicate-key failure;
- semantic blocker decisions rather than raw entities;
- exact tenant/actor propagation;
- provider unavailable, explicit failure, and ambiguous outcome mapping;
- no direct provider table access or sensitive output;
- Audit accepted/failure/unavailable/ambiguous behavior.

### System ports

Clock and ID tests prove the fixed UTC instant and repeatable unique IDs without generating provider/Audit identities.

All nine PRE-10 adapter groups must pass the relevant shared contract suite. No adapter-specific skip is permitted.

## Consistency and Fault Injection

All 14 PRE-11 variants have stable `WFC-*` cases.

Four legacy holds are characterized and must prove that the target selector denies invocation:

- `WF-CONS-03B`;
- `WF-CONS-04B`;
- `WF-CONS-05A`;
- `WF-CONS-05B`.

The remaining variants prove their target contract without activating a route:

- exact provider call ordering;
- local transaction commit/rollback;
- no cross-context transaction;
- no automatic command or Audit retry;
- no unsafe compensation;
- `committed_unacknowledged` after known business commit and failed/uncertain Audit acceptance;
- `unknown` after an indeterminate mutation result;
- overlap concurrency;
- fail-whole read composition.

Timeout simulation occurs at explicit dispatch/commit boundaries, not by relying on wall-clock timing.

## Legacy-Target Parity

Parity covers all 11 public contracts.

Compared dimensions include:

- canonical result DTO;
- semantic error;
- ordering;
- persisted and prohibited effects;
- tenant and authorization;
- privacy;
- Audit intent;
- provider call order;
- consistency outcome classification.

Record/state, tenant, authorization, privacy, Audit, authority, and semantic mismatches have zero tolerance. There is no numeric tolerance.

### Exact governed delta allowlist

Only two differences are permitted, and both require dual assertions:

1. `WF-APP-DELTA-01` / `WF-APP-09`: legacy characterizes unvalidated explicit `branchId`; target must reject inactive/foreign Branch with `BRANCH_INVALID`.
2. `WF-APP-DELTA-02` / `WF-APP-02`: legacy characterizes Teacher-self `monthlyFee` exposure; target must omit it while Admin retains it.

The parity suite may not normalize either difference away. Every other unexplained mismatch is blocking.

Create/update variants with unresolved cross-context semantics compare only their admissible variant or characterize the governed legacy hold. Archive remains legacy-characterization/target-denied until its independent consistency blocker is resolved.

## Rollback and Reconciliation Tests

Seven cases are approved:

| ID | Scenario | Required outcome |
|---|---|---|
| WF-ROLL-01 | Failure before dispatch | `not_started`; no mutation or Audit |
| WF-ROLL-02 | Provider-local rollback | Exact pre-state; `rolled_back`; no Audit; no auto-retry |
| WF-ROLL-03 | Commit then explicit Audit failure | `committed_unacknowledged`; technical failure; no business replay |
| WF-ROLL-04 | Commit then ambiguous Audit acceptance | Quarantine until Audit-owned evidence prevents duplicate append |
| WF-ROLL-05 | Mutation outcome unknown | No fallback mutation/blind replay; public-query evidence and escalation |
| WF-ROLL-06 | Route fallback rehearsal | Frozen legacy authority, target disabled, no synchronous dual write |
| WF-ROLL-07 | Legacy-hold selector attempt | Target invocation denied; governed legacy path only |

PRE-14 still owns exact operator commands, numeric thresholds, cohorts, observation window, and rehearsal evidence. PRE-13 defines what those commands must prove.

## Evidence Artifacts

Every implemented suite publishes under `artifacts/architecture/workforce/`:

- `test-results.json`;
- `test-results.xml`;
- `fixture-manifest.json`;
- `normalized-diff.json`;
- `environment.json`.

Required metadata includes commit, plan hash, suite/case ID, fixture hash, Node/database version, timezone, start, duration, and status.

Artifacts must contain no passwords, hashes, cookies, tokens, personal data, or raw provider credentials.

## Current Admission State

| Measure | Approved specification | Implemented/passing now |
|---|---:|---:|
| Planned suites | 10 | 0 |
| Deterministic fixtures | 8 | 0 target fixtures |
| PRE-06 behavior IDs | 69 | Existing legacy coverage remains 5 covered, 16 partial, 48 missing |
| Public contracts | 11 | 0 target Application suites |
| Focused ports/methods | 18 / 32 | 0 target port suites |
| Consistency variants | 14 | 0 target fault suites |
| Parity rows | 11 | 0 target comparisons |
| Rollback cases | 7 | 0 rehearsals |
| Target routes | 0 | 0 |

The formal plan is complete; implementation missing remains a blocking, visible fact. Each extraction increment must implement and pass the suite named by its activation rule.

## Risks and Guards

Principal controls are:

1. legacy regression is never relabeled target contract evidence;
2. all 69 behavior IDs, 11 contracts, 18 ports, 32 methods, nine adapters, and 14 variants are machine-closed;
3. parity tolerance is zero except the exact two-delta allowlist;
4. every suite has owners, fixtures, files, command, expected result, missing status, and activation gate;
5. skipped/flaky/quarantined/unknown results fail admission;
6. Audit/unknown outcomes cannot auto-retry or use foreign SQL;
7. this gate claims zero implemented suites and enables zero routes.

Temporary test exceptions: zero.

## Approval

Approved on 2026-07-24 under Single-Founder Governance by Sukhrob Khaydarov as Architecture Owner, Workforce Module Owner, Product Authority, Identity & Access Owner, Organization & Branches Owner, Academic Groups Owner, Scheduling Owner, Lesson Delivery Owner, Student Information Owner, Audit & History Owner, Data Owner, Operations Owner, Security Owner, and Quality Owner.

## Gate Result

**WF-PRE-13: PASSED**

The executable test/parity plan is complete: 10 executable suite specifications, 69/69 behavior IDs, 11/11 public contracts, 18/18 focused ports, 32/32 methods, 14/14 consistency variants, two governed target deltas, seven rollback scenarios, and zero exceptions are exact.

Passing WF-PRE-13 does not claim the planned target tests exist or pass. Target test implementation missing is explicit, and zero target routes are enabled.

Module Readiness remains Failed. WF-PRE-14 subsequently approved the [migration and rollback runbook](workforce-migration-runbook.md); the next ordered prerequisite is WF-PRE-16.
