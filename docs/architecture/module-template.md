# DONOCRM Module Definition Template

Status: Mandatory template for every new or migrated module
Related governance: [architecture-governance.md](architecture-governance.md)

Copy this document to the approved module-document location and replace every placeholder. Do not delete a section. Write `Not applicable` only with a concrete reason and reviewer approval. A target statement must be distinguished from current repository evidence.

## Module Metadata

| Field | Required value |
|---|---|
| Module name | `<stable domain name>` |
| Bounded context | `<name from bounded-contexts.md>` |
| Status | `Proposed / Legacy / Partial / Migrating / Active / Deprecated / Retired` |
| Module Owner | `<named accountable individual>` |
| Product Authority | `<named accountable individual>` |
| Source location | `<repository-relative path>` |
| Last reviewed | `<YYYY-MM-DD>` |
| Related ADRs/RFCs | `<links>` |

## Purpose

State the business capability this module provides, who uses it, and the repository evidence supporting its existence. Do not describe technical layers as the purpose.

## Responsibilities

### Owns

- `<business responsibility and invariant>`

### Does not own

- `<adjacent responsibility and owning module>`

## Bounded Context

- **Context name:** `<bounded context>`
- **Ubiquitous language:** `<term and precise context-specific meaning>`
- **Upstream contexts:** `<provider and relationship>`
- **Downstream contexts:** `<consumer and relationship>`
- **Context-map pattern:** `<customer/supplier, conformist, anti-corruption layer, published language, or open decision>`
- **Boundary uncertainties:** `<open questions or none>`

Explain any difference between this code module and the bounded context. A directory is not automatically a bounded context.

## Public API

Document the stable application boundary, not internal classes.

| Operation/contract | Type | Input | Output | Authorization | Compatibility owner |
|---|---|---|---|---|---|
| `<name>` | `Command / Query / Facade / Event` | `<application DTO>` | `<result DTO>` | `<actor/permission>` | `<owner>` |

List internal packages that are explicitly private. Consumers must not import them.

## Use Cases

| Use case | Actor/trigger | Preconditions | Outcome | Failure cases | Transaction/idempotency |
|---|---|---|---|---|---|
| `<ImperativeUseCase>` | `<actor or event>` | `<facts>` | `<business result>` | `<semantic failures>` | `<boundary>` |

Every public command and business query must map to a use case or have an approved reason.

## Entities

| Entity/Aggregate Root | Identity | Lifecycle | Owned invariants | Persistence independence evidence |
|---|---|---|---|---|
| `<name>` | `<ID>` | `<states/transitions>` | `<rules>` | `<tests/path>` |

Mark aggregate roots explicitly. Referenced identities from another context are not local entities by default.

## Value Objects

| Value object | Meaning | Validity/equality rules | Serialization boundary |
|---|---|---|---|
| `<name>` | `<domain meaning>` | `<rules>` | `<adapter mapping>` |

Do not list transport DTOs or database rows as value objects.

## Domain Services

| Domain service | Domain policy | Why behavior does not belong to one entity/value object | Dependencies |
|---|---|---|---|
| `<name or None>` | `<rule>` | `<reason>` | `<domain-only dependencies>` |

## Repositories

| Port | Layer owning port | Aggregate/query | Required operations | Implementing adapters | Contract tests |
|---|---|---|---|---|---|
| `<name>` | `Domain / Application` | `<scope>` | `<methods/capability>` | `<paths>` | `<test path>` |

Repositories from another module are never part of this module's public API.

## Events

### Published events

| Event/version | Trigger | Stable payload | Delivery guarantee | Ordering/idempotency | Consumers |
|---|---|---|---|---|---|
| `<PastTenseFact vN>` | `<committed fact>` | `<identifiers/snapshot>` | `<guarantee>` | `<rules>` | `<known consumers>` |

### Consumed events

| Event/version | Owner | Consumer use case | Idempotency key | Failure/replay behavior |
|---|---|---|---|---|
| `<event>` | `<producer>` | `<use case>` | `<key>` | `<policy>` |

State `None` with evidence if the module has no events.

## External Integrations

