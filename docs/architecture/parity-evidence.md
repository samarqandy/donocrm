# SQLite/PostgreSQL Repository Parity Evidence

Status: **HISTORICAL PRE-REMEDIATION EVIDENCE**
Evidence date: **2026-07-23 (Asia/Tashkent)**
Scope: Attendance repositories only; no runtime, business logic, API, schema, Attendance, or Workforce change was performed.

> Subsequent remediation and isolated verification supersede the current-state
> conclusions below for covered methods. See
> [`remediation-verification-2026-07-23.md`](remediation-verification-2026-07-23.md).
> This file is retained as the before-state and root-cause register.

## Executive finding

The current SQLite and PostgreSQL datasets are equal for the columns covered by the migration checksum verifier, and the normalized Attendance query suite passes. The repository contracts are not semantically equivalent.

- Paired repository interfaces audited: **2**
- Repository methods audited: **20/20**
- Methods assessed Equivalent: **3**
- Methods assessed Different: **17**
- Methods assessed Unknown: **0**
- Identical cross-adapter write-contract executions: **0/5 write methods**
- Live contract runner: **DIFF** (`PASS=12`, `FAIL=0`, `DIFF=6`; the pass count includes two surface checks)
- Live data verifier: **PASS** for the current snapshot
- Normalized query parity: **PASS** across 43 attendance rows, 17 students, 12 groups, and 10 teachers

`SQLiteAttendanceNotificationRepository` and `SQLiteStudentRepository` have no PostgreSQL counterparts and therefore are not paired parity contracts. Their absence is not counted as a method failure here, but it prevents claiming platform-wide repository parity beyond Attendance.

## Evidence method

The verification used the existing executable architecture tools and read-only adapter calls against the local PostgreSQL canary database. SQLite was read through an atomic `node:sqlite` backup, not a raw file copy, because the live database uses WAL and a raw copy can omit committed WAL state.

Evidence commands/results:

| Check | Result | Evidence |
|---|---:|---|
| Repository surface | PASS | Both adapters implement all 13 command and 7 query methods |
| Live repository contract runner | DIFF | `PASS=12`, `FAIL=0`, `DIFF=6`; evidence hash `1c4db41bd6ad9a7798663267c19f372e433b2f3303f08dbd7e1212fbde06074c` |
| Normalized query parity | PASS | 43 records; all 17 students, 12 groups, and 10 teachers exercised |
| Migration data checksum | PASS | 9/9 tables matched count and checksum |
| History checksum | PASS | 34/34 lesson events and 31/31 revisions matched |
| Referential integrity | PASS | 7/7 orphan checks returned zero |
| Relay health at verification time | PASS | Both directions had zero pending and zero failed events |
| Architecture tests | PASS | Attendance 12/12; Student strangler 4/4 |
| Architecture scanner | OBSERVE | 72 candidate-baseline findings; it is not an enforcing gate |

The data checksum covers `tenants`, `teachers`, `groups`, `students`, `student_group_enrollments`, `lessons`, `attendance_reasons`, `finance_periods`, and `attendance`. A checksum pass proves equality only for the verifier's selected canonical columns; it does not prove repository return-shape, error, ordering, transaction, or side-effect parity.

## Severity model

| Severity | Meaning |
|---|---|
| Critical | Can permit an invalid financial/state transition, route authorization incorrectly, or change the effective business date |
| High | Can change roster membership, API-visible identity/content, rollback replication, or user-visible behavior |
| Medium | Contract shape, selection, timestamp, or history behavior differs without a demonstrated immediate integrity loss |
| Low | Operational metadata differs and is unlikely to alter the primary Attendance outcome |

## Semantic difference register

