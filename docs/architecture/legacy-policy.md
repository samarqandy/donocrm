# DONOCRM Legacy Freeze Policy

Status: Mandatory
Effective date: 2026-07-22
Scope: All production code, operational scripts, database access, APIs, workers, and browser code

## Purpose

Legacy Freeze preserves current behavior while the approved Enterprise Modular Monolith is introduced incrementally. It prevents new business capability from increasing the responsibilities of legacy god services, repositories, APIs, schema facades, workers, or frontend state.

Freeze does not mean deletion, immediate refactoring, or refusal to maintain production. It means legacy code remains operational but cannot be the home of new business behavior.

## Classification Model

- **LEGACY** — required for current compatibility, non-conforming to target boundaries, and frozen against new responsibility.
- **MIGRATING** — covered by an explicit strangler or migration boundary; may receive only approved migration, parity, rollback, and compatibility work.
- **MODERN** — conforms to current architecture rules, has explicit ownership, and is not known to rely on an unapproved legacy violation.

Classification applies to a named component, not automatically to every file in the same parent directory. The authoritative component register is [legacy-freeze-report.md](legacy-freeze-report.md).

## Mandatory Freeze Rules

1. No new business logic in `src/services/appService.js`.
2. No new business logic in `src/repositories/appRepository.js`.
3. No new SQL in `src/http/**`, module HTTP controllers, workers, or browser code.
4. No direct module-to-module SQL or access to another module's tables.
5. No new production route behavior in `src/http/api.js` except an approved compatibility/security/bug fix or migration dispatch adapter.
6. No new cross-context state or workflow in root `app.js`.
7. No new business module may depend on `AppService`, `AppRepository`, the legacy service container, or another module's Infrastructure.
8. All new business features must begin inside `src/modules/<owning-module>/` and enter through an explicit Application use case.
9. New external-provider behavior must be introduced through an Application-owned port and Infrastructure adapter.
10. New database access must be implemented in the owning module's Infrastructure adapter and conform to approved table ownership.
11. No new Shared Kernel item or consumer is allowed without an Accepted ADR.
12. No new architecture violation may be hidden inside a broad legacy exception.

These rules do not authorize creating a module or feature before its Module Readiness Gate passes.

## Permitted Legacy Changes

Legacy files may receive only:

### Bug fixes

A correction that restores already documented or tested behavior. The change must identify the failing contract/test and must not introduce a new capability, table dependency, route, or cross-context responsibility.

### Security fixes

A change that closes a demonstrated authentication, authorization, tenant-isolation, secrets, privacy, dependency, or data-safety defect. Emergency changes follow the governance exception/incident process and receive retrospective architecture review.

### Migration adapters

Routing, translation, shadow comparison, parity, relay, canary, reconciliation, or rollback code required by an approved migration plan. Migration adapters:

- contain no new business policy;
- identify current and target authority;
- are idempotent where replay is possible;
- have an owner and removal condition;
- cannot become a permanent public module API.

### Compatibility fixes

A minimal change required to preserve an existing API, DTO, persisted meaning, frontend contract, or supported operational flow while internal ownership changes. Compatibility is not permission to add a new contract.

## Prohibited Legacy Changes

- New use cases, product features, business rules, roles, permissions, workflow states, or reports in legacy components.
- New methods on `AppService` or `AppRepository` that represent business behavior.
- New legacy API route branches for business capabilities.
- New SQL statements or table joins in Presentation or workers.
- New tables owned implicitly by the central schema/repository without an approved module owner.
- New direct provider calls from services, repositories, controllers, or workers.
- New mutable global tenant, actor, branch, transaction, or request context.
- New module imports of `src/services/**`, `src/repositories/**`, `src/db/**`, or another module's private packages.
- New frontend global state for a migrated or new module.
- Moving business code into a different legacy helper to evade the freeze.

## Rules for New Development

Before any new business development begins:

1. Product Authority confirms the capability is approved.
2. The bounded context and named Module Owner are recorded.
3. A module definition based on [module-template.md](module-template.md) passes the Module Readiness Gate.
4. Use cases, public contracts, owned data, dependencies, transaction behavior, errors, and tests are documented.
5. New code is placed inside the owning module's Domain/Application/Infrastructure/Presentation boundaries.
6. Cross-module communication uses a documented public facade, query contract, or event.
7. The architecture checklist and enforcement tests produce no new violation fingerprint.

If no suitable module exists, the architecture decision precedes implementation. `AppService` and `AppRepository` are never the default fallback.

## Legacy Touch Protocol

Every pull request changing a LEGACY component must record:

| Required field | Evidence |
|---|---|
| Change category | Bug, Security, Migration Adapter, or Compatibility |
| Existing behavior being preserved | Test, OpenAPI operation, runbook, or repository evidence |
| Exact legacy files touched | File list |
| New method/route/SQL/table/dependency count | Must be zero unless a narrow migration adapter is approved |
| Violation baseline impact | Unchanged, reduced, or approved expiring exception |
| Runtime/API/schema impact | Explicitly none, or separate authorization required |
| Owner and reviewers | Named Module/Architecture/Specialist owners |
| Removal condition | Required for migration/compatibility code |

A changed legacy file is not automatically a violation; expansion of its responsibility is.

## Enforcement

The future architecture checks defined in [architecture-test-plan.md](architecture-test-plan.md) must verify:

- no new import or table-access fingerprint in frozen components;
- no new AppService/AppRepository method without an approved exception;
- no new legacy API route or Presentation SQL;
- no new root frontend global state/business workflow;
- no new dependency from a module to legacy packages;
- no growth in Shared Kernel membership/consumers;
- required legacy-touch metadata and non-expired exceptions.

Before automated checks are active, reviewers apply the same rules manually using repository diffs and the [architecture checklist](architecture-checklist.md).

## Exception Policy

Exceptions follow [architecture-governance.md](architecture-governance.md#exception-process). Every exception is narrow, owned, dated, expiring, and linked to a removal condition. Schedule pressure, convenience, or the existence of similar legacy code is not justification.

Tenant separation, authorization, credential protection, one-authority migration, and irreversible data-loss safeguards are not waivable.

## Freeze Baseline

The baseline must be a named repository commit plus the signed violation inventory from [architecture-enforcement-report.md](architecture-enforcement-report.md). No baseline commit or owner approval is currently recorded. Until recorded, this policy is normative, but automated no-growth comparison cannot be authoritative.

Recording the baseline does not approve the violations; it makes their growth measurable.

## Exit from Legacy Status

A component leaves LEGACY only after:

- its replacement module and ownership are approved;
- supported contracts and behavior have parity evidence;
- migration/rollback gates pass;
- no supported consumer uses the legacy path;
- rollback and retention windows close;
- the Architecture Owner records the new classification.

File movement or a new directory name alone cannot change classification.
