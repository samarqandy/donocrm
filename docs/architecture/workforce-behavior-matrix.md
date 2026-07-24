# Workforce Behavior and Test Matrix

Decision ID: WF-PRE-06  
Status: Approved  
Decision date: 2026-07-24  
Matrix: `workforce-behavior-2026-07-24.1`  
Contract baseline: `workforce-http-2026-07-23.1`  
Implementation evidence commit: `9581763b848f4b7f973f450b9b9c82f488bb7158`  
Machine-readable evidence: [`architecture/workforce-behavior-matrix.json`](../../architecture/workforce-behavior-matrix.json)  
Matrix SHA-256: `84b7206ae682fe417b7f2b2f6314591b46bc56768e4a6b8de54148982dbcfc2d`

## Decision Authority

| Concern | Approval role | Approver | Decision |
|---|---|---|---|
| Workforce behavior inventory | Workforce Module Owner | Sukhrob Khaydarov | Approved |
| Case/test mapping and evidence status | Quality Owner | Sukhrob Khaydarov | Approved with explicit coverage gaps |
| Tenant, role, credential, and privacy cases | Security Owner | Sukhrob Khaydarov | Approved with `WF-CONTRACT-RISK-01` blocking target parity |
| Gate separation and migration ordering | Architecture Owner | Sukhrob Khaydarov | Approved |

## Decision

All ten frozen Workforce HTTP operations now have an approved behavior specification. Every operation has an explicit row for:

- authorized success;
- applicable validation;
- authorization/authentication;
- not-found behavior;
- conflict behavior;
- tenant isolation;
- infrastructure failure;
- state/DTO/order/privacy invariants.

Applicable rows have stable `WFT-*` test IDs. Categories that cannot arise from an operation are explicitly `not_applicable` with a reason; they are not silently omitted.

This decision approves **what must be proven** and how each proof is identified. It does not claim that planned tests already exist. `covered`, `partial`, `missing`, and `not_applicable` are deliberately distinct states.

No runtime source, route, DTO, schema, database, business rule, test fixture, or user-visible behavior changed in WF-PRE-06.

## Evidence and Coverage Semantics

The matrix is bound to:

- the exact WF-PRE-05 contract baseline and its SHA-256;
- the legacy implementation evidence commit;
- exact fingerprints for `test-backend-logic.js`, `qa-smoke.js`, and `test-p0-hardening.js`;
- the registered privacy risk from WF-PRE-05.

Coverage meanings:

| State | Meaning |
|---|---|
| `covered` | Focused automated assertions prove the complete behavior row against the frozen legacy path |
| `partial` | Automated evidence proves part of the row, but at least one stated expectation is unasserted |
| `missing` | The stable test ID and expected behavior are approved, but accepted automation does not yet exist |
| `not_applicable` | The category cannot arise from the operation and has an approved reason |

Current approved inventory:

| Measure | Count |
|---|---:|
| Frozen operations | 10 |
| Operation behavior rows | 81 |
| Applicable rows mapped to stable test IDs | 69 |
| Fully covered rows | 5 |
| Partially covered rows | 16 |
| Missing automated rows | 48 |
| Approved not-applicable rows | 12 |
| Cross-cutting planned tests | 3 |

Coverage status is evidence accounting, not a release score. A `partial` or `missing` row cannot satisfy WF-PRE-13 by being present in this matrix.

## Operation Matrix

The machine-readable matrix is authoritative for the complete scenario and expected-result text. This summary makes the gate reviewable without duplicating the entire artifact.

| Behavior | Operation | Success | Validation | Auth | Not found | Conflict | Tenant | Infra | Invariant |
|---|---|---|---|---|---|---|---|---|---|
| WF-BHV-01 | List Teachers | partial | N/A | missing | N/A | N/A | missing | missing | missing |
| WF-BHV-02 | Get Teacher Profile | partial | N/A | partial | missing | N/A | missing | missing | partial |
| WF-BHV-03 | Create Teacher | covered | missing | covered | N/A | covered | missing | missing | partial |
| WF-BHV-04 | Update Teacher | partial | missing | missing | missing | missing | missing | missing | missing |
| WF-BHV-05 | Archive Teacher | covered | missing | missing | missing | partial | missing | missing | partial |
| WF-BHV-06 | Restore Teacher | missing | missing | missing | missing | N/A | missing | missing | missing |
| WF-BHV-07 | Reset Teacher Password | covered | missing | missing | missing | N/A | missing | missing | partial |
| WF-BHV-08 | List Working Hours | partial | N/A | partial | N/A | N/A | missing | missing | partial |
| WF-BHV-09 | Create Working Hour | partial | missing | missing | missing | partial | missing | missing | missing |
| WF-BHV-10 | Delete Working Hour | partial | missing | missing | missing | missing | missing | missing | partial |

### Stable test namespaces