| ID | Severity | Methods | Verified difference and impact |
|---|---|---|---|
| PAR-001 | **Critical** | `findLesson`, `findAlertSource` | PostgreSQL converts a local `DATE` through `toISOString()`. Under Asia/Tashkent, the tested `2026-07-09` became `2026-07-08`. Exact comparison differed for **29/29** lessons. This can alter future-date validation and the alert's “today” wording. |
| PAR-002 | **High** | `findLesson`, `findAlertSource` | SQLite resolves teacher through lesson, schedule, then group; PostgreSQL omits the schedule fallback and `findLesson` reads only the lesson teacher. This is latent in the current fixture because all 29 lessons have a direct teacher, but it can deny the assigned teacher or attribute an alert incorrectly. |
| PAR-003 | **Medium** | `findLesson` | SQLite returns lesson `version`; PostgreSQL omits it. The HTTP result is therefore not shape-compatible. |
| PAR-004 | **High** | `findLessonRoster` | SQLite keeps a student when an attendance row exists even if the dated enrollment no longer matches. PostgreSQL requires a matching enrollment inner join. Historical correction rosters can therefore lose previously recorded students. |
| PAR-005 | **High** | `findLessonRoster` | SQLite derives guardian contact, ledger balance, attendance totals/rate, and extended student fields. PostgreSQL returns a smaller projection and uses stored student balance/chat data. Exact comparison differed for **29/29** lesson rosters. |
| PAR-006 | **Medium** | `findByLesson` | SQLite returns `tenantId`, `lessonId`, `studentName`, `createdAt`, and normalized empty reason fields. PostgreSQL omits those fields and can return null reason values. Exact comparison differed for 22/29 lessons; the seven equal cases were empty arrays. |
| PAR-007 | **Medium** | `listReasons`, `findReason` | Five of seven current reasons have unequal `updatedAt` values between stores. Exact `findReason` equality was 2/7, and both active/all list variants differed. The checksum verifier deliberately excludes timestamps, so it does not detect this. |
| PAR-008 | **High** | `createReason`, `updateReason` | SQLite creates a forward outbox event only when mirroring is enabled; PostgreSQL always creates a reverse outbox event. Duplicate-code error messages also differ. The asymmetry is expected by store authority, but no identical executable write contract currently proves result, error, transaction, and relay side-effect parity. |
| PAR-009 | **High** | `findClosedFinancePeriod` | SQLite deterministically prefers a branch-specific period, then the latest start date, and returns `{id,label,branchId}`. PostgreSQL has no ordering and returns the raw snake_case row. The current tenant has no closed-period fixture, so the differing positive path is source-proven but not dynamically exercised. |
| PAR-010 | **Critical** | `hasActiveSettlement` | SQLite queries confirmed `lesson_financial_settlements`; PostgreSQL always returns `false`. The current fixture has no confirmed settlement, so its 29 negative cases agree while the safety-positive case is guaranteed to differ. |
| PAR-011 | **Critical** | `replaceForLesson` | SQLite rechecks confirmed settlement and closed finance period inside its transaction. PostgreSQL checks only `financial_status='posted'`; it does not query settlements or recheck a closed period. A correction can therefore pass in PostgreSQL when SQLite rejects it, including a close-period race after the application precheck. |
| PAR-012 | **High** | `replaceForLesson` | SQLite canonicalizes/sorts snapshots, defaults actor fields, clears all financial reversal metadata, and conditionally emits forward outbox. PostgreSQL persists command order/raw snapshots, does not clear the reversal fields, and always emits reverse outbox. Revision/event history and returned lesson shape differ. |
| PAR-013 | **Critical** | `reopenLesson` | SQLite repeats settlement and closed-period guards inside the transaction; PostgreSQL checks only `financial_status='posted'`. This is the same financial-integrity gap as correction. |
| PAR-014 | **High** | `reopenLesson` | Event snapshot shape, actor defaults, outbox policy, and returned lesson shape differ. No identical write-contract execution covers the method. |
| PAR-015 | **High** | `list`, `listForTeacher`, `studentProfile`, `groupProfile` | Relays regenerate attendance row IDs. In the verified dataset, **30/43** logical lesson/student rows have different IDs. The normalized query test removes `id`, so its PASS does not prove raw contract parity. |
| PAR-016 | **High** | `list`, `listForTeacher`, `studentProfile`, `groupProfile` | SQLite supplies a reason fallback from status and leaves some nullable values raw; PostgreSQL relies on persisted reason snapshots and normalizes null note/time values to empty strings. Ordering by a non-unique timestamp is also not deterministic across stores. |
| PAR-017 | **Low** | `audit` | SQLite uses application time and a local generated ID; PostgreSQL uses database `NOW()` and a database transaction boundary independent of the preceding use-case write. No identical audit side-effect test exists. |

## Complete method parity matrix

### AttendanceRepository

