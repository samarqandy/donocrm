# ADR-003: Why PostgreSQL

- **Status:** Accepted
- **Date:** 2026-07-22
- **Decision owners:** Architecture governance

## Context

The current production-oriented code path uses SQLite and contains explicit single-writer synchronization behavior. The repository includes PostgreSQL migrations, a PostgreSQL attendance repository, tenant backfill and parity tooling, and canary-selection configuration. PostgreSQL coverage is incomplete: the SQLite schema contains the full operational model, while the PostgreSQL migrations currently cover the Attendance migration slice and supporting reference data.

The business requirements require tenant-scoped data isolation, reliable financial and attendance records, and future growth beyond the initial small deployment. The approved migration documentation identifies PostgreSQL as the target persistence platform.

## Decision

PostgreSQL will be the authoritative production relational database for the Enterprise Modular Monolith.

Migration will occur context by context and tenant by tenant under ADR-004. During transition, authority must be explicitly assigned for each migrated data set; the existence of two stores must never imply two concurrent authorities.

Each module owns its tables and migrations even when tables reside in one PostgreSQL database. Tenant-bearing references must preserve tenant identity in keys and constraints where required to prevent cross-tenant relationships. Database-specific behavior belongs in infrastructure adapters, not in domain or use-case contracts.

This ADR does not decide database-per-tenant deployment, PostgreSQL row-level security, partitioning, replication topology, or managed-provider selection. Those require evidence and separate decisions.

## Consequences

### Positive

- PostgreSQL supports concurrent transactional workloads without SQLite's process-local single-writer coordination.
- Relational constraints can enforce tenant and business data integrity.
- Mature backup, recovery, replication, indexing, and observability capabilities support production operation.
- One relational platform can support the current interconnected operational model while retaining module ownership.

### Negative

- Deployment now requires database operations, connection management, backup verification, and recovery procedures.
- SQLite-to-PostgreSQL type, constraint, and concurrency differences require explicit migration validation.
- Partial migration creates temporary operational complexity and rollback obligations.
- A shared PostgreSQL database does not itself enforce module boundaries.

## Alternatives

### Retain SQLite as the production authority

Rejected as the long-term target because the repository already contains synchronization workarounds and an approved PostgreSQL migration path. SQLite may remain useful for narrowly defined local or legacy purposes until retired.

### Database per tenant

Not selected. The repository establishes logical tenant isolation but contains no evidence sufficient to justify the operational cost or determine tenant placement rules.

### Database per bounded context

Not selected as the modular-monolith default. It would complicate current transactional workflows before context ownership is mature. Independently deployed contexts may revisit this choice.

### Another relational or non-relational database

Rejected as the default because no repository evidence identifies a capability gap that PostgreSQL cannot meet, while PostgreSQL migration assets already exist.
