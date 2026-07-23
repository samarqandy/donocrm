# DONOCRM Architecture Governance

Status: Mandatory governance policy
Established: 2026-07-22
Scope: Architecture decisions, modules, migrations, pull requests, and releases

## Architecture Governance Model

DONOCRM uses **Single-Founder Governance** for the Enterprise Modular Monolith:

- **Sukhrob Khaydarov** is the Architecture Owner and Product Authority;
- until the engineering team expands, Sukhrob Khaydarov is the Module Owner for every bounded context;
- the Architecture Owner is the final approver for Architecture, Product, Data, Operations, Quality, Security, Migration Gates, ADRs, and Release Readiness;
- the governance roles remain logically distinct so that each decision records which concern was evaluated, even though one person currently holds the roles;
- implementation teams may decide local details that remain inside accepted module boundaries and standards.

Governance is evidence-based. A document, test result, diagram, migration report, or approved decision must support every gate assertion. Silence is not approval, and existing legacy behavior is not architectural precedent.

This model governs future work. It remains valid until superseded by a future ADR. It does not by itself authorize a migration phase or any source-code change.

## Roles and Responsibilities

| Role | Accountable responsibilities | Required participation |
|---|---|---|
| Architecture Owner | Target architecture, context map, dependency rules, ADR acceptance, cross-module decisions, exceptions, and architecture gates | All system-wide or cross-context decisions and every phase gate |
| Module Owner | Module definition, invariants, public API, owned data, dependencies, tests, migration state, and deprecations | Every change affecting the owned module |
| Product Authority | Business scope, terminology, compatibility commitments, acceptance criteria, and prioritization | Business-rule, workflow, role, or supported-client changes |
| Security Reviewer | Authentication, authorization, tenant isolation, secrets, privacy, abuse cases, and audit controls | Any security boundary, sensitive data, or externally accessible contract change |
| Data Owner/Reviewer | Schema ownership, integrity, retention, migration, reconciliation, backup, and recovery | Database, event schema, retention, backfill, or authority change |
| Operations Owner | Deployment, observability, capacity, availability, rollback execution, and incident readiness | Runtime topology, workers, external integrations, or release gates |
| Quality Owner | Test strategy, contract evidence, regression coverage, and gate evidence | Module migration, breaking change, and release gates |
| Change Author | RFC/ADR/PR evidence, impact analysis, implementation conformance, and documentation updates | Every proposed change |
| Reviewer | Verification against the checklist and accepted decisions | Every pull request; independent review becomes mandatory when a reviewer is appointed or required by a future ADR |

Under Single-Founder Governance, one person currently holds multiple roles and may provide the final approval for a decision, exception, or phase gate. Each role exercised, the evidence reviewed, the decision date, and accepted risks must still be recorded separately. This temporary absence of segregation of duties is a known governance risk, not permission to omit specialist criteria. Independent approval requirements must be introduced through the ADR that supersedes this policy when the team expands.

## Architecture Owner

| Field | Value |
|---|---|
| Assigned individual | Sukhrob Khaydarov |
| Appointment authority | Single-Founder Governance |
| Delegate | None appointed |
| Effective date | 2026-07-22 |

The absence of a delegate is explicitly recorded and is a continuity risk. The Architecture Owner must appoint a delegate or replacement authority through the ADR that supersedes Single-Founder Governance when the team expands or continuity requirements demand it.

## Current Authority Assignment

| Decision area | Accountable and final approval authority |
|---|---|
| Architecture | Sukhrob Khaydarov |
| Product | Sukhrob Khaydarov |
| Data | Sukhrob Khaydarov |
| Operations | Sukhrob Khaydarov |
| Quality | Sukhrob Khaydarov |
| Security | Sukhrob Khaydarov |
| Migration Gates | Sukhrob Khaydarov |
| ADRs | Sukhrob Khaydarov |
| Release Readiness | Sukhrob Khaydarov |

