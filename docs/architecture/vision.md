# DONOCRM Architecture Vision

Status: Approved Architecture Foundation
Established: 2026-07-22

## Project Vision

DONOCRM is a multi-tenant education management SaaS for small learning centers and private tutors. The repository's business requirements define three primary jobs: attendance, payments/debt tracking, and automated parent communication through Telegram. The platform also implements student, guardian, teacher, group, scheduling, lesson, CRM, task, reporting, audit, and platform-administration capabilities.

The architectural vision is to preserve the product's stated simplicity while evolving the current hybrid Node.js system into a production-grade Enterprise Modular Monolith. Each business capability will have explicit ownership, stable application contracts, independently testable business rules, tenant-safe persistence, and a controlled path to later extraction if operational evidence requires it.

Sources: [`Dono_02_Business_Requirements.md`](../../Dono_02_Business_Requirements.md), [`README.md`](../../README.md), and [`docs/clean-architecture-migration.md`](../clean-architecture-migration.md).

## Business Goals

The architecture supports the goals already stated in the BRD:

1. Reduce daily administrative work for attendance, payments, and messages.
2. Automate parent communication and prevent undelivered messages from being silently lost.
3. Support private tutors and multi-teacher learning centers with one product model.
4. Keep different education-center types configurable rather than building separate products.
5. Enforce complete data isolation between tenants.
6. Support Uzbek and Russian users.
7. Preserve readiness for a future commercial subscription model without activating unapproved billing scope.
8. Grow from the documented small-center baseline toward centers with 500+ students without redesigning every business capability.

The BRD remains a draft and contains scope that differs from implemented finance, payroll, task, and CRM behavior. Product acceptance of those implemented capabilities is an open governance matter; architecture documentation acknowledges them because they exist in the repository but does not create new business approval.

## Technical Goals

- One deployable modular monolith for the core product, with independently owned modules inside it.
- PostgreSQL as the target authoritative production database; SQLite is a legacy migration source and local/pilot compatibility store.
- Explicit Domain, Application, Interface, and Infrastructure responsibilities inside each migrated module.
- Tenant identity carried through every command, query, database relationship, event, log, and audit record.
- Business rules testable without HTTP, Telegram, SQLite, PostgreSQL, or the filesystem.
- Stable public application and HTTP contracts suitable for the current browser and potential future clients.
- Transactional integrity for attendance, payments, settlement, reversal, enrollment, and other consistency-sensitive workflows.
- Reliable asynchronous side effects through idempotent outbox/inbox processing.
- Bounded and observable queries, workers, migrations, and external calls.
- Incremental migration with parity verification, tenant canaries, rollback, and no business interruption.

Quantitative availability, latency, recovery, throughput, tenant-count, and data-volume objectives beyond current repository requirements are open architectural decisions.

## Architecture Principles

### 1. Business continuity before structural purity

Migration must preserve current behavior. New boundaries are introduced through the strangler pattern, compatibility contracts, parity checks, tenant canaries, and reversible cutovers.

### 2. One owner for every business fact

Each aggregate and authoritative table belongs to one bounded context. Other contexts consume its public application API, query contract, or published event. They do not update its tables directly.

### 3. Dependencies point toward policy

Domain policy does not depend on HTTP, databases, environment variables, filesystem APIs, workers, provider SDKs, or migration routing. Infrastructure implements ports defined by inner layers.

### 4. Tenant isolation is an invariant

The BRD calls tenant isolation the primary architecture rule. Isolation must be enforced in authenticated context, application authorization, persistence predicates, database relationships, background processing, reporting, and tests.

### 5. Explicit use cases define behavior

Commands and business queries enter a module through named application use cases. HTTP controllers, workers, exports, and scripts are adapters, not alternate business-logic locations.

### 6. Transactions follow aggregate ownership

A module owns its local atomic transactions. Cross-context workflows require an explicit consistency decision; they must not grow through unreviewed shared-table transactions.

### 7. Events are facts, not remote commands

