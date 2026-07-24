# Workforce Public Application Contracts

Decision ID: WF-PRE-09

Status: Approved

Decision date: 2026-07-24

Contract version: `1.0.0`

## Decision

Workforce has two and only two public Application surfaces for first extraction:

1. `WorkforceCompatibilityApplicationV1` exposes the ten existing Teacher/Working Hour use cases to the existing HTTP compatibility adapter.
2. `TeacherReferenceApplicationV1` exposes one minimal tenant-scoped Teacher reference/status query to approved downstream modules.

The authoritative exact contract is [workforce-application-contracts.json](../../architecture/workforce-application-contracts.json), SHA-256:

`63c045defc757645ab1d4a20fb47220cbaeefddf6077bc5bee089fc31bcfd382`

The manifest fixes method signatures, canonical inputs, exact response field sets, semantic error unions, authorization context, ordering, privacy projections, idempotency expectations, seam linkage, target deltas, and approvals. The verifier is `npm run architecture:workforce-application`.

No runtime source, HTTP route, request/response behavior, database, schema, or table was changed by this decision.

## Boundary and Ownership

`WorkforceCompatibilityApplicationV1` is an outer Application coordinator assembled by Bootstrap. It coordinates public provider outcomes required by the frozen HTTP workflow and owns final compatibility composition, but it owns no Identity, Branch, Group, Schedule, Lesson, Student, or Audit data. Workforce Domain/Application code must not import those providers' repositories, infrastructure, private models, or tables.

The HTTP adapter remains responsible for:

- parsing URL and JSON;
- accepting frozen camelCase/snake_case aliases;
- reproducing frozen JavaScript coercion and ignored-body behavior;
- constructing verified actor/tenant context;
- mapping typed Application outcomes to the frozen status/error envelopes.

Application contracts accept canonical DTOs only. HTTP request objects, response objects, aliases, sessions, full User records, mutable Domain entities, database rows, and provider models are not public DTOs.

## Verified Contexts

`WorkforceActorContextV1` contains exactly:

| Field | Type / rule |
|---|---|
| `tenantId` | Active verified tenant identifier |
| `actorUserId` | Authenticated actor identifier |
| `role` | Effective `admin` or `teacher` role |
| `permissions` | Verified unique permission strings |
| `correlationId` | Request correlation identifier |

The Application owns the authorization decision and rechecks role, permission, and self scope. Middleware checks remain defense in depth. A request DTO cannot supply or override actor, role, permission, or tenant.

`WorkforceServiceContextV1` contains exactly `tenantId`, allow-listed `caller`, and `correlationId`. It carries no human session, role, permission, credential, or User record.

## Compatibility Application Contract

| ID | Public method | Kind | Canonical input | Success result | Authorization |
|---|---|---|---|---|---|
| WF-APP-01 | `listTeachers` | Query | `NoInputV1` | Admin/Self directory union | Admin tenant-wide; Teacher self-only |
| WF-APP-02 | `getTeacherProfile` | Query | `TeacherIdV1` | Admin/Self profile union | Admin tenant Teacher; Teacher own ID only |
| WF-APP-03 | `createTeacher` | Command | `CreateTeacherCommandV1` | `TeacherAdminViewV1` | Admin |
| WF-APP-04 | `updateTeacher` | Command | `UpdateTeacherCommandV1` | `TeacherAdminViewV1` | Admin |
| WF-APP-05 | `archiveTeacher` | Command | `TeacherIdV1` | `TeacherAdminViewV1` | Admin |
| WF-APP-06 | `restoreTeacher` | Command | `TeacherIdV1` | `TeacherAdminViewV1` | Admin |
| WF-APP-07 | `resetTeacherPassword` | Command | `ResetTeacherPasswordCommandV1` | `SuccessV1` | Admin |
| WF-APP-08 | `listTeacherWorkingHours` | Query | `NoInputV1` | `TeacherWorkingHoursResultV1` | Admin tenant-wide; Teacher self-only |
| WF-APP-09 | `createTeacherWorkingHour` | Command | `CreateTeacherWorkingHourCommandV1` | `TeacherWorkingHourViewV1` | `lessons.manage` |
| WF-APP-10 | `deleteTeacherWorkingHour` | Command | `WorkingHourIdV1` | `TeacherWorkingHourViewV1` | Admin |

Every method takes `WorkforceActorContextV1` as its first argument. The exact signatures and closed semantic error unions are in the machine manifest.

### Canonical write inputs

`TeacherCreateProfileV1` contains the normalized profile fields and uses `maxWeeklyMinutes` rather than the transport name `maxWeeklyHours`. All fields are present after adapter normalization. `portalAccess` is either null or an exact username/password provisioning intent.

`TeacherUpdateProfileV1` makes `name`, `phone`, `email`, `specialization`, and `note` present after transport normalization. Optional employment, hire date, workload ceiling, and Branch fields preserve current values when omitted. `portalAccessChange` is a distinct nullable intent; it is not inferred from a mutable User record.

`CreateTeacherWorkingHourCommandV1` contains `teacherId`, integer weekday `1..7`, strict `HH:mm` start/end times, and an Organization-resolved `branchId|null`.

Passwords are Identity-only secret input. They may not enter result DTOs, logs, audit intents, downstream references, or error details.

## Exact Result and Privacy Rules

The manifest binds:

