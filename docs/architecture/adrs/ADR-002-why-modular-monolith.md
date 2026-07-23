# ADR-002: Why a Modular Monolith

- **Status:** Accepted
- **Date:** 2026-07-22
- **Decision owners:** Architecture governance

## Context

The repository implements closely related education-center workflows: tenancy, users and permissions, teachers, groups and schedules, students and guardians, lesson delivery, attendance, payments, finance, Telegram communication, admissions, reporting, and auditing. These workflows frequently require consistent changes within one business operation. The current implementation is already one deployable application and one primary SQLite database.

The system has emerging module seams but does not yet have uniformly explicit aggregates, public module APIs, independent persistence ownership, or distributed-operational controls. The documented scale objective in repository requirements is future support for 500 or more students; larger numerical targets and service-specific scaling needs are not specified.

## Decision

Use a modular monolith as the default architecture and deployment model.

Business-capability modules will be independently owned in source code and schema, communicate through public application contracts, and prevent direct access to another module's internals. Modules will execute in one application process unless a documented capacity, availability, security, team-autonomy, or release-cadence constraint supports extraction.

Extraction readiness means a module has:

- an explicit public application API;
- exclusive data ownership;
- no direct consumers of its internal tables or implementation;
- idempotent integration messages where asynchronous communication is used;
- observable behavior and a documented consistency model.

Extraction readiness is not a mandate to create a service.

## Consequences

### Positive

- Cross-capability workflows can use local calls and database transactions where ownership permits.
- Deployment, testing, and local development remain simpler than a distributed system.
- Domain boundaries can be discovered and corrected without versioned network contracts.
- Operational investment can focus first on data integrity, tenant isolation, and reliable integrations.

### Negative

- A single deployment remains the unit of release and most horizontal scaling.
- Poor governance can allow the codebase to revert to a coupled monolith.
- Resource-heavy work can affect other modules until isolated into workers or extracted.
- Schema-level ownership must be enforced by convention and tests before database permissions can enforce it.

## Alternatives

### Traditional monolith

Rejected as the target because it preserves the current concentration of responsibilities without enforceable business boundaries.

### Microservices

Deferred. They may be justified for an extraction-ready context when measured operational or organizational needs exist. They are not the default.

### Service-based architecture with several coarse deployments

Deferred because the repository does not provide evidence for the appropriate deployment cuts. The modular monolith preserves that option.

### Serverless functions by operation

Rejected as a general target because it would fragment transaction-heavy workflows and does not solve domain ownership by itself.