## Module Owners

The bounded contexts are defined in [bounded-contexts.md](bounded-contexts.md). The following ownership register is authoritative until replaced by an approved ownership update.

| Bounded context | Assigned Module Owner | Status |
|---|---|---|
| Platform Administration & Tenancy | Sukhrob Khaydarov | Assigned under Single-Founder Governance |
| Identity & Access | Sukhrob Khaydarov | Assigned under Single-Founder Governance |
| Organization & Branches | Sukhrob Khaydarov | Assigned under Single-Founder Governance |
| Workforce | Sukhrob Khaydarov | Assigned under Single-Founder Governance |
| Academic Groups | Sukhrob Khaydarov | Assigned under Single-Founder Governance |
| Scheduling | Sukhrob Khaydarov | Assigned under Single-Founder Governance |
| Lesson Delivery | Sukhrob Khaydarov | Assigned under Single-Founder Governance |
| Student Information | Sukhrob Khaydarov | Assigned under Single-Founder Governance |
| Guardians & Enrollment | Sukhrob Khaydarov | Ownership assigned; boundary decision remains open |
| Attendance | Sukhrob Khaydarov | Assigned under Single-Founder Governance |
| Student Billing & Ledger | Sukhrob Khaydarov | Ownership assigned; boundary decision remains open |
| Lesson Finance & Payroll | Sukhrob Khaydarov | Ownership assigned; boundary decision remains open |
| Communications | Sukhrob Khaydarov | Assigned under Single-Founder Governance |
| Admissions CRM | Sukhrob Khaydarov | Assigned under Single-Founder Governance |
| Work Management | Sukhrob Khaydarov | Ownership assigned; boundary decision remains open |
| Reporting & Export | Sukhrob Khaydarov | Ownership assigned; boundary decision remains open |
| Audit & History | Sukhrob Khaydarov | Assigned under Single-Founder Governance |

A module cannot pass its Architecture Readiness Gate without a named owner. Cross-cutting infrastructure also requires an accountable owner, but it does not become a bounded context merely by having one.

## ADR Process

