# Phase 1B Exit Criteria — Workforce Migration Entry

Status: Passed by WF-PRE-16 for ordered extraction implementation
Candidate: Workforce

## Measurement Rules

- Every criterion is binary: Passed or Failed.
- Passed requires a repository link, CI artifact, test result, signed decision, or approved external evidence reference.
- `N/A` requires Architecture Owner and Module Owner approval with a concrete reason.
- A percentage score cannot compensate for a failed mandatory item.
- Criteria authorize migration planning/execution only through a separate gate decision.
- A production-like rehearsal is not executable before the target implementation and operator controls exist. Architecture, Module, Operations, Data, Security, and Quality owners may approve it as `N/A at migration-entry` only when it remains a fail-closed activation condition before shadow/canary/target authority.

## Governance and Ownership

- [x] A named Architecture Owner and current delegate status are recorded: Sukhrob Khaydarov; no delegate is appointed under Single-Founder Governance.
- [x] A named Workforce Module Owner is recorded: Sukhrob Khaydarov.
- [x] Product, Identity, Organization, Data, Operations, Quality, and Security decision authority is recorded: Sukhrob Khaydarov currently holds each role.
- [x] The Legacy Freeze baseline commit and exact 68 violation fingerprints are approved.
- [x] Every active exception has an owner, expiry, compensating control, and removal condition; the active exception register is empty.

**Pass measure:** 100% of required ownership fields are named; zero expired or ownerless exceptions.

## Legacy Freeze

- [x] Diff from the approved freeze baseline adds zero unapproved `AppService` business methods; enforced by `npm run architecture:enforce`.
- [x] Diff adds zero unapproved `AppRepository` methods, SQL statements, tables, or joins; enforced by the approved semantic fingerprint baseline.
- [x] Diff adds zero new legacy API business route branches or Presentation SQL; required CI reports zero unbaselined findings.
- [x] Diff adds zero new module dependency on legacy services/repositories/database or another module's Infrastructure; module dependency enforcement remains blocking.
- [x] Diff adds zero unapproved Shared Kernel files or consumers; Shared Kernel fingerprints remain exact.
- [x] Every permitted legacy touch is classified as Bug, Security, Migration Adapter, or Compatibility and has evidence; the current diff adds no Workforce runtime/legacy touch and the active exception register is empty.

**Pass measure:** zero new unapproved legacy violation fingerprints.

## Module Definition

- [x] Workforce product scope and explicit non-goals are approved in [WF-PRE-03](workforce-product-scope.md).
- [x] Every mandatory section in `module-template.md` is completed in the approved [Workforce Module Definition](workforce-module-definition.md); the single not-applicable external-integration entry includes evidence and approval.
- [x] Owned and non-owned product responsibilities are unambiguous in the approved scope decision.
- [x] All ten current use-case candidates map to an included documented operation; none is excluded.
- [x] The [WF-PRE-16 Module Readiness Gate](workforce-module-readiness-decision.md) has named approvers and a Passed decision for ordered extraction implementation.

**Pass measure:** 100% template-section completion and 10/10 current operations accounted for.

## Ports, Contracts, and Dependencies

- [x] The approved [WF-PRE-09 public Application contracts](workforce-public-application-contracts.md) define 10/10 commands/queries, canonical input/output DTOs, closed semantic errors, verified authorization context, and explicit no-key retry/idempotency expectations.
- [x] `TeacherReferenceApplicationV1` documents the exact five-field Teacher reference/status contract and allow-listed downstream consumers.
- [x] The approved [WF-PRE-10 focused port catalog](workforce-focused-ports.md) defines exact Teacher persistence, Working Hour, Identity, Organization, blocker/projection, Audit, clock, and ID capabilities across 18 cohesive ports.
- [x] Five machine-verified broad-port guards, two owned direct-table allowlists, zero foreign direct access, and zero temporary exceptions prevent reproduction of the multi-context `AppRepository`.
- [x] The approved [WF-PRE-12 event/Audit decision](workforce-event-requirements.md) gives all 19 upstream/downstream/internal dependencies an owner, direction, synchronous mode, consistency behavior, and explicit no-event disposition.
- [x] All 11 provider ports, seven PRE-07 seams, and seven `WF-REF-01` service callers resolve exactly; published events, consumed events, approved event versions, and temporary event exceptions are all zero.
- [x] The approved [WF-PRE-07 seam decision](workforce-bounded-context-seams.md) forbids target foreign-table access and routes every current cross-context workflow through provider public contracts and an outer non-authoritative coordinator.

**Pass measure:** every dependency in the readiness review resolves to one approved public contract/event or an exact temporary exception.

## Data and Transactions

- [x] `teachers` and `teacher_working_hours` are approved as Workforce-owned authoritative data.
- [x] The approved [WF-PRE-08 access manifest](workforce-table-ownership-access.md) assigns every current foreign read/write an exact owner, operation/verb closure, provider-contract treatment, legacy transition, and zero unexplained target exceptions.
- [x] The approved [WF-PRE-11 consistency model](workforce-transaction-consistency.md) defines Teacher/Identity create, update/access, archive, password-reset, all-session invalidation, Audit, failure, retry, compensation, and reconciliation behavior without claiming distributed atomicity.
- [x] Current and target authority, atomic unit, route admission, and legacy-hold disposition are explicit for all 14 tenant-scoped operation variants.
- [x] Database schema and authority changes are explicit first-extraction non-goals.