Published events describe completed domain or integration facts. Consumers are idempotent. Delivery is observable and recoverable.

### 8. Compatibility is designed

Existing APIs and identifiers remain stable during migration. Contract-breaking changes require an accepted versioning decision and a defined support window.

### 9. Operational behavior is architecture

Backup, restore, readiness, relay lag, queue backlog, external-provider failure, logging, and auditability are part of the design—not deployment afterthoughts.

### 10. Simplicity is a constraint

The BRD explicitly rejects unnecessary ERP complexity. Patterns are introduced only when they protect a real boundary, invariant, compatibility requirement, or operational need.

## Long-term Evolution

### Current state

The active system is a layered Node.js monolith backed primarily by SQLite. Most behavior is concentrated in `src/services/appService.js` and `src/repositories/appRepository.js`. Attendance is a partially extracted ports-and-adapters module with SQLite and PostgreSQL implementations, while Students has an extracted list use case only.

### Transitional state

Capabilities move one bounded context at a time:

1. identify ownership and invariants;
2. introduce application contracts and ports;
3. extract reads, then writes;
4. backfill and verify PostgreSQL;
5. shadow and compare behavior;
6. canary selected tenants;
7. make PostgreSQL authoritative;
8. retain the legacy path read-only through the rollback window;
9. remove the legacy implementation only after evidence shows zero use.

### Target state

The target is a single production deployment containing independently structured modules, a shared PostgreSQL platform, separate background worker entry points where required, and adapters for HTTP, Telegram, reporting, storage, and migration. Runtime process separation does not create separate business services; module boundaries remain the source of business ownership.

### Possible later evolution

A module may become an independently deployed service only when measured scaling, availability, security, release-cadence, or team-ownership constraints justify it. Extraction readiness is a benefit of modularity, not a commitment to microservices.

## Non-goals

### Product non-goals evidenced by the BRD

For v1, the BRD excludes:

- a parent web portal or mobile application;
- open self-service tenant registration;
- activated platform subscription billing;
- online video lessons, examination/testing, and content management;
- complex accounting and payroll;
- third-party integrations other than Telegram.

Some excluded capabilities now have partial implementation, particularly lesson finance and payroll-related data. Their product status must be clarified; this foundation does not expand them.

### Architecture non-goals

- A big-bang rewrite.
- Microservices as a default target.
- Database-per-module deployment inside the modular monolith.
- A large generic shared library that bypasses module ownership.
- A framework rewrite solely to obtain architectural layering.
- Synchronous request-path dual writes during migration.
- Direct table integration between modules.
- Abstractions created only for cosmetic consistency.

## Enterprise Design Principles

- **Cohesion:** place behavior with the business capability that owns its invariants.
- **Loose coupling:** depend on stable contracts, not another module's internal classes or schema.
- **Replaceability:** external providers and persistence mechanisms remain adapters.
- **Traceability:** significant business state changes record actor, tenant, time, reason, and correlation where applicable.
- **Immutability:** financial postings and historical schedule/attendance facts are corrected through explicit reversal or revision, consistent with existing repository behavior.
- **Idempotency:** retryable commands and consumers produce one business outcome.
- **Least privilege:** actors receive only tenant, branch, role, and data access required by the use case.
- **Evolutionary data design:** expand, migrate, verify, contract; never destroy rollback capability early.
- **Bounded resource use:** collection APIs, workers, exports, and projections require explicit limits.
- **Testability:** domain and application policy must be verifiable with test doubles.
- **Observability:** failures must identify module and tenant without logging secrets or unnecessary personal data.
- **Documentation as governance:** boundaries, public contracts, and decisions change together with the system.

## Open Architectural Decisions

1. Approved enterprise scale and service-level objectives.
2. Final product status of implemented lesson-finance, payroll, subscription, CRM, and task capabilities that exceed the BRD's original v1 scope.
3. Mobile and third-party client strategy.
4. Authentication/session architecture after SQLite.
5. Disaster-recovery objectives and data-retention policy.
6. Regional, data-residency, or regulatory requirements.