- 21 fields in `TeacherAdminViewV1`;
- 19 fields in `TeacherSelfViewV1`, omitting `username` and `accessStatus` while retaining `hasAccess`;
- 9 fields in `TeacherWorkingHourViewV1`;
- 32 fields in `TeacherProfileGroupAdminViewV1`;
- 31 fields in `TeacherProfileGroupSelfViewV1`, omitting `monthlyFee`;
- 44 fields in `TeacherProfileLessonViewV1`;
- role-discriminated Teacher directory and profile result unions.

These are immutable snapshots. The compatibility coordinator may compose them from provider-owned projections, but the DTO never grants Workforce authority over those source facts.

The frozen ordering remains explicit: Teacher lists sort active before inactive then by SQLite-compatible name; Working Hours sort by Teacher name, numeric weekday, and start time; profile Groups sort active descending then name; upcoming Lessons sort by date/time and remain capped at 20.

## Semantic and Technical Errors

Expected outcomes use stable codes, while the HTTP adapter preserves the frozen human message and status. The exact catalog contains:

- authorization: `ADMIN_REQUIRED`, `OWN_PROFILE_ONLY`, `PERMISSION_REQUIRED`, `SERVICE_CALLER_FORBIDDEN`;
- not found: `TEACHER_NOT_FOUND`, `PORTAL_ACCESS_NOT_CONFIGURED`, `WORKING_HOUR_NOT_FOUND`;
- conflict: `USERNAME_CONFLICT`, `ARCHIVE_BLOCKED`, `WORKING_HOUR_OVERLAP`;
- validation/lifecycle: the exact profile, password, Branch, Teacher status, weekday, and time codes recorded in the manifest.

Unexpected infrastructure outcomes are restricted to `WORKFORCE_UNAVAILABLE` and `WORKFORCE_FAILURE`; no partial success DTO is returned. HTTP parsing/authentication/tenant/payload-limit failures remain adapter or middleware contracts, not Application semantic errors.

## Authorization and Idempotency

Queries are safe and replayable and accept no idempotency key. Commands accept no idempotency key and promise no automatic retry. WF-PRE-11 subsequently confirms that state-setting semantics do not make transport replay safe and unknown outcomes require reconciliation.

Authorization failure occurs before provider mutation. Every query and mutation is explicitly tenant-scoped; a not-found result does not authorize a cross-tenant lookup.

## Downstream Teacher Reference

`TeacherReferenceApplicationV1.getTeacherReference` is the sole first-extraction downstream contract:

```text
getTeacherReference(
  context: WorkforceServiceContextV1,
  input: TeacherIdV1
): Result<
  TeacherReferenceV1,
  SERVICE_CALLER_FORBIDDEN | TEACHER_NOT_FOUND | WorkforceTechnicalErrorV1
>
```

`TeacherReferenceV1` has exactly five fields:

| Field | Type |
|---|---|
| `tenantId` | string |
| `teacherId` | string |
| `displayName` | string |
| `status` | `active` or `inactive` |
| `branchId` | string or null |

The query returns active and inactive Teachers. Each consumer owns its eligibility decision; the reference does not mean schedulable, payable, authenticated, authorized, or currently assignable.

Contact, credentials, workload, counts, Group/Lesson/Schedule/Attendance data, and finance fields are forbidden. Consumers may store the stable `teacherId` reference according to their own model, but may not import Workforce internals or treat the snapshot as a mutable Teacher entity.

## Governed Target Deltas

Two target differences are approved but not activated:

1. `WF-APP-DELTA-01`: explicit Working Hour `branchId` must resolve to an active same-tenant Branch. Invalid input produces `BRANCH_INVALID`. WF-PRE-13 subsequently approves separate legacy-characterization and target-remediation assertions; they must pass before target routing.
2. `WF-APP-DELTA-02`: Teacher self profile omits Group `monthlyFee`; Admin retains it. WF-PRE-13 subsequently approves separate legacy exposure and target role-sensitive privacy assertions; they must pass before target routing.

Neither decision silently changes the current HTTP/runtime contract. A target route cannot activate until its specific gate and rollback rule pass.

## Explicit Deferrals

This decision does not approve:

- exact focused persistence/provider ports and adapter boundaries — subsequently approved by [WF-PRE-10](workforce-focused-ports.md);
- cross-provider transaction, ordering, compensation, retry, and reconciliation — subsequently approved by [WF-PRE-11](workforce-transaction-consistency.md);
- integration-event and Audit delivery disposition — subsequently approved by [WF-PRE-12](workforce-event-requirements.md) with synchronous mandatory Audit acceptance and zero event versions;
- executable contract/parity/tenant/privacy/remediation test specification — subsequently approved by [WF-PRE-13](workforce-test-parity-plan.md); implementation remains an activation condition;
- migration cohort, rollout, rollback, observation, or retirement — WF-PRE-14.

No generic repository, broad provider facade, SQL/table contract, shared transaction, or invented event is approved.

## Approval

Approved on 2026-07-24 under Single-Founder Governance by Sukhrob Khaydarov as Architecture Owner, Workforce Module Owner, Product Authority, affected provider/consumer context owners, Security Owner, and Quality Owner. Distinct decision roles are preserved even though one named owner currently holds them.

## Gate Result

**WF-PRE-09: PASSED**

The two public surfaces, 10/10 compatibility use cases, exact canonical DTOs, semantic/technical errors, verified authorization contexts, idempotency expectations, privacy projections, and one minimal downstream Teacher reference/status query are approved. WF-PRE-10 through WF-PRE-14 subsequently approved ports, consistency, event/Audit, test/parity, and the [migration/rollback runbook](workforce-migration-runbook.md). Module Readiness remains Failed; the next ordered prerequisite is WF-PRE-16.
