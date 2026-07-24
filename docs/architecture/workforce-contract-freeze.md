# Workforce HTTP Contract Freeze

Decision ID: WF-PRE-05
Status: Approved
Decision date: 2026-07-23
Baseline: `workforce-http-2026-07-23.1`
Implementation source commit: `283ebf935c9912279816d1ac4db43f2da8ace9bc`
Machine-readable evidence: [`architecture/workforce-contract-baseline.json`](../../architecture/workforce-contract-baseline.json)
Baseline SHA-256: `908088d79bec7b5a01a1e1dc055cd901f39a718286cd20cc1fc093f4b93d2712`

## Decision Authority

| Concern | Approval role | Approver | Decision |
|---|---|---|---|
| Supported product compatibility | Product Authority | Sukhrob Khaydarov | Approved |
| Workforce boundary | Workforce Module Owner | Sukhrob Khaydarov | Approved |
| DTO/error/ordering evidence | Quality Owner | Sukhrob Khaydarov | Approved as current baseline |
| Authorization, tenant, privacy, credentials | Security Owner | Sukhrob Khaydarov | Approved with WF-CONTRACT-RISK-01 blocking target parity |
| Contract governance | Architecture Owner | Sukhrob Khaydarov | Approved |

This freeze inventories current observable behavior. It does not approve every observed legacy defect as desirable target behavior.

## Freeze Decision

The ten current Teacher and working-hours operations are frozen as the compatibility baseline for future characterization, Application-contract design, parity comparison, and migration.

The freeze covers:

- method and path;
- request fields, aliases, defaults, clearing behavior, and ignored-body behavior;
- success status and response envelope/fields;
- semantic error status and meaning;
- role, permission, tenant, self-scope, and privacy behavior;
- result ordering, limits, pagination absence, and idempotency absence;
- current OpenAPI coverage and its exact gaps.

No runtime source, route, schema, database, use case, or user-visible response changed in WF-PRE-05.

## Evidence Binding

The baseline binds the reviewed behavior to exact source evidence:

| Evidence | SHA-256 |
|---|---|
| `src/http/api.js` | `917b8e348eb99dd0ac344eec31104a10bab05ac2f3fe9c166cdf78d9152d0f09` |
| `src/services/appService.js` | `09189d9a6592edd188178a59a7e0e782b1d4498a32745a0a0d5f17bad8c65dc2` |
| `src/services/validation.js` | `578be1d68b3c55fe59f6a721b4a15b694bef80c73a3cdbeeca599e89f8e6381e` |
| `src/repositories/appRepository.js` | `0ef641250c847ab88cc08ca80945676ee34f3509e72f5745af83c9aa99bc61cc` |
| `docs/openapi.yaml` | `1d26df4d95bc0cd120afe09096eb6e2a130d891ccff2ed6311393d8b796ae0e7` |

Whole-file hashes prove the reviewed source state. They do not mean every future unrelated edit is breaking; future compatibility review compares the affected dimensions in the machine-readable baseline.

Repeatable verification:

```bash
npm run architecture:workforce-contract
```

The command validates the baseline hash, all five source fingerprints, 10 unique operations, 10/10 OpenAPI method/path coverage, exact DTO field counts, and the registered privacy risk. It is an explicit contract-review command rather than part of the general required CI check because whole-file legacy hashes would otherwise block unrelated approved changes inside the shared legacy files.

## Common HTTP Contract

All ten operations:

- use the HttpOnly `dono_session` cookie;
- require a verified tenant context;
- return JSON with `Content-Type: application/json; charset=utf-8`;
- set `Cache-Control: no-store`;
- use `{ "error": string }` with optional `details` for failures;
- have no pagination;
- accept no idempotency key;
- remain on the unversioned legacy `/api` surface.

Common failure behavior:

| Status | Condition/meaning |
|---:|---|
| `400` | Malformed URL or invalid JSON for a body-consuming operation |
| `401` | Missing/invalid/expired session: `Unauthorized` |
| `403` | Missing tenant context or suspended/blocked tenant; operation-specific authorization can also return `403` |
| `413` | Parsed body exceeds 1,000,000 characters: `Payload too large` |
| `500` | Unexpected application/infrastructure failure |

Archive, restore, and both delete routes parse a JSON body even though the body is ignored. Invalid or oversized bodies therefore fail before the use case.

## Frozen Operation Inventory

