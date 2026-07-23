# ADR-008: API Versioning

- **Status:** Proposed
- **Date:** 2026-07-22
- **Decision owners:** Architecture governance

## Context

The repository exposes a substantial unversioned HTTP API under `/api` and includes an OpenAPI document. Browser clients consume these routes, and future mobile applications are mentioned as a long-term possibility but are outside the documented first release. The repository does not define compatibility duration, deprecation policy, external consumer commitments, or a versioning mechanism.

Changing route shape during modular migration without a compatibility policy could couple clients to internal migration steps. Declaring a support window without product and operational evidence would invent a business commitment.

## Decision

Propose URI-based major versioning for stable client-facing APIs, beginning with `/api/v1` when a governed public contract is introduced.

Under this proposal:

- a major version changes only for intentionally breaking contract changes;
- additive fields and endpoints remain within a major version when existing clients remain compatible;
- request validation, error envelopes, authentication semantics, pagination, and idempotency behavior form part of the contract;
- each supported major version has a separately verifiable OpenAPI definition;
- internal module APIs are not HTTP-versioned merely because modules communicate;
- the existing `/api` surface remains a legacy compatibility contract until consumers are inventoried and a migration decision is approved;
- deprecation requires published dates, observed consumer migration, telemetry, and an explicit removal decision.

This ADR remains Proposed until API consumers, compatibility duration, ownership, and deprecation communication channels are established. No route change is authorized by this ADR.

## Consequences

### Positive

- Client contracts are separated from internal module migration.
- OpenAPI can provide a testable compatibility baseline.
- Future browser and mobile clients can migrate on explicit timelines.
- Major breaking changes become deliberate governance events.

### Negative

- Multiple versions may require parallel maintenance.
- URI versioning does not by itself prevent semantic breaking changes.
- Legacy `/api` compatibility adds transition work.
- Deprecation cannot be credible without consumer identification and telemetry.

### Decisions required before acceptance

- Identify all current API consumers and owners.
- Define the minimum support and deprecation periods.
- Define which APIs are public, partner, or internal.
- Define compatibility rules for events, webhooks, and exported files.
- Approve a standard error envelope, pagination contract, and authentication evolution policy.

## Alternatives

### Continue with an unversioned API

Not preferred because it provides no explicit boundary for breaking client changes.

### Header or media-type versioning

Viable but not proposed as the default because URI versions are easier to discover and operate for the current HTTP surface. This may be revisited with gateway requirements.

### Date-based versions

Not selected because the repository does not establish a high-frequency external platform API or support model that would justify date-based releases.

### Version every endpoint independently

Rejected because it creates a fragmented contract and difficult client compatibility matrix.
