# DONOCRM Engineering and Architecture Standards

Status: Mandatory for new and migrated code
Scope: Standards for later implementation phases; Phase 0 itself changes documentation only

## 1. General Standard

Code must optimize for explicit business ownership, tenant safety, testability, compatibility, and operational recovery. Compact code is not preferred over clear boundaries. Existing legacy style is not automatically an approved pattern.

Normative terms follow their ordinary governance meaning:

- **MUST / MUST NOT** — mandatory; exception requires an ADR or documented temporary waiver.
- **SHOULD / SHOULD NOT** — expected; deviation must be explained in review.
- **MAY** — optional.

## 2. Folder Structure

Target top-level structure:

```text
src/
  bootstrap/                  # composition roots only
  core/                       # approved Shared Kernel only
  modules/
    <module>/
      domain/
      application/
      infrastructure/
      http/                   # or interfaces/http when standardized later
  infrastructure/             # platform-wide technical capabilities
  interfaces/                 # optional shared entry-point adapters
```

The current repository uses CommonJS. New code MUST remain consistent with the active runtime module system unless a separate ADR approves migration.

## 3. Module Layout

A migrated module SHOULD use the smallest subset of this layout that expresses real responsibilities:

```text
modules/<module>/
  domain/
    entities/
    valueObjects/
    events/
    services/
    repositories/             # aggregate repository ports
  application/
    useCases/
    queries/
    ports/
    dto/
    publicApi.js
  infrastructure/
    persistence/
      sqlite/                  # temporary during migration
      postgres/
    integrations/
    messaging/
  http/
    controller.js
    routes.js
```

Empty directories MUST NOT be created for architectural appearance. A module's public surface is its application facade, documented query contracts, and published events.

## 4. Naming Conventions

- Modules use stable domain nouns: `attendance`, `students`, `scheduling`.
- Use cases use imperative business names: `MarkAttendance`, `ReopenAttendance`, `RegisterPayment`.
- Query use cases use `Get`, `List`, or an explicit business projection name.
- Repository ports use aggregate/capability names: `AttendanceRepository`, not `DatabaseRepository`.
- Infrastructure classes include the technology when relevant: `PostgresAttendanceRepository`.
- Domain events use past-tense facts: `AttendanceMarked`, `PaymentRegistered`.
- Integration event names include an explicit version in their contract metadata, not necessarily in the class name.
- IDs and external field aliases are normalized at adapters. Domain/Application use one canonical naming convention.
- Boolean names use `is`, `has`, `can`, or `should` when that improves meaning.
- Avoid ambiguous names such as `data`, `item`, `service`, `manager`, or `helper` for domain concepts.

Database naming remains `snake_case`. JavaScript domain/application naming remains `camelCase` for fields and `PascalCase` for classes.

## 5. Use Case Conventions

- One use-case class or focused function represents one user/system intention.
- The public operation is named `execute(context, input)` unless an accepted module convention defines an equivalent.
- `context` contains authenticated actor and tenant scope supplied by the platform; clients cannot override it in input.
- Input is validated at the application/domain boundary. HTTP shape conversion occurs before execution.
- A use case coordinates domain objects and ports; it does not issue SQL, read environment variables, or call concrete providers.
- Authorization is explicit and test-covered.
- Side-effect intent is visible in the use case and committed atomically where required.
- Retryable commands define idempotency behavior.
- A use case returns an application result/DTO, not an HTTP response or database row.

## 6. Repository Conventions

- Command repositories represent aggregate persistence, not the entire database.
- Query repositories expose purpose-specific projections and bounded result sets.
- Every tenant-owned operation receives tenant scope explicitly or through a transaction context that cannot omit it.
- PostgreSQL adapters use tenant-consistent keys and relationships.
- Repository methods do not decide HTTP status, user-facing localization, or external delivery policy.
- Repository interfaces MUST NOT contain unrelated audit, notification, finance, and reporting operations for convenience.
- Adapters normalize driver errors at the boundary.
- Equivalent SQLite/PostgreSQL adapters used during migration pass the same contract tests.
- No module imports another module's repository.

## 7. Service Conventions

The word `Service` is reserved:

- **Domain Service:** domain policy that naturally spans multiple domain objects but belongs to one context.
- **Application Service:** orchestration facade over related use cases; it does not become a god service.
- **Infrastructure Service/Adapter:** external technical capability implementing a port.

Do not create a service when behavior belongs on an entity/value object or is already a single use case. Generic `AppService`, `CommonService`, and `UtilityService` patterns are forbidden in migrated code.

## 8. Error Handling

- Domain failures are framework-neutral and carry stable semantic codes where callers need branching.
- HTTP adapters map application/domain failures to status codes.
- Internal exceptions and driver/provider messages are not exposed to clients.
- Validation failures, authorization failures, conflicts, not-found conditions, concurrency failures, and infrastructure unavailability remain distinguishable.
- Errors include enough context for logs without secrets or unnecessary personal data.
- Expected business failures are tested.
- Catch blocks MUST either recover, translate, add meaningful context, or rethrow. Silent catches require explicit justification.

