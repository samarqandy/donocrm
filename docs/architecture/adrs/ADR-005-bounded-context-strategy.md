# ADR-005: Bounded Context Strategy

- **Status:** Accepted
- **Date:** 2026-07-22
- **Decision owners:** Architecture governance

## Context

The repository models many related education-center capabilities in one schema and centralized services. Some terms and data are shared across attendance, schedules, students, finance, Telegram, and reporting, but shared use does not establish shared ownership. Only Attendance and part of Students currently expose extracted application boundaries.

The initial bounded-context catalog is derived from existing routes, tables, services, jobs, and migration modules. It is an architectural ownership model, not a claim that all boundaries are already implemented or that every proposed boundary is final.

## Decision

Adopt the contexts in [bounded-contexts.md](../bounded-contexts.md) as the baseline capability and ownership map for migration planning.

Each context must have:

- a named business purpose and vocabulary;
- one owner for its state and invariants;
- a public application API;
- private implementation and persistence details;
- declared upstream and downstream relationships;
- explicit synchronous and asynchronous integration contracts.

A context may contain multiple source-code modules during transition, but no source-code module may silently own data from multiple contexts. Consumers must not query another context's tables or import its internal domain or infrastructure code. Reporting models are consumers of published data, not co-owners of operational tables.

Context splits, mergers, and renames require an ADR or an approved update that records evidence, ownership changes, data migration implications, and compatibility effects. A bounded context is not automatically a separately deployed service.

## Consequences

### Positive

- Every business record gains an explicit ownership destination.
- Vocabulary and invariants can differ legitimately across contexts.
- Cross-context coupling becomes visible and reviewable.
- Future service extraction can follow proven business seams.

### Negative

- Some current workflows require new contracts instead of direct shared-table access.
- Initial boundaries may need refinement as hidden invariants are discovered.
- Context maps and ownership catalogs require ongoing maintenance.
- Reporting and auditing need deliberate integration mechanisms to avoid bypassing ownership.

### Open boundary decisions

- Whether Guardians & Enrollment remains separate from Student Information.
- Whether Lesson Delivery remains separate from Scheduling at the present product scale.
- Whether Student Billing & Ledger and Lesson Finance & Payroll remain two contexts.
- Whether Organization & Branches belongs inside Platform Administration.
- Whether Reporting & Export is a context or solely a projection capability.
- Whether Work Management is a durable product capability.

## Alternatives

### Organize only by technical layer

Rejected because it groups unrelated capabilities by mechanism and does not establish business data ownership.

### Treat each table as a module

Rejected because tables do not define aggregate consistency or business language.

### Use a few large domains

Rejected as the default because broad Student, Academic, and Finance modules would preserve substantial internal coupling without explicit subdomain ownership.

### Define service boundaries immediately

Rejected because deployment topology must follow validated context boundaries and operational evidence, not precede them.
