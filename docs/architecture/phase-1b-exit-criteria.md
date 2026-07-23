# Phase 1B Exit Criteria — Workforce Migration Entry

Status: Mandatory gate criteria; not yet satisfied
Candidate: Workforce

## Measurement Rules

- Every criterion is binary: Passed or Failed.
- Passed requires a repository link, CI artifact, test result, signed decision, or approved external evidence reference.
- `N/A` requires Architecture Owner and Module Owner approval with a concrete reason.
- A percentage score cannot compensate for a failed mandatory item.
- Criteria authorize migration planning/execution only through a separate gate decision.

## Governance and Ownership

- [x] A named Architecture Owner and current delegate status are recorded: Sukhrob Khaydarov; no delegate is appointed under Single-Founder Governance.
- [x] A named Workforce Module Owner is recorded: Sukhrob Khaydarov.
- [x] Product, Identity, Organization, Data, Operations, Quality, and Security decision authority is recorded: Sukhrob Khaydarov currently holds each role.
- [x] The Legacy Freeze baseline commit and exact 68 violation fingerprints are approved.
- [x] Every active exception has an owner, expiry, compensating control, and removal condition; the active exception register is empty.

**Pass measure:** 100% of required ownership fields are named; zero expired or ownerless exceptions.

## Legacy Freeze

- [ ] Diff from the approved freeze baseline adds zero unapproved `AppService` business methods.
- [ ] Diff adds zero unapproved `AppRepository` methods, SQL statements, tables, or joins.
- [ ] Diff adds zero new legacy API business route branches or Presentation SQL.
- [ ] Diff adds zero new module dependency on legacy services/repositories/database or another module's Infrastructure.
- [ ] Diff adds zero unapproved Shared Kernel files or consumers.
- [ ] Every permitted legacy touch is classified as Bug, Security, Migration Adapter, or Compatibility and has evidence.

**Pass measure:** zero new unapproved legacy violation fingerprints.

## Module Definition

- [x] Workforce product scope and explicit non-goals are approved in [WF-PRE-03](workforce-product-scope.md).
- [x] Every mandatory section in `module-template.md` is completed in the approved [Workforce Module Definition](workforce-module-definition.md); the single not-applicable external-integration entry includes evidence and approval.
- [x] Owned and non-owned product responsibilities are unambiguous in the approved scope decision.
- [x] All ten current use-case candidates map to an included documented operation; none is excluded.
- [ ] The Module Readiness Gate has named approvers and a Passed decision.

**Pass measure:** 100% template-section completion and 10/10 current operations accounted for.

## Ports, Contracts, and Dependencies

- [ ] Public Application commands/queries, input/output DTOs, semantic errors, authorization, and idempotency expectations are documented.
- [ ] Teacher reference/status contract for downstream consumers is documented.
- [ ] Focused ports are defined for Teacher persistence, Working Hours, Identity, Organization, blockers/projections, and Audit as applicable.
- [ ] No proposed port reproduces the multi-context `AppRepository` surface.
- [ ] Every upstream/downstream dependency has owner, direction, mode, and consistency behavior.
- [ ] No target design requires direct foreign-table access.

**Pass measure:** every dependency in the readiness review resolves to one approved public contract/event or an exact temporary exception.

## Data and Transactions

- [x] `teachers` and `teacher_working_hours` are approved as Workforce-owned authoritative data.
- [ ] Every current foreign table read/write has a documented target owner and transition treatment.
- [ ] Teacher/Identity create, update, access-disable, archive, password-reset, and session-invalidation consistency is approved.
- [ ] Current and target authority is explicit for every tenant and operation.
- [x] Database schema and authority changes are explicit first-extraction non-goals.

**Pass measure:** zero unowned tables and zero ambiguous authoritative writers in planned scope.

## API Compatibility

- [x] All ten existing HTTP operations are represented in OpenAPI and accounted for by [WF-PRE-05](workforce-contract-freeze.md).
- [x] Request fields, exact response fields, status codes, semantic errors, authorization, ordering, limits, and privacy projections have an approved [machine-readable baseline](../../architecture/workforce-contract-baseline.json).
- [ ] An automated or reviewed contract comparison reports zero breaking change.
- [x] ADR-008 constraints are respected: existing `/api` is frozen as the compatibility surface while versioning remains Proposed.

**Pass measure:** 10/10 operations covered and zero unapproved breaking changes.

## Testing Readiness

- [x] The existing Teacher Management scenario passes unchanged.
- [x] Full approved backend, smoke, hardening, and architecture baselines pass from a clean test environment.
- [ ] A test matrix covers each of the ten use-case candidates for authorized success and applicable validation, authorization, not-found, conflict, and infrastructure failures.
- [ ] Two-tenant isolation cases exist for every planned query and mutation.
- [ ] Repository/port contract tests are specified for every planned adapter.
- [ ] Legacy-versus-target parity assertions and approved thresholds are documented.
- [ ] Rollback and reconciliation test cases are documented.

**Pass measure:** 10/10 use cases have required behavior rows and zero unexplained baseline failures. No line-coverage percentage is invented because the repository has no approved coverage tool or threshold.

## Architecture Enforcement

- [x] Dependency/layer graph generation runs reproducibly in CI.
- [x] New cycles, inner-to-outer dependencies, cross-module private imports, Shared Kernel additions, Presentation SQL, and legacy growth fail deterministically against the approved baseline.
- [x] Current legacy fingerprints remain visible with ownership rather than being broadly ignored.
- [ ] Workforce module definition/table ownership checks are active.
- [ ] Architecture checklist evidence is attached to migration pull requests.

**Pass measure:** zero new violations and all mandatory structural checks green on the selected baseline commit.

## Migration and Rollback

- [ ] A Workforce migration runbook names exact route/use-case increments and tenant cohort.
- [ ] Entry, parity, performance, error, data-integrity, stop, and rollback thresholds are numeric or otherwise objectively decidable.
- [ ] Legacy remains available and unchanged throughout the rollback window.
- [ ] Authority transfer and reconciliation behavior for Teacher/Identity writes is documented.
- [ ] Rollback steps and responsible operator are verified in a production-like environment before canary.
- [ ] Legacy retirement criteria and observation window are documented.

**Pass measure:** a rehearsal report demonstrates route fallback and data/identity consistency for every planned write operation.

## Final Approval

- [x] Product Authority approves WF-PRE-03 scope and preservation of the current ten-operation compatibility surface.
- [ ] Workforce Module Owner approves module definition and test evidence.
- [ ] Identity and Organization owners approve their contracts.
- [ ] Data, Security, Quality, and Operations owners approve applicable evidence.
- [ ] Architecture Owner records `Passed` for the Module Readiness Gate.

## Exit Decision Rule

Phase 1B exits successfully only when every mandatory checkbox is Passed with evidence. Until then, Workforce may be documented and characterized but must not begin real module migration.
