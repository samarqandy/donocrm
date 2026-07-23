# Attendance Repository Contract Matrix

Status: **NORMATIVE PARITY TARGET**
Prepared: **2026-07-23 (Asia/Tashkent)**

This matrix defines the target repository behavior used to eliminate SQLite/PostgreSQL differences. It does not authorize implementation, data repair, routing, or migration.

## Contract authority

The canonical contract preserves current SQLite observable behavior unless this document narrows an implementation detail that was previously unspecified. Public HTTP APIs remain unchanged.

Storage-specific SQL, locks, ID algorithms, and outbox direction are private implementation details. They are acceptable only when the canonical returned value, error, state transition, concurrency result, history, and logical event are equivalent.

## Canonical value rules

| Type | Canonical rule |
|---|---|
| Calendar date | String `YYYY-MM-DD`; never converted through UTC |
| Timestamp | UTC ISO-8601 string; source/command timestamp preserved for mirrored state |
| Time | `HH:MM` string unless the existing field contract includes seconds |
| Numeric | JavaScript number; no numeric strings |
| Boolean | JavaScript boolean |
| Optional text | Empty string when the existing SQLite mapper uses empty string; never adapter-dependent null/undefined |
| Missing entity | `null`, not undefined or empty object |
| Collections | Array; deterministic order defined per method |
| Maps | Object-key order is insignificant; key set and values are exact |
| Identity | Primary-generated logical row ID is preserved across backfill and both relay directions |
| Tenant isolation | Every lookup/write is scoped by tenant and entity identity |
| Error | Same error class, HTTP status, stable code, and public message for the same condition |

## Canonical DTOs

### Lesson

Required keys:

`id`, `tenantId`, `branchId`, `groupId`, `teacherId`, `date`, `status`, `attendanceVersion`, `financialStatus`, `topic`, `homework`, `note`, `version`.

- `teacherId`: lesson → schedule → group precedence.
- `date`: local calendar string.
- SQLite `waiting` remains exposed as `planned`.
- versions are numbers.

### Attendance record

Required keys:

`id`, `tenantId`, `lessonId`, `studentId`, `studentName`, `status`, `reasonId`, `reasonCode`, `reasonName`, `chargePercent`, `consumePercent`, `note`, `createdAt`.

Records are ordered by `studentId` in `findByLesson`. Reason/note text follows canonical empty-string defaults.

### Reason

Required keys:

`id`, `tenantId`, `code`, `name`, `attendanceStatus`, `chargePercent`, `consumePercent`, `isActive`, `isSystem`, `version`, `createdAt`, `updatedAt`.

### Roster student

Required keys:

`id`, `tenantId`, `name`, `groupId`, `groupName`, `parentName`, `parentRelationship`, `parentEmail`, `phone`, `studentPhone`, `email`, `birthDate`, `gender`, `address`, `source`, `enrollmentDate`, `note`, `archivedAt`, `archiveReason`, `createdAt`, `updatedAt`, `telegramChatId`, `debt`, `balance`, `status`, `attendanceTotal`, `attendancePresent`, `attendanceRate`, `attendanceStatus`, `attendanceReasonId`, `attendanceReasonCode`, `attendanceReasonName`, `attendanceNote`.

Membership is the union of dated enrollment and existing lesson attendance. Ordering is student name with student ID as deterministic tie-breaker.

### Query record

Required keys:

`id`, `tenantId`, `lessonId`, `studentId`, `studentName`, `parentName`, `groupId`, `groupName`, `subject`, `teacherId`, `status`, `reasonId`, `reasonCode`, `reasonName`, `chargePercent`, `consumePercent`, `note`, `createdAt`, `lessonTime`, `lessonDate`.

Absent snapshot reason values fall back from status to the tenant's canonical system reason.

### Closed finance period

Either null or exactly `{id, label, branchId}`. A branch-specific period wins over a global period; within the same scope, latest `startDate` wins.

### Alert source

Either null or `{lesson, records}`.

- Lesson keys: `id`, `date`, `status`, `attendanceVersion`, `groupName`, `subject`, `teacherId`, `teacherName`, `startTime`.
- Records keys: `studentId`, `studentName`, `status`.
- Only absent/late records, ordered by student name then student ID.

## Method matrix

### AttendanceRepository

