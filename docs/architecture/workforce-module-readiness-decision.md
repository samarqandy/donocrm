# Workforce Module Readiness Decision

Status: Passed for ordered extraction implementation; runtime activation remains blocked  
Decision: WF-PRE-16  
Decision date: 2026-07-24  
Candidate: Workforce

Machine decision SHA-256: `e1bc2350ba9d441fb5a7ddf7f7e58ea2ee8f8af74cd29ed5f9a3dca2ae447c18`

## Decision

**WF-PRE-16: PASSED.**

Workforce has completed the final Phase 1B preparation gate. The Architecture Owner and all required specialist roles authorize the ordered extraction backlog beginning with **WF-EXT-01**.

This is a permission to implement the approved module structure, tests, contracts, ports, adapters, and migration controls one bounded increment at a time. It is not permission to enable a shadow route, select a production tenant, dispatch a target command, transfer authority, change schema, or remove legacy code.

## Exact Gate Accounting

The Phase 1B checklist contains 55 criteria:

| Disposition | Count |
|---|---:|
| Passed with linked evidence | 54 |
| Approved N/A at migration-entry, retained as activation blocker | 1 |
| Failed | 0 |
| Unchecked | 0 |

The sole approved entry-time N/A is the production-like rollback rehearsal. There is currently no target module, selector, operator command, or target route to rehearse. Architecture, Workforce, Operations, Data, Security, and Quality owners therefore classify rehearsal as not applicable to permission to start implementation, while retaining it as a mandatory fail-closed condition before canary or target activation.

## Evidence Closure

- Legacy Freeze: the approved `3bc3097e2903b4cc917807f9b799ca7628f54617` baseline still contains exactly 68 visible fingerprints; `npm run architecture:enforce` must report zero new/candidate findings and zero exceptions.
- Contract compatibility: `npm run architecture:workforce-contract` binds all 10 frozen operations to exact runtime/OpenAPI source fingerprints and reports zero approved breaking change.
- Workforce decisions: `npm run architecture:workforce` runs all 11 ordered Workforce verifiers, including this final readiness decision.
- Table ownership: only `teachers` and `teacher_working_hours` are Workforce-owned; every foreign access remains provider-contract-only in target design.
- Pull-request governance: `.github/pull_request_template.md` requires the canonical architecture checklist, exact WF gate/increment, commands, artifacts, exceptions, and approvals for every migration PR.
- Regression evidence: backend, smoke, P0 hardening, architecture, and Excel suites must remain green.

## Authorization Boundary

WF-PRE-16 authorizes:

- starting WF-EXT-01 and then advancing through WF-EXT-02–12 in the approved order;
- creating `src/modules/workforce/` only within the approved layer/dependency boundary;
- implementing the PRE-13 deterministic suites and fixtures;
- implementing approved public Application contracts, focused ports, adapters, selector, operator tooling, and evidence capture;
- changing documentation and manifests with every bounded extraction increment.

WF-PRE-16 does not authorize:

- any schema change, second store, backfill, relay, or dual writer;
- any production cohort membership or route-registry target entry;
- shadow/target activation solely because this gate passed;
- any authority transfer or same-request fallback after target dispatch;
- target selection for `WF-CONS-03B`, `WF-CONS-04B`, `WF-CONS-05A`, or `WF-CONS-05B`;
- legacy removal or retirement.

## Activation Blockers

| ID | Required before activation | Current fact |
|---|---|---|
| WF-ACT-01 | Every increment-required PRE-13 suite exists and passes | 0/10 implemented; 0/10 passing |
| WF-ACT-02 | Required PRE-14 operator commands pass preflight/dry-run | 0/8 implemented |
| WF-ACT-03 | Production-like WF-COHORT-00 rollback rehearsal passes | 0 rehearsals |
| WF-ACT-04 | Separate approved change record binds exact route tuples | 0 production tenants; 0 target routes; 0 transfers |

Any failed, skipped, flaky, quarantined, unknown, stale, or missing required result blocks activation. No percentage score or owner approval can compensate for it.

## Runtime State After the Decision

Legacy remains the default and sole runtime authority. The production allowlist is empty. There are zero shadow routes, zero target routes, zero authority transfers, zero implemented operator commands, and zero rollback rehearsals.

The first authorized implementation task is **WF-EXT-01 — establish the approved Workforce module directory and composition registration**. It must add structure only, keep all runtime dispatch on legacy, and pass the required architecture checklist and CI evidence before the next increment.

## Approval

Sukhrob Khaydarov approves this decision on 2026-07-24 in the recorded Architecture, Workforce Module, Product, Identity, Organization, Audit, Data, Operations, Security, and Quality roles under Single-Founder Governance.