An ADR is required for a durable decision affecting more than one module or changing any subject listed in [README.md](README.md#decision-lifecycle).

1. **Trigger:** The author identifies the decision, evidence, affected contexts, and deadline.
2. **Discovery:** Existing ADRs and authoritative documents are checked before proposing a new decision.
3. **Proposal:** Create the next numbered ADR with Status, Context, Decision, Consequences, and Alternatives. Status is `Proposed`.
4. **Consultation:** Module Owners and required specialist reviewers record concerns and evidence.
5. **Decision:** The Architecture Owner accepts the ADR or leaves it Proposed pending evidence. Product Authority approves business commitments.
6. **Publication:** Update the ADR index and all directly affected diagrams, module definitions, standards, and contracts in the same documentation change.
7. **Enforcement:** Accepted decisions are linked from checklists and automated architecture tests where feasible.
8. **Evolution:** A changed decision creates a new ADR. The prior ADR becomes `Superseded` and links to its replacement. A decision retained only for compatibility becomes `Deprecated` with exit criteria.

Permitted ADR statuses are exactly `Proposed`, `Accepted`, `Superseded`, and `Deprecated`. Alternatives not selected are explained in the ADR; they do not require a separate rejected status.

## RFC Process

An RFC is used before an ADR when the problem is not yet sufficiently understood, affects multiple stakeholders, or needs design comparison or a trial. RFCs are discussion records, not authority.

Each RFC must record:

- identifier, title, author, owner, status, and decision deadline;
- problem and repository evidence;
- in-scope and out-of-scope concerns;
- affected contexts, data, contracts, users, and operations;
- at least two viable options when alternatives exist;
- security, tenant, migration, compatibility, and operational impact;
- validation plan and unresolved questions;
- resulting ADR, closure reason, or expiry.

RFCs belong under `docs/architecture/rfcs/` when the first RFC is approved. An RFC cannot override an Accepted ADR.

## Change Management Process

Every architecture-relevant change is classified before implementation:

| Class | Definition | Required governance |
|---|---|---|
| Local | Internal change within one accepted module contract and existing rules | Module Owner review and PR checklist |
| Contract | Changes a module public API, event, database ownership, use-case behavior, or supported client contract | Module Owner, affected consumers, specialist review, compatibility plan |
| Architectural | Changes a bounded context, dependency rule, shared kernel, persistence authority, topology, consistency model, or migration strategy | RFC when discovery is needed; Accepted ADR before implementation |
| Breaking | Removes or incompatibly changes a supported contract or persisted meaning | Architectural review, accepted version/deprecation decision, consumer migration and rollback evidence |
| Emergency | Production safety or security response that cannot wait for normal review | Minimum safe change, incident record, Architecture Owner notification, retrospective review within an agreed incident deadline |

The author must identify affected modules and data owners. Changes cannot be split across pull requests to evade a higher classification.

## Architecture Review Process

1. Confirm business authority and repository evidence.
2. Identify bounded context, Module Owner, public contracts, owned data, and dependencies.
3. Classify the change and determine required reviewers.
4. Compare the design with Accepted ADRs, dependency rules, coding standards, and module definition.
5. Review tenant isolation, security, transactions, failure behavior, observability, compatibility, and rollback.
6. Record findings as Passed, Required Action, or Blocking.
7. Verify required actions using linked evidence; verbal confirmation is insufficient.
8. Record the decision and approvers in the RFC, ADR, PR, or gate report.

Architecture review does not substitute for code review, security review, data review, or operational readiness review.

## Decision-Making Process

- Decisions seek evidence-based consensus among affected owners.
- Under Single-Founder Governance, Sukhrob Khaydarov is the final decision authority when consensus is not reached.
- The Architecture Owner is accountable for architecture decisions; the Product Authority decides business scope and external compatibility commitments. Sukhrob Khaydarov currently holds both roles.
- A Module Owner decides internal design only within Accepted ADRs and without imposing new obligations on another module.
- Security or tenant-isolation objections remain blocking until resolved or accepted through a non-waivable policy change; schedule pressure is not resolution.
- A decision record must state who decided, when, the evidence considered, and dissenting risks.
- Unavailable information is recorded as an open decision, not assumed.

## Exception Process

An exception is temporary permission to violate one named rule. It is not a new standard.

An exception request must include:

- identifier, requester, accountable owner, and approver;
- exact rule and exact files/components affected;
- repository evidence showing why conformance is currently impractical;
- business and architectural impact;
- compensating controls and tests;
- start date, expiry date, removal criterion, and tracking reference;
- rollback or containment plan.

The Architecture Owner and affected Module Owner must approve an exception. Security Reviewer approval is additionally required for security-related exceptions. Exceptions cannot waive tenant separation, credential protection, authorization, irreversible data-loss safeguards, or the requirement for one authoritative store during migration.

Expired exceptions block merge and release. Permanent deviation requires an ADR that changes the rule.

## Definition of Done (Architecture)

An architecture-relevant change is done only when:

- its bounded context and named owner are recorded;
- affected responsibilities, use cases, invariants, public contracts, data, and dependencies are documented;
- no forbidden dependency or unapproved shared ownership is introduced;
- tenant, branch, actor, security, privacy, and audit behavior are explicit;
- transaction, consistency, idempotency, failure, and rollback behavior are defined;
- tests objectively cover domain, application, adapter, contract, isolation, and migration risks as applicable;
- OpenAPI and event schemas match supported contracts;
- monitoring and operational failure indicators exist for runtime changes;
- migrations have authority, parity, reconciliation, canary, and rollback evidence;
- ADRs, module documentation, diagrams, and checklists are current;
- all required reviewers have approved and no exception is expired.

“Code complete,” passing unit tests alone, or an undocumented manual verification does not satisfy this definition.

## Architecture Gate Process

| Gate | When | Minimum evidence | Decision authority |
|---|---|---|---|
| Foundation Gate | Before migration program begins | Vision, context map, dependency rules, standards, governance, ADR set, open-decision register | Architecture Owner and Product Authority |
| Module Readiness Gate | Before work on a module | Completed module definition, named owner, characterized behavior, dependency/data map, accepted decisions, migration/rollback design | Architecture Owner, Module Owner, required specialists |
| Pull Request Gate | Before merge | Completed PR checklist, tests, contract/docs update, no unresolved blocking review | Module Owner and code reviewers |
| Migration Cutover Gate | Before tenant/source authority changes | Backfill/parity results, canary scope, thresholds, observability, reconciliation, tested rollback, operations approval | Architecture Owner, Data Owner, Operations Owner, Module Owner |
| Release Gate | Before production release | Release checklist, compatibility/deprecation evidence, security and operational readiness, approved exceptions only | Release authority plus required owners |
| Legacy Retirement Gate | Before removing compatibility path or data | Zero-use evidence, retention/rollback window closed, consumer migration complete, restore plan, accepted removal decision | Architecture Owner, Data Owner, Module Owner |

A gate result is `Passed`, `Passed with non-blocking actions`, or `Failed`. A required action with no owner or due condition is blocking. Gate records remain in `docs/architecture/` or a linked release evidence system approved by ADR.

## Breaking Change Policy

A breaking change includes incompatible changes to HTTP or application APIs, events, exports, authentication behavior, error semantics, persisted meanings, required fields, identifiers, or business-state transitions consumed outside the owner.

- Breaking changes require identified consumers and an approved compatibility strategy before implementation.
- The existing unversioned `/api` surface remains a compatibility contract under ADR-008 while that ADR is Proposed.
- Internal refactoring is not breaking only when observable contracts and persisted meanings remain compatible.
- Database expansion precedes contraction; destructive contraction requires the Legacy Retirement Gate.
- Event consumers must tolerate supported additive evolution; incompatible event semantics require a new contract version.
- Emergency security changes may shorten normal compatibility only with Product, Security, Operations, and Architecture approval and explicit communication.

No universal support duration is defined because the repository contains no approved commitment. A duration must be approved before the first deprecation notice.

## Deprecation Policy

Every deprecation must record:

- owner and affected contract;
- replacement and migration instructions;
- known consumers and notification channel;
- announcement date, last-supported date, and removal condition;
- usage telemetry and success threshold;
- rollback or restoration strategy;
- ADR or contract decision authorizing removal.

Deprecated behavior remains tested and supported until its stated removal condition is satisfied. Warnings must be observable but must not expose sensitive data. An undocumented endpoint, field, event, table, or legacy path cannot be removed merely because no owner is known.

The minimum deprecation period remains an open decision tied to ADR-008 and consumer inventory.

## Documentation Maintenance Policy

- Architecture documentation changes in the same pull request as the decision or contract it describes.
- The Architecture Owner reviews the document index, ADR statuses, open decisions, exceptions, and diagrams at every phase and release gate.
- Module Owners review their module definition whenever responsibilities, contracts, schema, integrations, or migration state change.
- Repository-relative links and exact evidence paths are preferred; unsupported future claims are labeled Proposed or Open.
- Duplicated normative rules must identify one canonical owner document. ADRs own why/decision; dependency governance owns dependency rules; coding standards own implementation conventions; module definitions own module-specific facts.
- Superseded and Deprecated ADRs remain for history and link to their successor or removal condition.
- Broken links, stale statuses, unnamed owners, and undocumented exceptions fail the documentation check.
- A scheduled review frequency is not invented here; the Architecture Owner must approve one before Phase 1.