| ID | Method | Current | Severity | Root causes | Canonical contract | Mandatory contract cases | Target components |
|---|---|---|---|---|---|---|---|
| ARC-001 | `findLesson` | Different | Critical | RC-DT, RC-SQL, RC-MI, RC-LA | Lesson DTO exactly as above; local date; effective teacher; null if absent | date timezone matrix; teacher precedence; status/defaults; version; tenant isolation | PG/SQLite repository mappers; reference reader |
| ARC-002 | `findLessonRoster` | Different | High | RC-SQL, RC-MI, RC-LA | Full roster DTO; enrollment-or-history membership; authoritative guardian/ledger fields; deterministic order | active/ended/history; guardian/chat; ledger; rates; PG read-after-write | both repositories; roster projection |
| ARC-003 | `findByLesson` | Different | Medium | RC-MI, RC-SQL, RC-PR | Full Attendance record DTO, ordered by student ID | populated/empty; nulls; tenant collision | both repositories; shared mapper |
| ARC-004 | `listReasons` | Different | Medium | RC-DT, RC-EV | Exact Reason DTOs; system/status/name order; `activeOnly` exact | active/all; ties; timestamps; replay | reason mapper; trigger; relay; verifier |
| ARC-005 | `findReason` | Different | Medium | RC-DT, RC-EV | Exact Reason DTO or null | existing/missing/wrong tenant; timestamp after write/replay | reason mapper; trigger; relay |
| ARC-006 | `createReason` | Different | High | RC-EV, RC-ER, RC-DT | Atomic insert plus one logical created event when sync enabled; exact DTO/error | success; duplicate; tenant isolation; sync on/off; event failure rollback | both repositories; event/error helpers |
| ARC-007 | `updateReason` | Different | High | RC-EV, RC-ER, RC-DT, RC-LK | Atomic optimistic update plus logical updated event; exact timestamp/version/error | success; missing; stale/concurrent; event rollback; replay | both repositories; trigger; event/error helpers |
| ARC-008 | `findClosedFinancePeriod` | Different | High | RC-SQL, RC-LA, RC-MI | Authoritative deterministic finance period DTO or null | global/branch/overlap/boundary/unavailable | finance guard; both repositories |
| ARC-009 | `hasActiveSettlement` | Different | Critical | RC-MI, RC-BR, RC-LA | Authoritative confirmed-settlement boolean; fail closed on unavailable guard | confirmed/nonconfirmed/missing/cross-tenant/unavailable | finance guard; PG repository |
| ARC-010 | `replaceForLesson` | Different | Critical | RC-BR, RC-TX, RC-LK, RC-EV, RC-ID, RC-LA, RC-MI | Canonical guarded atomic replacement, revision/event/outbox, financial resets, full Lesson return | initial/correction; version; finance; races; failures; history; ID/relay | repositories; finance fence; relays; shared builders |
| ARC-011 | `reopenLesson` | Different | Critical | RC-BR, RC-TX, RC-LK, RC-EV, RC-LA, RC-MI | Canonical guarded atomic reopen, delete/history/outbox, full Lesson return | status/version; finance; races; failures; retry/read-after-write | repositories; finance fence; relays; shared builders |
| ARC-012 | `findAlertSource` | Different | High | RC-DT, RC-SQL, RC-LA | Exact Alert source; local date; teacher/time fallback; deterministic filtered records | today/other day; fallbacks; filters/order; empty/missing | repositories; date mapper; reference reader |
| ARC-013 | `audit` | Different | Low | RC-DT, RC-TX | One semantic audit row from shared clock; no return value; same failure propagation | frozen time; default/custom entity; isolation; DB failure | repositories; clock dependency |

### AttendanceQueryRepository

