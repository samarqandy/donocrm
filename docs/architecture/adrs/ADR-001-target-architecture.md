# ADR-001: Target Architecture

- **Status:** Accepted
- **Date:** 2026-07-22
- **Decision owners:** Architecture governance

## Context

DONOCRM currently runs as a Node.js application with a large legacy application service and repository, an HTTP API, SQLite persistence, background jobs, and a Telegram integration. The repository also contains an incremental Clean Architecture migration: Attendance has explicit domain, application, infrastructure, and HTTP packages; Students has a narrower extracted list use case. PostgreSQL migration artifacts currently cover only part of the model.

The product must continue serving tenant-scoped education operations while architecture is changed incrementally. The repository does not establish a requirement for independently deployed services, and the documented migration explicitly uses a strangler approach inside the existing application.

## Decision

DONOCRM will evolve into an **Enterprise Modular Monolith**.

At the C4 Container level, the production system will remain one deployable application plus independently runnable workers where operationally required, backed by PostgreSQL and connected to external systems through adapters. At the Component level, the application will be divided into business-capability modules aligned with [the bounded-context catalog](../bounded-contexts.md).

Each mature module will expose an explicit public application API and will organize code around these boundaries:

1. Domain: framework-independent business concepts and rules.
2. Application: commands, queries, use cases, ports, and transaction coordination.
3. Infrastructure: persistence and external-system adapters.
4. Presentation: HTTP, job, CLI, or event-consumer adapters.

Dependencies must point toward the domain and application core. Composition occurs at the application bootstrap. PostgreSQL will become the production system of record through the separately governed incremental migration. Module boundaries are logical and enforceable even while modules share a process and database.

This decision does not require an immediate runtime, language, or framework replacement.

## Consequences

### Positive

- Business capabilities gain explicit ownership and independently testable application boundaries.
- Existing in-process transactions and deployment simplicity are retained.
- Contexts can be extracted later if operational evidence justifies independent deployment.
- The existing Attendance extraction supplies a repository-local transition pattern.

### Negative

- Boundary enforcement requires automated tests and sustained review discipline.
- The legacy application service, repository, and API will coexist with new modules during migration.
- Shared-process failures and release cadence remain coupled until a context is deliberately extracted.
- A shared database can undermine module ownership if direct cross-module table access is permitted.

### Open consequences

- Production availability, recovery, latency, and throughput objectives are not defined in the repository.
- The future deployment topology for workers and reporting workloads remains an operational decision.

## Alternatives

### Continue the traditional monolith

Rejected as the target because the current centralized service and repository concentrate unrelated business capabilities and do not provide durable ownership boundaries.

### Adopt microservices immediately

Rejected because no repository evidence establishes a need for independent deployment, and immediate distribution would add network, consistency, observability, and operational complexity before domain boundaries are stabilized.

### Rewrite the application

Rejected because it conflicts with the approved continuity-preserving migration and creates a high-risk replacement boundary across tenant, finance, attendance, and communications data.

### Adopt a framework-specific layered architecture only

Rejected as the target because technical layers alone do not establish business-module data ownership or prevent cross-capability coupling.