| ID | Method/path | Success | Authorization | Request | Response | Ordering/limit |
|---|---|---:|---|---|---|---|
| WF-HTTP-01 | `GET /api/teachers` | `200` | Admin tenant list; Teacher self only | None | `{ teachers: Teacher[] }` | active before inactive, then name |
| WF-HTTP-02 | `GET /api/teachers/{teacherId}` | `200` | Admin tenant Teacher; Teacher self only | Path ID | `TeacherProfile` | groups active/name; hours Teacher/day/time; lessons date/time, max 20 |
| WF-HTTP-03 | `POST /api/teachers` | `201` | Admin | `TeacherWriteRequest` | Admin `Teacher` | N/A |
| WF-HTTP-04 | `PUT /api/teachers/{teacherId}` | `200` | Admin | Path ID + `TeacherWriteRequest` | Admin `Teacher` | N/A |
| WF-HTTP-05 | `DELETE /api/teachers/{teacherId}` | `200` | Admin | Path ID + ignored JSON | Inactive Admin `Teacher` | N/A |
| WF-HTTP-06 | `POST /api/teachers/{teacherId}/restore` | `200` | Admin | Path ID + ignored JSON | Active Admin `Teacher` | N/A |
| WF-HTTP-07 | `POST /api/teachers/{teacherId}/reset-password` | `200` | Admin | Path ID + new password | `{ success: true }` | N/A |
| WF-HTTP-08 | `GET /api/teacher-working-hours` | `200` | Admin tenant list; Teacher self only | None | `{ workingHours: TeacherWorkingHour[] }` | Teacher name, numeric weekday, start time |
| WF-HTTP-09 | `POST /api/teacher-working-hours` | `201` | `lessons.manage` permission | Working-hour request | `TeacherWorkingHour` | N/A |
| WF-HTTP-10 | `DELETE /api/teacher-working-hours/{workingHourId}` | `200` | Admin | Path ID + ignored JSON | Deleted `TeacherWorkingHour` | N/A |

The exact operation records and semantic error arrays are authoritative in the machine-readable baseline.

## Request Contract

### Teacher create/update

Accepted fields:

- `name`;
- `phone`, `email`, `specialization`, `note`;
- `employmentType` or `employment_type`;
- `hiredAt` or `hired_at`;
- `maxWeeklyHours` or `max_weekly_hours`;
- `branchId` or `branch_id`;
- `accessEnabled` or `access_enabled`;
- `username`, `password`.

Frozen semantics:

- `name` is required for both create and `PUT` update;
- employment type is `full_time`, `part_time`, or `contract`;
- hire date is empty or a valid `YYYY-MM-DD`;
- maximum weekly hours is numeric from 1 through 80, persisted as rounded minutes;
- a supplied Branch must exist in the active tenant;
- create with no Branch uses the active tenant's main Branch when present;
- enabled access requires the current username pattern;
- first access and every supplied password require at least 8 characters;
- `accessEnabled`/`access_enabled` uses current JavaScript boolean coercion, so clients must send real JSON booleans rather than strings;
- an inactive Teacher must be restored before access is enabled;
- update omission clears `phone`, `email`, `specialization`, and `note`;
- update omission preserves employment type, hire date, workload ceiling, Branch, access state, and username;
- empty hire date clears it; empty Branch does not clear an existing Branch.

### Password reset

`newPassword` or `new_password` is required after trimming and must contain at least eight characters.

### Working-hour creation

Accepted aliases are `teacherId`/`teacher_id`, `startTime`/`start_time`, `endTime`/`end_time`, and `branchId`/`branch_id`, plus `weekday`.

The Teacher must exist and be active. Weekday is `1` through `7`; clock values use strict `HH:mm`; end is later than start; same-Teacher/same-weekday intervals cannot overlap. Current working-hour `branchId` is accepted but not validated; an empty value defaults to the active tenant's main Branch when present.

Unknown JSON properties are currently ignored. That observation is not approval for clients to depend on unknown fields.

## Response DTO Freeze

### Admin Teacher

The exact 21 fields are:

`id`, `tenantId`, `branchId`, `name`, `phone`, `email`, `specialization`, `employmentType`, `status`, `hiredAt`, `maxWeeklyMinutes`, `weeklyMinutes`, `workloadPercent`, `note`, `createdAt`, `groupsCount`, `studentsCount`, `completedLessons`, `hasAccess`, `username`, `accessStatus`.

### Teacher self projection

The self projection contains the Admin Teacher fields except `username` and `accessStatus`. `hasAccess` remains present.

### Teacher working hour

The exact nine fields are:

`id`, `tenantId`, `branchId`, `teacherId`, `teacherName`, `weekday`, `startTime`, `endTime`, `createdAt`.