| ID | Method | Current | Severity | Root causes | Canonical contract | Mandatory contract cases | Target components |
|---|---|---|---|---|---|---|---|
| AQC-001 | `counts` | Equivalent | — | — | `{present,absent,late,excused}` numeric counts with zero defaults | empty/mixed/tenant isolation | regression-only |
| AQC-002 | `list` | Different | High | RC-ID, RC-SQL, RC-PR, RC-EV | Exact Query record DTOs; preserved IDs/fallbacks/defaults; created-desc deterministic order | forward/reverse/backfill IDs; fallbacks; nulls; ties | query repositories; writes; relays; backfill |
| AQC-003 | `listForTeacher` | Different | High | RC-ID, RC-SQL, RC-PR | AQC-002 contract filtered by tenant/effective teacher | multiple teachers; empty; fallback teacher; exact records | query repositories; shared projection |
| AQC-004 | `studentStats` | Equivalent | — | — | Map of requested/all represented students with exact totals, present count, rounded rate | empty/filter/dedup/mixed | regression-only |
| AQC-005 | `groupStats` | Equivalent | — | — | Map of represented groups with exact totals, present count, rounded rate | empty/filter/dedup/mixed | regression-only |
| AQC-006 | `studentProfile` | Different | High | RC-ID, RC-SQL, RC-PR | Exact summary plus maximum 100 canonical Query records in deterministic lesson/time/created order | empty/mixed/rate/limit/ties/IDs | query repositories; shared projection |
| AQC-007 | `groupProfile` | Different | High | RC-ID, RC-SQL, RC-PR | Exact summary, canonical records, and memberStats map | empty/mixed/members/rate/limit/ties/IDs | query repositories; shared projection |

## Write invariants

| Invariant | Canonical requirement |
|---|---|
| Tenant | Command tenant scopes every read/write/event |
| Optimistic concurrency | Stale expected attendance/reason version returns the same 409 error; no partial state |
| Finance | Posted lesson, confirmed settlement, or closed finance period rejects correction/reopen before mutation |
| Atomicity | Primary state, revision/history, and logical outbox event commit or roll back together |
| Lock outcome | Concurrent valid writes serialize; at most one wins a given expected version |
| Attendance identity | ID is generated once by the primary and reused by replicas |
| Revision | One canonical revision for each successful replacement version; none for reopen |
| Lesson event | Exactly one canonical event for successful replace/reopen; none on rollback |
| Outbox | Exactly one logical event when counterpart synchronization is enabled; direction reflects primary store |
| Retry | Inbox idempotency prevents duplicate state/history; stale source version never overwrites newer state |
| Return | Full canonical DTO from committed state, not a command approximation |

## Canonical errors

| Condition | Status | Canonical public behavior |
|---|---:|---|
| Lesson missing | 404 | `Lesson not found` |
| Reason missing | 404 | `Attendance reason not found` |
| Attendance stale | 409 | `Attendance changed concurrently; reload the lesson and try again` |
| Reason stale | 409 | `Attendance reason changed concurrently; reload and try again` |
| Duplicate reason code | 409 | Exact approved SQLite golden-response message; PostgreSQL must not expose a different message |
| Lesson not completed for reopen | 409 | `Only a completed lesson can be reopened` |
| Posted/settled lesson | 409 | Existing operation-specific settlement reversal message |
| Closed finance period | 409 | `Finance period is closed: <label>` |
| Authoritative finance guard unavailable | 500 | Existing generic `Internal server error`; fail closed with no state mutation |

Before implementation, the contract suite must capture the exact SQLite error class/status/code/message and the corresponding HTTP status/body as a golden fixture. Internal stable codes may be normalized without changing the HTTP body, but no new public field, status, or message is authorized.

## Equality rules for contract tests

Tests must compare:

- exact declared key set and values;
- arrays in canonical order;
- stable IDs after relay/backfill;
- state before/after failures;
- revisions and lesson events after canonical JSON key sorting only;
- logical outbox event after normalizing only `source_store` and `target_store` direction;
- error class/status/code/message;
- timestamp equality when a frozen clock/source event is supplied;
- numeric values by exact business precision.

Tests must not obtain PASS by deleting IDs, timestamps, reason fields, or other public contract keys. SQL row order and JavaScript object-key insertion order may be normalized only where the contract declares them insignificant.

## Schema decision record

No general schema change is required for the proposed parity design:

- schedule, guardian, ledger, and finance data stay in their current authoritative contexts and are accessed through narrow internal ports;
- Attendance IDs already exist in both schemas and can be propagated in events;
- deterministic ordering and DTO parity are adapter changes.

One narrow schema behavior change is likely strictly required: PostgreSQL's generic `BEFORE UPDATE` trigger currently overwrites explicitly supplied source `updated_at`. The implementation proposal must preserve explicit canonical timestamps for Attendance-mirrored rows while retaining automatic touch behavior when no timestamp is supplied. This requires Architecture Owner approval before implementation.

## Certification rule

The repository parity gate may report `Equivalent` only when all 20 methods pass the matrix in isolated SQLite/PostgreSQL suites and a current shadow snapshot. A source review, normalized data checksum, empty fixture, or ID-stripped comparison is supporting evidence, not certification.