**Pass measure:** zero unowned tables and zero ambiguous authoritative writers in planned scope.

## API Compatibility

- [x] All ten existing HTTP operations are represented in OpenAPI and accounted for by [WF-PRE-05](workforce-contract-freeze.md).
- [x] Request fields, exact response fields, status codes, semantic errors, authorization, ordering, limits, and privacy projections have an approved [machine-readable baseline](../../architecture/workforce-contract-baseline.json).
- [x] `npm run architecture:workforce-contract` provides the automated exact-source comparison and reports zero breaking change across the ten frozen operations.
- [x] ADR-008 constraints are respected: existing `/api` is frozen as the compatibility surface while versioning remains Proposed.

**Pass measure:** 10/10 operations covered and zero unapproved breaking changes.

## Testing Readiness

- [x] The existing Teacher Management scenario passes unchanged.
- [x] Full approved backend, smoke, hardening, and architecture baselines pass from a clean test environment.
- [x] The approved [WF-PRE-06 behavior matrix](workforce-behavior-matrix.md) covers each of the ten use-case candidates for authorized success and applicable validation, authorization, not-found, conflict, tenant, infrastructure, and invariant behavior; missing automation remains explicit.
- [x] [WF-PRE-13](workforce-test-parity-plan.md) specifies exact two-tenant isolation cases across all 11 public contracts and all 18 focused ports, including same-ID collisions, provider calls, sessions, Audit intents, and DTOs.
- [x] Shared repository/provider/system port contract suites are specified for all nine planned adapter groups, 18 ports, and 32 methods with fixtures, files, commands, expected results, owners, and activation gates.
- [x] Legacy-versus-target parity covers all 11 contracts with zero semantic tolerance and exactly two governed delta IDs.
- [x] Seven rollback/reconciliation cases cover `not_started`, `rolled_back`, `committed_unacknowledged`, unknown outcomes, Audit ambiguity, route fallback, and legacy-hold denial.

**Pass measure:** 10/10 use cases have required behavior rows and zero unexplained baseline failures. No line-coverage percentage is invented because the repository has no approved coverage tool or threshold.

## Architecture Enforcement

- [x] Dependency/layer graph generation runs reproducibly in CI.
- [x] New cycles, inner-to-outer dependencies, cross-module private imports, Shared Kernel additions, Presentation SQL, and legacy growth fail deterministically against the approved baseline.
- [x] Current legacy fingerprints remain visible with ownership rather than being broadly ignored.
- [x] Workforce module definition/table ownership checks are active through the 11-verifier `npm run architecture:workforce` chain in required CI.
- [x] Architecture checklist evidence is mandatory in the repository pull-request template and attached to the WF-PRE-16 migration-entry pull request; every later increment must repeat it.

**Pass measure:** zero new violations and all mandatory structural checks green on the selected baseline commit.

## Migration and Rollback

- [x] [WF-PRE-14](workforce-migration-runbook.md) names ten exact route/use-case increments, four target-denied legacy holds, six cohort stages, and a zero-default exact-allowlist selector.
- [x] Entry, parity, performance, error, data-integrity, stop, promotion, RTO, RPO, and reconciliation thresholds are numeric or objectively decidable.
- [x] Frozen legacy is required to remain selectable and unchanged throughout canary and the 14-day rollback window; commands have no dual write or same-request post-dispatch fallback.
- [x] Authority transfer and reconciliation behavior is exact for Workforce/Identity/Audit outcomes, including `committed_unacknowledged`, `unknown`, and zero accepted-write loss.
- [x] Approved `N/A at migration-entry` by Architecture, Workforce, Operations, Data, Security, and Quality owners because no target path or operator command exists yet; [WF-ACT-03](workforce-module-readiness-decision.md#activation-blockers) makes a production-like rehearsal mandatory and fail-closed before canary/target authority.
- [x] Legacy retirement requires 168 hours full-eligible observation, a 14-day rollback window, 30 consecutive zero-use days, zero open incidents, and a separate Legacy Retirement Gate.

**Pass measure:** a rehearsal report demonstrates route fallback and data/identity consistency for every planned write operation.

## Final Approval

- [x] Product Authority approves WF-PRE-03 scope and preservation of the current ten-operation compatibility surface.
- [x] Workforce Module Owner approves module definition and test specification evidence in WF-PRE-16.
- [x] Identity and Organization owners approve their exact contracts and activation constraints in WF-PRE-16.
- [x] Data, Security, Quality, and Operations owners approve applicable evidence and the sole entry-time N/A treatment in WF-PRE-16.
- [x] Architecture Owner records `Passed` for the Module Readiness Gate in [the final decision](workforce-module-readiness-decision.md).

## Exit Decision Rule

Phase 1B exits successfully only when every mandatory item has a Passed disposition with evidence or an explicitly approved entry-time N/A whose later activation gate remains fail-closed. WF-PRE-16 records 54 Passed items, one approved entry-time N/A, zero Failed items, and zero unchecked items.

This authorizes ordered extraction implementation beginning with WF-EXT-01. It does not authorize shadow/canary/target routing, a production cohort, authority transfer, schema change, or legacy removal.
