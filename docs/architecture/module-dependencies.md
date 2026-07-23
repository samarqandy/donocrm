# Module Dependency Governance

Status: Mandatory for new and migrated code
Related decisions: [ADR-001](adrs/ADR-001-target-architecture.md), [ADR-006](adrs/ADR-006-dependency-rule.md), [ADR-007](adrs/ADR-007-shared-kernel.md)

## Scope

These rules govern the target modular monolith and every migration slice. Existing legacy code may violate them, but a legacy violation is not precedent. New dependencies may not increase a violation without an accepted ADR.

## Target Layer Model

Each business module follows this logical structure:

```text
Interface adapters ────────► Application ────────► Domain
       │                         ▲                   ▲
       │                         │                   │
       └──── Infrastructure ─────┴───────────────────┘

Bootstrap/composition may depend on every layer to assemble the runtime.
```

### Domain

Owns entities, value objects, aggregate invariants, domain services, domain events, and domain repository abstractions when persistence is part of aggregate semantics.

Domain must not depend on:

- HTTP concepts or status codes;
- database drivers or SQL;
- filesystem, network, Telegram, Excel, or provider clients;
- environment variables;
- worker or scheduler frameworks;
- migration/store-routing mechanisms;
- another bounded context's infrastructure or persistence model.

### Application

Owns use-case orchestration, authorization decisions specific to a use case, command/query ports, transaction intent, DTO contracts, idempotency intent, and event publication intent.

Application may depend on its own Domain and approved Shared Kernel. It must not depend on concrete adapters.

### Interface adapters

HTTP controllers, worker handlers, CLI scripts, import/export endpoints, and presentation adapters translate external input into application commands and map results/errors back to the protocol.

They must not contain business policy or SQL.

### Infrastructure

Implements persistence, external-provider, clock, ID, event-delivery, storage, and observability ports. Infrastructure depends inward on Application/Domain contracts. It may use platform libraries and environment configuration.

### Bootstrap

The composition root selects concrete adapters, constructs dependency graphs, and starts entry points. It contains no business rules.

## Dependency Rule

Source-code dependencies point inward toward business policy. Runtime control may flow outward through a port, but source dependency remains inward:

```text
Application use case → NotificationPort
Telegram adapter ────→ NotificationPort

Runtime: use case calls the injected adapter.
Source: neither Domain nor Application imports Telegram.
```

The current attendance use cases and repository ports are the migration reference. Current violations such as the concrete Telegram import in `src/services/appService.js`, SQL in `src/http/api.js`, and the legacy repository's construction of an attendance adapter are recorded legacy exceptions.

## Allowed Dependencies

| From | May depend on |
|---|---|
| Module Domain | Same module Domain; approved Shared Kernel |
| Module Application | Same module Domain; own application ports; approved Shared Kernel |
| Module Interface | Same module Application; protocol-specific mapping utilities |
| Module Infrastructure | Same module Domain/Application ports; external libraries; platform infrastructure contracts |
| Module public facade | Same module Application |
| Bootstrap | All module public facades and concrete adapters |
| Reporting projections | Published module query contracts or events; never source-module tables by default |

## Forbidden Dependencies

- Domain → Application, Interface, Infrastructure, Bootstrap.
- Application → concrete database, provider, filesystem, HTTP, worker, or migration classes.
- Module A → Module B's `infrastructure/`, repository implementation, private domain object, or database table.
- HTTP/controller → SQL or repository implementation.
- Repository adapter → HTTP request/response types.
- Any module → legacy `AppService` or `AppRepository` after that capability is migrated.
- Shared Kernel → a business module.
- Business module → migration relay or store router.
- Direct imports that bypass another module's declared public facade.
- Cyclic module dependencies.

## Ports and Adapters Rules

1. A port is owned by the layer that needs the capability, not by the adapter.
2. Command repositories that rehydrate/persist aggregates normally belong to Domain; read/query ports normally belong to Application.
3. Ports must be capability-focused. A single port must not combine attendance, finance, audit, notification, and reporting responsibilities.
4. Adapters must translate database/provider errors into application-meaningful failures without leaking driver-specific codes inward.
5. Equivalent adapters must pass the same contract suite.
6. Environment-based selection occurs in Bootstrap or Infrastructure, never in Domain/Application.
7. Adapter DTOs do not become domain entities by default.
8. Migration adapters are temporary infrastructure and cannot become permanent public module APIs.

## Shared Kernel Rules

The Shared Kernel is empty/minimal by default. Admission requires all of the following:

- semantics are identical across at least two bounded contexts;
- no context owns the concept more naturally;
- independent duplication would create a material integrity risk;
- the API is small, stable, framework-neutral, and jointly reviewed;
- admission is recorded in ADR-007 or a superseding ADR.

Utilities are not automatically Shared Kernel. Date formatting, phone normalization, password hashing, HTTP errors, SQL helpers, and provider DTOs belong to an owning platform or module layer.

No business entity—Student, Teacher, Group, Lesson, Payment, or Attendance—may live in Shared Kernel.

## Repository Ownership

- A repository belongs to exactly one module.
- A command repository persists one aggregate type or a tightly defined aggregate boundary.
- A query repository serves explicit application projections and may join only data the owning context is authorized to read through an approved contract.
- Repositories do not perform HTTP authorization, render DTOs for unrelated modules, call provider APIs, or own business workflows.
- Transactions are opened by the infrastructure unit-of-work boundary requested by an application use case.
- Other modules may not import a repository to obtain the owning module's data.
- Table ownership and repository ownership must agree.

The current 5,411-line `AppRepository` is a legacy database facade and must be reduced through migration; it is not the target repository pattern.

## Cross-module Communication

### Synchronous communication

Use a public application facade when the caller requires an immediate answer to complete its use case. The callee owns validation and authorization of its facts.

Allowed examples at the architectural level:

- Attendance asks Lesson Delivery for an attendance-eligible lesson snapshot.
- Enrollment asks Groups whether a group can accept a member.
- Reporting invokes a published read contract.

The caller must not receive a mutable internal entity or repository.

### Asynchronous communication

Use an integration event when the producer has completed its own transaction and consumers can react independently. Events are delivered through an outbox/inbox mechanism when delivery reliability matters.

Rules:

- event names are past-tense facts;
- payloads contain stable identifiers and necessary snapshots, not database rows;
- producers do not know consumer implementations;
- consumers are idempotent;
- event version and ownership are documented;
- retries, dead-letter/failure state, and observability are defined;
- migration events and durable business integration events remain conceptually separate.

### Cross-context consistency

A local transaction may modify only data owned by one context in the target state. Workflows currently spanning multiple ownership areas—student creation with guardian/enrollment/opening debt, lead conversion, payment/ledger/message, and lesson settlement—require an explicit design before extraction.

Whether those workflows use orchestration, a process manager, compensating actions, or deliberately co-located ownership is an open architectural decision. Direct cross-context table writes are not an acceptable default.

## Communication Diagram

```text
HTTP / Worker / Import
          |
          v
  Module A Application
     |           |
     | sync      | committed fact
     v           v
Module B       Outbox → Event consumer in Module C
public API               |
                         v
                    Module C use case

Forbidden shortcuts:
Module A ─X→ Module B repository
Module A ─X→ Module B table
Module A ─X→ Module B infrastructure adapter
```

## Module Relationship Constraints

The expected high-level direction is acyclic:

```text
Platform context contracts
        ▲
        |
Workforce    Organization/Groups
        ▲       ▲
        |       |
      Scheduling ──► Lesson Delivery
                         ▲      ▲
                         |      |
Students/Enrollment ─────┘   Attendance
       ▲                         |
       |                         v
Admissions CRM            Lesson Finance
       |                         |
       └──── events ─────────────┤
                                 v
                         Communications

Reporting consumes published read contracts/events from all contexts;
it is not a dependency target for transactional modules.
```

The exact ownership split between Students, Guardians, Enrollment, and financial subcontexts remains open. The diagram constrains direction, not unresolved context granularity.

## Legacy Exceptions

Known current exceptions include:

- `src/http/api.js` performs export SQL.
- `src/services/appService.js` imports the Telegram client.
- `src/services/context.js` constructs services through the legacy container.
- `src/repositories/appRepository.js` combines most business contexts.
- module HTTP controllers import global legacy context/HTTP helpers.
- `src/core/errors/DomainError.js` includes HTTP status semantics.
- `src/db/client.js` combines runtime connection, schema setup, migration, repair, and backfill.

These are migration inventory, not permissions for similar new code.

## Enforcement

Before a migrated module is declared complete:

- its dependency graph contains no forbidden edges;
- its business rules can run without concrete infrastructure;
- adapter contract tests pass;
- cross-module interactions use declared contracts;
- direct legacy dependencies are removed for the migrated capability;
- architecture documentation and diagrams reflect actual ownership.