| System/provider | Purpose | Port owner | Adapter | Timeout/retry | Failure mode | Sensitive data |
|---|---|---|---|---|---|---|
| `<name or None>` | `<purpose>` | `<module/layer>` | `<path>` | `<policy>` | `<behavior>` | `<classification>` |

External providers must not appear in Domain/Application except through ports.

## Dependencies

### Allowed dependencies

| Dependency | Contract used | Direction | Synchronous/asynchronous | Rationale |
|---|---|---|---|---|
| `<module/platform>` | `<public contract>` | `<consumer -> provider>` | `<mode>` | `<reason>` |

### Forbidden or removed dependencies

- `<internal package, table, adapter, or legacy facade that must not be used>`

### Temporary exceptions

| Exception | Owner | Expiry/removal condition | Compensating control |
|---|---|---|---|
| `<approved exception or None>` | `<name>` | `<condition>` | `<test/control>` |

## Database Ownership

| Table/view/stream | Ownership | Authoritative store | Tenant key | Aggregate/projection | Writers | Readers |
|---|---|---|---|---|---|---|
| `<name>` | `Owned / Temporary compatibility / External` | `<SQLite/PostgreSQL/other>` | `<key or N/A>` | `<role>` | `<module>` | `<approved contracts>` |

Also document:

- foreign-key and tenant-consistency constraints;
- transaction boundaries and isolation/concurrency assumptions;
- immutable/reversal rules;
- retention and deletion authority;
- legacy duplicate fields and their retirement condition.

## API Endpoints

| Method/path | Application use case | Request/response contract | Auth/permission | Version/status | OpenAPI evidence |
|---|---|---|---|---|---|
| `<METHOD /path or None>` | `<use case>` | `<schema>` | `<rule>` | `<legacy/stable/deprecated>` | `<path/reference>` |

HTTP endpoints are adapters and do not define module ownership.

## Tests

| Test type | Required behavior | Evidence/path | Status |
|---|---|---|---|
| Domain | `<invariants/state transitions>` | `<test>` | `<missing/passing>` |
| Use case | `<authorization/outcomes/failures>` | `<test>` | `<status>` |
| Repository contract | `<all active adapters>` | `<test>` | `<status>` |
| Integration | `<database/provider/outbox>` | `<test>` | `<status>` |
| HTTP contract | `<validation/error/DTO>` | `<test>` | `<status>` |
| Tenant isolation | `<two-tenant/cross-ID attempts>` | `<test>` | `<status>` |
| Migration | `<backfill/parity/replay/rollback>` | `<test>` | `<status>` |
| End-to-end | `<critical workflow>` | `<test>` | `<status>` |

Record objective commands and expected results where the repository does not provide a stable test report location.

## Migration Status

| Field | Current evidence |
|---|---|
| Current architecture | `<legacy/partial/target details>` |
| Current authority by tenant/data set | `<store/module>` |
| Target authority | `<store/module>` |
| Migration phase | `<not started/characterized/shadow/canary/authoritative/retiring>` |
| Backfill/parity state | `<evidence>` |
| Canary scope | `<explicit tenant cohort or none>` |
| Rollback trigger and path | `<evidence>` |
| Legacy removal criterion | `<condition>` |
| Blocking decisions | `<ADRs/questions>` |

Do not mark a module migrated merely because a target directory exists.

## Future Work

| Item | Reason/evidence | Dependency/decision | Priority authority | Status |
|---|---|---|---|---|
| `<work item>` | `<repository evidence>` | `<ADR/RFC/open question>` | `<Product/Architecture/Operations>` | `<Proposed/Open>` |

Future work is not an approved feature commitment unless Product Authority has approved it.

## Architecture Approval

| Gate | Decision | Approver | Date | Evidence/actions |
|---|---|---|---|---|
| Module Readiness | `<Passed/Failed>` | `<Architecture Owner>` | `<date>` | `<links>` |
| Migration Cutover | `<Not applicable/Pending/Passed/Failed>` | `<required owners>` | `<date>` | `<links>` |
| Legacy Retirement | `<Not applicable/Pending/Passed/Failed>` | `<required owners>` | `<date>` | `<links>` |