| Operation | Required test IDs |
|---|---|
| List Teachers | `WFT-LIST-001` through `WFT-LIST-005` |
| Get Teacher Profile | `WFT-PROFILE-001` through `WFT-PROFILE-007` |
| Create Teacher | `WFT-CREATE-001` through `WFT-CREATE-007` |
| Update Teacher | `WFT-UPDATE-001` through `WFT-UPDATE-008` |
| Archive Teacher | `WFT-ARCHIVE-001` through `WFT-ARCHIVE-008` |
| Restore Teacher | `WFT-RESTORE-001` through `WFT-RESTORE-007` |
| Reset Teacher Password | `WFT-RESET-001` through `WFT-RESET-007` |
| List Working Hours | `WFT-HOURS-LIST-001` through `WFT-HOURS-LIST-005` |
| Create Working Hour | `WFT-HOURS-CREATE-001` through `WFT-HOURS-CREATE-008` |
| Delete Working Hour | `WFT-HOURS-DELETE-001` through `WFT-HOURS-DELETE-007` |

## Cross-Cutting Cases

Three cross-cutting IDs prevent common transport/security behavior from being inconsistently implemented per operation:

| Test ID | Scope | Required result |
|---|---|---|
| `WFT-COMMON-001` | Invalid session and missing/suspended tenant on every operation | Frozen `401/403`; no read leak or mutation |
| `WFT-COMMON-002` | Invalid/oversized JSON on every body-consuming operation | Frozen `400/413` before use-case execution, including ignored-body routes |
| `WFT-COMMON-003` | Two independent tenants across every query and mutation | No cross-tenant identifiers, joins, conflicts, blockers, credentials, sessions, audit facts, or DTO fields |

These are missing automation. Therefore the separate exit criterion “two-tenant isolation cases exist for every planned query and mutation” remains failed.

## Required Invariants

The operation rows bind the following compatibility and safety invariants:

- Teacher and Working Hour identifiers remain tenant-scoped and stable.
- Teacher self projections omit credential fields.
- Collection/profile ordering and the 20-upcoming-lesson limit remain deterministic.
- create/update/archive/reset cross-Workforce/Identity outcomes cannot be assumed safe until injected-failure cases characterize current atomicity.
- username conflict leaves no orphan Teacher.
- archive is soft, preserves history, respects Group/Lesson blockers, disables portal identity, and invalidates sessions.
- restore changes Workforce lifecycle status only; it must not silently restore portal access.
- password reset preserves the PBKDF2 credential format and invalidates all sessions.
- Working Hours stay same-Teacher/day non-overlapping; exact adjacency is allowed.
- Working Hour delete preserves the frozen empty `teacherName` response quirk unless changed through contract governance.

These are current-compatibility requirements. WF-PRE-11 subsequently approved target transaction, compensation, retry, idempotency, unknown-outcome, and route-admission decisions.

## Security and Privacy Decision

`WF-CONTRACT-RISK-01` remains blocking.

The current Teacher self-profile composition can expose Group `monthlyFee`, although the OpenAPI schema marks it Admin-only. The matrix separates legacy characterization (`WF-BHV-02-R01` / `WFT-PROFILE-006`) from the required target remediation (`WF-BHV-02-R02` / `WFT-PROFILE-007`).

The approved target assertion requires omission of `monthlyFee`. Current exposure is characterization evidence, not an approved target parity result. Product/Security contract remediation remains mandatory before target routing can pass.

## Verification

Repeatable structural verification:

```bash
npm run architecture:workforce-behavior
```

The command verifies:

- the matrix identity/status and embedded SHA;
- the exact WF-PRE-05 baseline binding;
- all three test evidence fingerprints;
- exact 10/10 operation alignment;
- all eight required categories for every operation;
- unique behavior and stable test IDs;
- evidence rules for every coverage state;
- the blocking privacy-risk mapping.

This command validates the approved inventory, not missing test implementations. It is intentionally not a general required CI check because the test evidence fingerprints will change as WF-PRE-13 automation is added; such changes require an explicit matrix evidence refresh.

## Gate Separation

WF-PRE-06 does not itself resolve:

- WF-PRE-07 bounded-context seams, subsequently approved in the [seam decision](workforce-bounded-context-seams.md);
- WF-PRE-11 target transaction/consistency behavior — subsequently completed;
- WF-PRE-12 synchronous dependency, no-event, and Audit delivery behavior — subsequently completed;
- WF-PRE-13 fixtures, repository/port contracts, legacy-target parity, thresholds, rollback cases, or execution ownership;
- WF-PRE-14 migration/canary/rollback procedure;
- WF-PRE-16 final Module Readiness.

The full Testing Readiness section is still failed because 48 operation rows and all three cross-cutting cases lack accepted automation.

## Approval Result

**WF-PRE-06: PASSED**

Ten out of ten operations contain explicit success/failure/invariant rows, all 69 applicable operation rows have stable test IDs, every non-applicable category has a reason, tenant/role/privacy cases are explicit, and current evidence gaps are measurable rather than implied away.

WF-PRE-07 through WF-PRE-12 subsequently approved seams, table access, public contracts, focused ports, the [transaction/consistency model](workforce-transaction-consistency.md), and [event/Audit delivery](workforce-event-requirements.md). The next ordered prerequisite is WF-PRE-13: approve the executable test and parity plan.