| Method | SQLite behavior | PostgreSQL behavior | Result | Severity | Evidence |
|---|---|---|---|---|---|
| `findLesson` | Teacher fallback via schedule/group; raw date; includes `version` | Direct lesson teacher; UTC conversion of local date; omits `version` | **Different** | Critical | 0/29 exact matches |
| `findLessonRoster` | Existing-attendance-or-enrollment roster; guardian, ledger, stats, extended fields | Enrollment-required roster; smaller stored-value projection | **Different** | High | 0/29 exact matches |
| `findByLesson` | Rich mapped record with normalized empty values | Reduced record projection with nullable reason fields | **Different** | Medium | 7/29 exact matches; all seven were empty |
| `listReasons` | Ordered mapped reasons; SQLite timestamps | Same logical ordering; PostgreSQL timestamp state differs | **Different** | Medium | Both active/all variants differ |
| `findReason` | Mapped reason | Same mapper intent, but current timestamps differ | **Different** | Medium | 2/7 exact matches |
| `createReason` | Transaction; conditional SQLite→PG outbox; SQLite constraint error | Transaction; mandatory PG→SQLite outbox; mapped unique error | **Different** | High | Static side-effect audit; dynamic parity untested |
| `updateReason` | Optimistic update; conditional forward outbox | Row lock plus optimistic update; mandatory reverse outbox | **Different** | High | Static side-effect audit; dynamic parity untested |
| `findClosedFinancePeriod` | Deterministic branch/latest selection; compact camelCase result | Unordered first match; raw row | **Different** | High | Static audit; no positive fixture |
| `hasActiveSettlement` | Reads confirmed settlement state | Constant `false` | **Different** | Critical | Static DIFF; only negative live fixtures |
| `replaceForLesson` | Full finance guards; canonical history; conditional forward relay | Missing settlement/transactional closed-period guard; raw history; mandatory reverse relay | **Different** | Critical | Static audit; identical write contract untested |
| `reopenLesson` | Full finance guards; canonical/defaulted history; conditional forward relay | Missing settlement/transactional closed-period guard; different history; mandatory reverse relay | **Different** | Critical | Static audit; identical write contract untested |
| `findAlertSource` | Schedule teacher/time fallback; raw date | No schedule fallback; date shifts under current timezone | **Different** | High | 0/29 exact matches |
| `audit` | SQLite insert with application timestamp | PostgreSQL insert with database timestamp | **Different** | Low | Static audit; identical side-effect test untested |

### AttendanceQueryRepository

| Method | SQLite behavior | PostgreSQL behavior | Result | Severity | Evidence |
|---|---|---|---|---|---|
| `counts` | Counts by status | Equivalent counts by status | **Equivalent** | — | Live exact and normalized PASS |
| `list` | Raw SQLite IDs; reason fallback; timestamp-only ordering | Relay-generated IDs; persisted reason only; timestamp-only ordering | **Different** | High | Raw DIFF; normalized set PASS |
| `listForTeacher` | Same aggregate predicate, SQLite record semantics | Same aggregate predicate, PostgreSQL record semantics | **Different** | High | 1/10 teacher cases differed; only one had records |
| `studentStats` | Count and present/late aggregate | Equivalent aggregate using PostgreSQL filters | **Equivalent** | — | Deep semantic PASS for all 17 students; JSON key order alone differed |
| `groupStats` | Count and present/late aggregate | Equivalent aggregate using PostgreSQL filters | **Equivalent** | — | Deep semantic PASS for all 12 groups; JSON key order alone differed |
| `studentProfile` | Equivalent summary plus SQLite record semantics | Equivalent summary plus PostgreSQL record semantics | **Different** | High | 2/17 profiles differed; these contained records |
| `groupProfile` | Equivalent summary/member stats plus SQLite records | Equivalent summary/member stats plus PostgreSQL records | **Different** | High | 2/12 profiles differed; these contained records |

## Coverage and untested behavior

### Tested

- All 20 methods were inspected at source and checked for interface presence.
- All 15 read methods were invoked against both live-store snapshots by the generic runner.
- Command reads were broadened across all 29 lessons and all 7 reasons.
- All 7 query methods ran against all current students, groups, and teachers using the migration query-parity normalizer.
- Current-state parity covered 9 tables, 2 history collections, 7 orphan checks, and both relay directions.
- Existing module tests exercised 12 Attendance use-case scenarios, but with faked repositories rather than both database adapters.

### Untested or inadequately tested

- Identical `createReason`, `updateReason`, `replaceForLesson`, `reopenLesson`, and `audit` suites against isolated SQLite and PostgreSQL fixtures.
- A positive confirmed-settlement case.
- A positive closed-finance-period case, including overlapping global and branch periods.
- A lesson whose teacher is inherited from schedule/group rather than stored directly.
- Historical roster correction after enrollment end/removal.
- Duplicate reason codes, stale versions, transaction rollback, and database-error normalization on both stores.
- Raw query compatibility with attendance IDs preserved; the current parity test explicitly removes IDs.
- Time-zone matrix for PostgreSQL `DATE` values.
- Concurrent correction/reopen races and relay retry ordering.

## Risk and confidence

| Claim | Confidence | Basis |
|---|---:|---|
| Current canonical data values match | High | Full current snapshot count/checksum parity and zero orphans |
| Current normalized read projections match | Medium-high | Full query fixture pass, but IDs are removed and fallback edge cases are absent |
| Raw repository contracts match | High confidence that they **do not** | Live DIFF plus full source audit |
| Write contracts match | Low | No identical cross-adapter write suite; source proves material guard/history differences |
| Financial correction/reopen safety matches | High confidence that it **does not** | Constant-false settlement check and missing transactional guards |
| Overall repository parity is migration-ready | Low | Critical and High differences remain |

## Parity conclusion

Current-state data equality is real but narrower than contract parity. The platform must not use the checksum PASS or normalized query PASS as proof that Attendance is safe to complete. Critical financial and date semantics, raw identity compatibility, and write-contract evidence remain unresolved.