The current `DomainError.status` coupling is a legacy exception to be removed when the error contract is migrated.

## 9. Transaction Standards

- A transaction protects one aggregate or one explicitly approved local consistency boundary.
- Transaction orchestration is requested by Application and implemented by Infrastructure.
- External network calls do not occur inside database transactions.
- Reliable external side effects use transactional outbox intent.
- Financial postings and durable history are append-only or reversed through explicit business operations.
- Concurrency-sensitive commands use version checks or database constraints and return deterministic conflicts.
- Retryable commands define idempotency keys, request fingerprint behavior, and duplicate-result semantics.
- Cross-context atomic transactions require an ADR or an approved temporary migration exception.
- Migrations use expand–migrate–contract; contraction waits until rollback gates close.
- Synchronous request-path dual writes are forbidden.

## 10. Logging and Audit

Application logs and business audit records are different concerns.

### Operational logging

- Use structured records.
- Include timestamp, severity, module, operation, correlation/request ID, and tenant ID when available.
- Include actor ID only when operationally necessary.
- Never log passwords, session tokens, Telegram bot tokens, encryption keys, cookies, or full secrets.
- Avoid full student, guardian, phone, email, message, or financial payloads.
- Provider and database failures retain stable internal error categories.
- Background workers log claim, retry, lag, terminal failure, and shutdown outcomes.

### Business audit

- Audit security- and business-significant state changes with tenant, actor, action, entity identity, time, and reason when required by the workflow.
- Audit records are immutable from ordinary business operations.
- Audit retention duration is an open architectural decision.

## 11. Testing Standards

Each migrated capability requires proportionate coverage:

1. **Domain tests** — entities, value objects, state transitions, invariants; no database or network.
2. **Use-case tests** — application behavior with port doubles, including authorization and failure cases.
3. **Repository contract tests** — the same behavioral contract against every active adapter.
4. **Integration tests** — real database constraints, transactions, outbox/inbox behavior, and provider adapters through controlled fakes where appropriate.
5. **HTTP contract tests** — authentication, authorization, validation, error mapping, and DTO compatibility.
6. **Tenant-isolation tests** — at least two tenants and cross-tenant identifier attempts.
7. **Migration tests** — backfill, parity, stale/reordered events, replay, rollback, and idempotency.
8. **End-to-end tests** — critical business flows across the deployed interfaces.

Tests MUST be deterministic. Time, IDs, external providers, and environment selection are injected or controlled. Production data is not a test fixture.

No module is considered migrated while its critical behavior is covered only by legacy end-to-end tests.

## 12. API and Query Standards

- OpenAPI is updated with every HTTP contract change.
- Existing unversioned `/api` routes remain compatibility contracts until ADR-008 is accepted and migration is planned.
- Collection endpoints are bounded; pagination, limits, ordering, and filters are explicit.
- Sensitive fields are authorized and projected intentionally, as existing teacher-safe student DTOs demonstrate.
- Commands do not use GET; reads do not mutate state.
- Concurrency/version and idempotency requirements are documented.
- Export/report generation uses application/reporting queries, never direct controller SQL.

## 13. Documentation Standards

- Each module documents purpose, owned data, public application API, published/consumed events, dependencies, invariants, authorization rules, and operational concerns.
- Significant decisions use ADRs.
- Diagrams identify current versus target state and use C4 terminology where appropriate.
- Migration runbooks state prerequisites, success gates, rollback steps, and irreversible actions.
- Comments explain why a non-obvious invariant or compatibility rule exists; they do not restate code.
- Temporary compatibility paths include an owner and removal condition.

## 14. Architecture Rules

- No business logic in controllers, workers, scripts, repository mappers, or migration relays.
- No SQL outside an owning persistence/reporting adapter.
- No direct cross-module table or infrastructure access.
- No cyclic module dependency.
- No new behavior in legacy god classes when a target module exists.
- No global mutable tenant context.
- No source-of-truth switch without parity, canary, and rollback evidence.
- No provider-specific concepts in Domain/Application unless they are genuinely part of approved business language.
- No broad Shared Kernel additions without ADR review.

## 15. Code Review Requirements

Every later implementation review must answer:

- Which bounded context owns this change?
- What use case and invariant change?
- Does it create or alter a public contract?
- Are tenant and branch scopes enforced?
- Does it introduce a forbidden dependency or direct table access?
- Is the transaction boundary owned by one context?
- Are retries and idempotency defined where required?
- Can business logic be tested without infrastructure?
- Are error and sensitive-data behaviors safe?
- Are OpenAPI, module documentation, diagrams, and ADRs current?
- What is the migration/cutover gate?
- What is the rollback strategy?
- Does the change expand a legacy exception?

Architectural exceptions must be explicit, time-bounded, owned, and approved. “Existing code does it” is not sufficient justification.
