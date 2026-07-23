# ADR-006: Dependency Rule

- **Status:** Accepted
- **Date:** 2026-07-22
- **Decision owners:** Architecture governance

## Context

The target architecture needs domain rules that can be tested without HTTP, SQLite, PostgreSQL, Telegram, or process configuration. The extracted Attendance module already distinguishes domain, application, infrastructure, and HTTP concerns, while legacy services and repositories still combine multiple capabilities.

Without an explicit dependency rule, a modular directory structure can retain framework and persistence coupling beneath new names.

## Decision

All compile-time dependencies point inward:

```text
Presentation/Infrastructure --> Application --> Domain
```

The Domain layer imports only its own domain code and explicitly approved framework-neutral Shared Kernel types. The Application layer imports Domain and declares ports. Infrastructure and Presentation implement or invoke those contracts. The composition root is the only place that constructs concrete dependency graphs.

Across bounded contexts, callers may depend only on the provider's public application facade, published contract, or integration event. Direct imports of another context's domain internals, infrastructure adapters, repositories, database models, or private presentation code are forbidden.

Interface ownership follows the consumer: a port required by a use case is declared in that use case's application boundary, and an outward adapter implements it. Domain objects do not carry HTTP status codes, SQL fragments, ORM objects, environment access, logging adapters, or transport payload semantics.

The complete enforceable rules are maintained in [module-dependencies.md](../module-dependencies.md).

## Consequences

### Positive

- Business rules remain independently testable and persistence-neutral.
- Adapters can change without reversing dependency direction.
- Module contracts and architectural violations become statically testable.
- Future extraction or framework migration has a smaller coupling surface.

### Negative

- Mapping is required at transport, persistence, and module boundaries.
- Composition and transaction ownership must be designed explicitly.
- Legacy code requires temporary adapters while it is strangled.
- Excessively granular ports can add indirection without business value.

### Legacy policy

Existing violations are migration debt, not precedent. New dependencies may not expand a known violation. Temporary exceptions require an owner, rationale, automated scope check where possible, and removal criterion.

## Alternatives

### Framework-led dependencies

Rejected because domain and use-case behavior would remain tied to transport and persistence decisions.

### Shared repository and service layer

Rejected as the target because it centralizes unrelated context knowledge and permits implicit cross-module access.

### Runtime dependency injection framework

Not required. Explicit construction at the composition root is sufficient; a container may be evaluated later if repository evidence shows a concrete composition problem.

### Direct module-internal imports for performance

Rejected by default. Any performance-motivated exception requires measurement and a separate decision because it sacrifices ownership boundaries.
