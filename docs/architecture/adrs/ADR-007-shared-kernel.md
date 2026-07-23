# ADR-007: Shared Kernel

- **Status:** Accepted
- **Date:** 2026-07-22
- **Decision owners:** Architecture governance

## Context

DONOCRM capabilities share identifiers, tenant scope, time concepts, paging, errors, and integration mechanisms. The current repository also has broad legacy services and common utilities. If convenience code is classified as a Shared Kernel, contexts will become coupled through a growing central package.

The current `core/errors/DomainError` includes an HTTP status concern, demonstrating that apparently common abstractions can leak an outer layer into domain behavior. Its existence is repository evidence, but it is not a target-layer precedent.

## Decision

The Shared Kernel is **minimal and empty by default**.

An item may enter the Shared Kernel only when it is:

- semantically identical in every consuming context;
- stable and framework-neutral;
- small enough to review as a cross-context contract;
- jointly owned by all affected contexts;
- impossible to place more accurately in a platform service or one context's public API.

Business entities, repositories, use cases, database models, HTTP errors, transport DTOs, logging, configuration, and generic convenience utilities are forbidden from the Shared Kernel.

Tenant identity and other cross-cutting primitives remain candidates, not automatically approved members. Every addition or semantic change requires architecture approval and a compatibility assessment. Duplication is preferred when meanings only appear similar or are likely to diverge.

Operational capabilities such as logging, metrics, event transport, clocks, identity generation, and transaction management are platform abstractions or application ports, not domain Shared Kernel objects.

## Consequences

### Positive

- Contexts retain autonomy over vocabulary and evolution.
- Shared code cannot become an unreviewed dependency hub.
- Similar terms may evolve independently when their business meanings differ.
- Future extraction has fewer coordinated library changes.

### Negative

- Small amounts of deliberate duplication will exist.
- Cross-context primitives require careful semantic review.
- Joint ownership makes approved kernel changes slower.
- Existing common abstractions may need to remain legacy-only until their proper ownership is decided.

## Alternatives

### Broad common library

Rejected because it would reproduce the current centralized coupling under a shared package.

### No Shared Kernel under any circumstances

Rejected because a very small set of proven, identical domain primitives may justify joint ownership.

### Share all domain entities

Rejected because an entity's meaning and lifecycle belong to its bounded context even when another context references its identifier.

### Put infrastructure utilities in the Shared Kernel

Rejected because shared infrastructure is a platform concern and must not become a domain dependency.