The current delete response maps the deleted row without a Teacher join, so `teacherName` is an empty string. This is an observed legacy quirk, not a target-design preference.

### Teacher profile

The top-level fields are `teacher`, `groups`, `workingHours`, and `upcomingLessons`.

- `teacher` is the Admin or self projection according to actor.
- `groups` currently uses the 32-field legacy Group projection.
- `workingHours` uses the nine-field Working Hour projection.
- `upcomingLessons` currently uses the 44-field legacy Lesson projection.

All 32 Group and 44 Lesson field names are enumerated in the machine-readable baseline to prevent accidental projection drift.

## Semantic Error Freeze

Operation-specific meanings include:

- Admin-only failure: `403 Admin role is required`;
- permission failure: `403 Permission is required`;
- Teacher self-scope failure: `403 Only own teacher profile is available`;
- missing Teacher/profile: `404 Teacher not found`;
- missing portal identity: `404 Teacher portal access is not configured`;
- missing interval: `404 Working hour not found`;
- username collision: `409 Username already exists`;
- archive blocker: `409 Teacher has active groups or upcoming lessons; reassign them before archiving`;
- interval conflict: `409 Working hours overlap with an existing interval`;
- validation failures: `422` with the current field-specific messages recorded in the baseline.

The baseline freezes semantic meaning, status, and stable application messages. It does not promise database-driver messages or stack-dependent `500` text.

## Authorization and Privacy Freeze

| Concern | Current contract |
|---|---|
| Tenant isolation | Every operation uses `context.tenantId`; cross-tenant identifiers resolve as not found |
| Teacher directory | Teacher receives only their own row |
| Teacher profile | Teacher receives only the profile whose ID equals `context.userId` |
| Teacher credential fields | `username` and `accessStatus` are omitted from Teacher self responses |
| Admin mutations | Teacher create/update/archive/restore/reset and working-hour delete require Admin |
| Working-hour creation | Requires `lessons.manage`; the system Teacher role does not have it |
| Working-hour list | Teacher is restricted to own intervals |

### Observed privacy mismatch

`GET /api/teachers/{teacherId}` removes Teacher credential fields for a Teacher actor but returns raw composed Group rows. Those rows include `monthlyFee`, while the OpenAPI Group schema marks `monthlyFee` Admin-only.

This is recorded as `WF-CONTRACT-RISK-01`:

- it is not approved as a target compatibility guarantee;
- the target migration may not silently preserve or expand it;
- Product and Security must decide remediation and compatibility treatment before target parity is accepted;
- current runtime behavior is unchanged by this documentation task.

## OpenAPI Inventory

OpenAPI operation coverage is **10/10**, but exact contract coverage is **partial**.

Gaps:

- Teacher schema omits `note` and `createdAt`;
- Admin and Teacher-safe Teacher variants are not separate;
- Working Hour, Teacher Profile, mutation request, list-envelope, and success schemas are absent;
- composed Group/Lesson projections are not exact;
- request bodies are absent for all mutations;
- most `400/401/403/404/409/413/422/500` responses are absent;
- aliases, update clear/default semantics, ordering, limits, no-pagination, ignored-body behavior, and idempotency absence are undocumented.

Until an approved OpenAPI reconciliation, the machine-readable WF-PRE-05 baseline is authoritative for exact current behavior. The gaps do not authorize route or runtime changes.

## Change Control

A change is compatibility-relevant when it modifies:

- method/path or supported client;
- accepted/required request field or alias;
- response envelope, field, type, omission, or ordering;
- success status or semantic error;
- authorization, tenant, privacy, credential, pagination, or idempotency behavior.

It requires:

1. Product Authority and Workforce Module Owner approval;
2. affected consumer and Quality approval;
3. Security approval for auth/tenant/privacy/credential changes;
4. Architecture Owner approval;
5. updated baseline and OpenAPI;
6. contract comparison/tests and rollback treatment.

Security defects are corrected through explicit governed remediation, not permanently frozen as product guarantees.

## Approval Result

**WF-PRE-05: PASSED**

All ten current operations, accepted request fields, exact response DTO fields, status/error behavior, authorization/privacy rules, ordering/limits, and OpenAPI coverage/gaps are inventoried and approved as the current compatibility baseline.

This closes only current-contract freeze. It does not pass target parity, activate the privacy remediation, or authorize extraction. WF-PRE-06 through WF-PRE-14 subsequently approved all ordered design/planning decisions through the [migration/rollback runbook](workforce-migration-runbook.md); the next ordered prerequisite is WF-PRE-16.
