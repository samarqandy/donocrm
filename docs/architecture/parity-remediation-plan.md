# Repository Parity Remediation Plan

Status: **PARTIALLY EXECUTED; VERIFIED SCOPE RECORDED SEPARATELY**
Prepared: **2026-07-23 (Asia/Tashkent)**
Scope: the 17 Attendance repository methods classified `Different` in `parity-evidence.md`.

Verified implementation evidence and remaining gaps are recorded in
[`remediation-verification-2026-07-23.md`](remediation-verification-2026-07-23.md).
This plan remains the normative remediation specification.

No code, API, schema, routing, business logic, Attendance migration, or Workforce migration is changed by this plan.

## Remediation objective

Make the SQLite and PostgreSQL adapters interchangeable at the repository boundary while preserving existing public API behavior. The current SQLite observable behavior is the compatibility baseline because migration is not authorized and legacy behavior must remain stable.

Parity means:

- identical domain result shape, values, null/default handling, ordering, and error contract;
- identical business acceptance/rejection decisions;
- equivalent concurrency outcomes and transaction atomicity;
- stable logical identities across primary and replica stores;
- equivalent logical outbox/history side effects after normalizing physical source/target store direction.

Parity does not require identical SQL syntax, UUID algorithm, database lock primitive, or outbox direction. Those are allowed implementation differences only when they cannot be observed through the repository contract and cannot change rollback correctness.

## Root-cause taxonomy

| Code | Root cause | Meaning in this plan |
|---|---|---|
| RC-BR | Business rule mismatch | One adapter accepts/rejects a state transition differently |
| RC-SQL | SQL semantics | Join, filter, ordering, fallback, null, or projection semantics differ |
| RC-DT | Date/time | Calendar date or timestamp conversion/ownership differs |
| RC-TX | Transaction scope | A guard or side effect is outside the atomic write boundary |
| RC-LK | Locking | Concurrent requests can produce different outcomes |
| RC-ID | ID generation | The same logical row receives different externally visible identity |
| RC-PR | Precision/type | Numeric, boolean, date, or null normalization differs |
| RC-MI | Missing implementation | PostgreSQL has a constant/stub or omits a contract field/path |
| RC-LA | Legacy assumption | SQLite relies on data owned by legacy/cross-context tables absent from PostgreSQL |
| RC-EV | Event/history policy | Outbox direction, payload, defaults, or snapshots differ |
| RC-ER | Error mapping | Status, code, message, or conflict classification differs |

## Severity inventory

### Critical

- `findLesson`
- `hasActiveSettlement`
- `replaceForLesson`
- `reopenLesson`

### High

- `findLessonRoster`
- `createReason`
- `updateReason`
- `findClosedFinancePeriod`
- `findAlertSource`
- `list`
- `listForTeacher`
- `studentProfile`
- `groupProfile`

### Medium

- `findByLesson`
- `listReasons`
- `findReason`

### Low

- `audit`

## Canonical implementation constraints

1. Public HTTP routes, request bodies, response fields, and status codes must not change.
2. Repository method signatures remain unchanged.
3. No Workforce or Attendance module migration is part of remediation.
4. Cross-context data remains under its current owner. PostgreSQL Attendance must consume narrow authoritative read/guard ports rather than silently copying a new context.
5. If strict finance fencing cannot be implemented while Finance remains SQLite-owned, PostgreSQL Attendance writes must fail closed and must not be eligible for tenant routing.
6. Any schema change requires a separate Architecture Owner approval and must be limited to a parity need that cannot be solved in adapter code. The only currently identified candidate is PostgreSQL timestamp-trigger behavior.
7. Every remediation is first proven by one identical contract case executed against isolated SQLite and PostgreSQL fixtures.
8. Existing divergent canary data is repaired only through a separately approved, reversible data-correction step after adapter behavior passes; this plan does not authorize that step.

## Method remediation specifications

### Critical — `findLesson`

- Current SQLite behavior: joins group and schedule; resolves teacher as lesson → schedule → group; returns the local calendar date unchanged; maps `waiting` to `planned`; includes `version`.
- Current PostgreSQL behavior: reads only `lessons`; uses direct `teacher_id`; converts a local date through UTC and returns the prior calendar day in Asia/Tashkent; omits `version`.
- Root causes: RC-DT, RC-SQL, RC-MI, RC-LA.
- Expected canonical behavior: exact SQLite lesson DTO, including `YYYY-MM-DD` calendar date, effective teacher precedence, and numeric `version`.
- Recommended implementation: create one internal lesson mapper shared by both adapters; make PostgreSQL return the date as a database calendar string (`YYYY-MM-DD`) without UTC conversion; add `version`; obtain schedule/group teacher resolution through a narrow authoritative `LessonReferenceReader`. Do not add a PostgreSQL schedules schema as part of parity remediation.
- Required tests: all four statuses; Asia/Tashkent midnight boundary; direct/schedule/group teacher precedence; missing lesson; null text defaults; version type.
- Risk: Critical authorization and business-date behavior.
- Estimated migration impact: **Blocker**. PostgreSQL cannot be an Attendance primary until fixed.
- Primary implementation locations: `PostgresAttendanceRepository.js:5-20,48-54`; canonical reference in `SQLiteAttendanceRepository.js:5-21,134-146`; bootstrap dependency wiring in `stranglerContainer.js`.

### Critical — `hasActiveSettlement`

- Current SQLite behavior: returns whether a confirmed `lesson_financial_settlements` row exists for tenant and lesson.
- Current PostgreSQL behavior: unconditional `false`.
- Root causes: RC-MI, RC-BR, RC-LA.
- Expected canonical behavior: read the authoritative Finance-owned settlement state and return `true` for a confirmed settlement, regardless of Attendance store.
- Recommended implementation: introduce an internal read-only `AttendanceFinanceGuard` backed by the authoritative SQLite finance store and inject it into both adapters. PostgreSQL must never infer “no settlement” from an absent PostgreSQL table. It must fail closed when the guard is unavailable.
- Required tests: confirmed, reversed/cancelled, missing, wrong tenant, wrong lesson, finance-store unavailable with the existing generic 500 API behavior.
- Risk: Critical financial integrity.
- Estimated migration impact: **Blocker**.
- Primary implementation locations: `PostgresAttendanceRepository.js:231-234`; reference behavior `SQLiteAttendanceRepository.js:329-334`; composition in `stranglerContainer.js`.

### Critical — `replaceForLesson`

- Current SQLite behavior: obtains an immediate write lock; checks optimistic version, posted/confirmed settlement, and closed period inside the transaction; canonicalizes and sorts attendance; writes revision/event; clears reversal metadata; conditionally emits a forward outbox event; returns the full canonical lesson.
- Current PostgreSQL behavior: row-locks the lesson and checks version/posted state, but does not check confirmed settlement or closed period inside the transaction; preserves raw command ordering/snapshot shape; leaves reversal metadata; always emits reverse outbox; returns a lesson missing canonical date/version semantics.
- Root causes: RC-BR, RC-TX, RC-LK, RC-EV, RC-ID, RC-LA, RC-MI.
- Expected canonical behavior: the SQLite acceptance rules, lesson mutation, normalized records, revision/event content, actor defaults, financial field resets, conflict outcome, and returned lesson DTO. The logical attendance event must be atomic with the primary-store mutation.
- Recommended implementation:
  1. Extract shared pure builders for canonical attendance rows, lesson snapshot, event snapshot, actor defaults, and logical outbox payload.
  2. Keep PostgreSQL `FOR UPDATE`, but execute the authoritative finance guard under a documented fence while the PG transaction is open. An interim no-schema solution may hold a short SQLite `BEGIN IMMEDIATE` guard transaction until PG commit. If that fence cannot be proven deadlock-safe, fail closed.
  3. Recheck closed period and settlement after locks are acquired.
  4. Add the missing `financial_reversed_at/by/reason = NULL` mutation.
  5. Generate each attendance row ID once in the primary repository and include it in the relay payload; replicas must reuse it.
  6. Normalize physical outbox direction in tests but require identical logical event content and version.
  7. Retain the optimistic-version conflict and assert exactly one winner under concurrency.
- Required tests: initial mark, correction, unchanged handled above repository, stale version, posted lesson, confirmed settlement, closed period, close-period race, two concurrent corrections, transaction failure after delete/insert/event/outbox boundaries, actor defaults, revision and event exact equality, relay retry.
- Risk: Critical financial/state corruption and rollback divergence.
- Estimated migration impact: **Blocker; high implementation effort**.
- Primary implementation locations: `SQLiteAttendanceRepository.js:384-506`; `PostgresAttendanceRepository.js:282-404`; both relay implementations; `contract-lib.js`.

### Critical — `reopenLesson`

- Current SQLite behavior: immediate transaction; completed/version/settlement/closed-period checks; deletes attendance; preserves `reversed` financial status otherwise sets `unposted`; clears completion; writes canonical event; conditionally emits forward outbox.
- Current PostgreSQL behavior: row lock and completed/version/posted checks; no confirmed-settlement or closed-period transactional check; different raw snapshots/defaults; mandatory reverse outbox.
- Root causes: RC-BR, RC-TX, RC-LK, RC-EV, RC-LA, RC-MI.
- Expected canonical behavior: exact SQLite eligibility rules, financial transition, empty attendance state, history/event semantics, conflict behavior, and full lesson return DTO.
- Recommended implementation: reuse the same shared finance fence, canonical snapshot/event builder, actor normalizer, and logical outbox policy as `replaceForLesson`; assert the conditional financial-status rule and version increment in one PG transaction.
- Required tests: completed/non-completed, stale version, posted, confirmed settlement, closed period/race, concurrent reopen/correction, delete rollback, event/outbox rollback, relay retry/read-after-write.
- Risk: Critical financial/state corruption.
- Estimated migration impact: **Blocker; high implementation effort**.
- Primary implementation locations: `SQLiteAttendanceRepository.js:508-595`; `PostgresAttendanceRepository.js:406-499`; both relay implementations.

### High — `findLessonRoster`

- Current SQLite behavior: includes a student when dated enrollment matches or historical attendance exists; projects guardian relationship/email/chat fallback, ledger-derived balance, attendance totals/rate, and full student metadata.
- Current PostgreSQL behavior: requires a dated enrollment inner join; omits the historical-attendance union and many fields; uses stored student balance/chat values.
- Root causes: RC-SQL, RC-MI, RC-LA.
- Expected canonical behavior: exact SQLite membership and DTO. Historical correction must retain every previously recorded student.
- Recommended implementation: create an internal `AttendanceRosterProjection` backed by current authoritative SQLite student/enrollment/guardian/ledger reads. For PostgreSQL-primary Attendance, overlay current PostgreSQL attendance fields onto that authoritative roster and union any PG attendance student missing from the current enrollment result. Do not migrate guardian or billing tables for this fix.
- Required tests: active enrollment, ended enrollment with/without existing attendance, primary guardian, student-vs-guardian chat fallback, ledger-vs-stored balance, zero attendance rate, deterministic name order, tenant isolation, immediate PG read-after-write.
- Risk: High; incorrect roster can reject a complete submission or lose a historical correction participant.
- Estimated migration impact: **High blocker for user workflow compatibility**.
- Primary implementation locations: `SQLiteAttendanceRepository.js:42-80,148-201`; `PostgresAttendanceRepository.js:56-103`; composition root.

### High — `createReason`

- Current SQLite behavior: generates ID; transactionally inserts; maps constraint status to 409; emits forward event only when mirror is enabled; returns SQLite timestamps.
- Current PostgreSQL behavior: generates ID; transactionally inserts; maps duplicate code to a different DomainError; always emits reverse event.
- Root causes: RC-EV, RC-ER, RC-DT.
- Expected canonical behavior: same reason DTO, same duplicate-code status/code/message captured from the approved SQLite golden contract, same logical reason-created event, and atomic state/event write. Physical direction follows configured primary/counterpart policy.
- Recommended implementation: centralize reason mapper, duplicate-error normalizer, logical event builder, and a single synchronization policy used by both adapters. Tests normalize only source/target store direction, not payload, version, actor, timestamp, or atomicity.
- Required tests: create, duplicate tenant/code, same code other tenant, invalid DB value rollback, mirror enabled/disabled, event write failure, exact DTO.
- Risk: High rollback and management-API inconsistency.
- Estimated migration impact: **High; medium implementation effort**.
- Primary implementation locations: `SQLiteAttendanceRepository.js:228-258,296-315`; `PostgresAttendanceRepository.js:133-160,199-218`.

### High — `updateReason`

- Current SQLite behavior: reads existing row, optimistic update by version, maps missing/stale/constraint errors, conditionally writes forward event, preserves supplied occurrence timestamp.
- Current PostgreSQL behavior: adds `FOR UPDATE`, performs the version update, always writes reverse event, and its generic trigger overwrites explicit `updated_at` with database `NOW()`.
- Root causes: RC-EV, RC-ER, RC-DT, RC-LK.
- Expected canonical behavior: same 404/409 result, exact version increment and DTO timestamp, identical logical event, and atomic update/event outcome. Stronger PG locking is allowed if concurrent observable outcomes match.
- Recommended implementation: reuse the reason components from `createReason`; preserve caller-supplied canonical timestamp. A narrowly scoped PostgreSQL trigger change is likely strictly required: explicit changed `updated_at` must be retained, while omitted/unchanged timestamps may still be touched by the database. Do not change unrelated table triggers without separate evidence.
- Required tests: update, missing, stale, two concurrent updates, duplicate code where applicable, event failure rollback, exact timestamp, mirror policy.
- Risk: High contract/history divergence.
- Estimated migration impact: **High; medium effort; narrow schema approval likely required**.
- Primary implementation locations: both repository update methods; `001_core_schema.sql:5-13,452-476`; reason relays.

### High — `findClosedFinancePeriod`

- Current SQLite behavior: filters global or branch period, prefers branch-specific, then latest start date; returns `{id,label,branchId}`.
- Current PostgreSQL behavior: reads a mirrored table without deterministic ordering and returns a raw snake_case row.
- Root causes: RC-SQL, RC-LA, RC-MI.
- Expected canonical behavior: consult authoritative Finance state, apply exact selection precedence, and return only the canonical DTO or null.
- Recommended implementation: implement this method through the same authoritative `AttendanceFinanceGuard` used by settlement checks. If a PG mirror remains for diagnostics, it must not determine write eligibility.
- Required tests: none, global only, branch only, overlapping branch/global, multiple start dates, boundary dates, wrong tenant, finance unavailable/fail-closed.
- Risk: High because it participates in Critical write guards.
- Estimated migration impact: **Blocker as a dependency of correction/reopen**.
- Primary implementation locations: `SQLiteAttendanceRepository.js:317-327`; `PostgresAttendanceRepository.js:220-229`.

### High — `findAlertSource`

- Current SQLite behavior: resolves lesson date, effective teacher, and start time through lesson/schedule/group fallbacks; returns absent/late students sorted by name.
- Current PostgreSQL behavior: shifts local date through UTC; omits schedule teacher/time fallback.
- Root causes: RC-DT, RC-SQL, RC-LA.
- Expected canonical behavior: exact SQLite alert lesson DTO and record ordering.
- Recommended implementation: reuse the canonical calendar-date mapper and `LessonReferenceReader` from `findLesson`; share a single alert DTO mapper; preserve `HH:MM` time formatting.
- Required tests: today/other-day date, schedule-only teacher/start time, lesson override, group fallback, absent/late filtering, empty records, name ties with deterministic secondary key.
- Risk: High authorization and wrong-message content.
- Estimated migration impact: **High; must precede PG alert traffic**.
- Primary implementation locations: `SQLiteAttendanceRepository.js:336-382`; `PostgresAttendanceRepository.js:236-280`.

### High — `list`

- Current SQLite behavior: returns SQLite attendance IDs; applies reason fallback from status; exposes current nullable/default conventions; orders only by creation timestamp.
- Current PostgreSQL behavior: returns independently generated IDs; uses only persisted reason snapshot; applies different null normalization; has the same non-unique primary ordering.
- Root causes: RC-ID, RC-SQL, RC-PR, RC-EV.
- Expected canonical behavior: the primary-generated attendance ID is identical in both stores; exact query record DTO; status fallback when snapshot fields are absent; deterministic descending order.
- Recommended implementation: propagate primary-generated row IDs in both outbox directions and preserve them in backfill/relay; use shared record mapper and equivalent fallback join/COALESCE rules; add stable tie-breakers after `createdAt` without changing the primary sort intent. Plan a separately approved repair for the 30/43 existing mismatched IDs.
- Required tests: ID equality after backfill/forward/reverse relay, fallback reason, null note/time, timestamp formatting, equal-createdAt ordering, tenant isolation, retry.
- Risk: High API identity and rollback compatibility.
- Estimated migration impact: **High; existing-data repair required after code parity**.
- Primary implementation locations: both query repositories; both write repositories and relays; `AttendanceBackfill.js:224-243`.

### High — `listForTeacher`

- Current SQLite behavior: same record semantics as `list`, filtered by effective lesson/group teacher.
- Current PostgreSQL behavior: same logical filter but inherits ID/fallback/null/order differences.
- Root causes: RC-ID, RC-SQL, RC-PR.
- Expected canonical behavior: exact `list` DTO/identity/order for only the specified teacher and tenant.
- Recommended implementation: consume the shared canonical record SQL fragments/mapper and identity remediation from `list`; add test fixtures with records for more than one teacher.
- Required tests: teacher with/without records, wrong tenant, lesson-vs-group teacher, stable order, exact IDs and fallbacks.
- Risk: High teacher-facing projection compatibility.
- Estimated migration impact: **High; bundled with query/ID remediation**.
- Primary implementation locations: `SQLiteAttendanceQueryRepository.js:99-105`; `PostgresAttendanceQueryRepository.js:105-112`.

### High — `studentProfile`

- Current SQLite behavior: canonical summary plus SQLite record semantics, descending lesson/time/created order, limit 100.
- Current PostgreSQL behavior: equivalent summary but PostgreSQL record identity/fallback/null behavior.
- Root causes: RC-ID, RC-SQL, RC-PR.
- Expected canonical behavior: identical summary and exact ordered canonical records; same 100-row boundary.
- Recommended implementation: reuse the canonical record projection/mapper/ID propagation from `list`; add deterministic tie-breakers after existing lesson date/time/created ordering.
- Required tests: zero records, all statuses, rate rounding, more than 100 rows, timestamp ties, exact IDs/fallbacks.
- Risk: High API profile compatibility.
- Estimated migration impact: **High; bundled with query/ID remediation**.
- Primary implementation locations: both query repository `studentProfile` methods.

### High — `groupProfile`

- Current SQLite behavior: canonical summary, ordered records, and member statistics.
- Current PostgreSQL behavior: equivalent aggregates but PostgreSQL record identity/fallback/null behavior.
- Root causes: RC-ID, RC-SQL, RC-PR.
- Expected canonical behavior: identical summary/member map and exact ordered canonical records.
- Recommended implementation: reuse the shared record and ID remediation; contract equality treats object-key order as insignificant but every member key/value as exact.
- Required tests: empty group, mixed statuses/members, rate rounding, 100-row limit, stable order, exact IDs/fallbacks.
- Risk: High API profile compatibility.
- Estimated migration impact: **High; bundled with query/ID remediation**.
- Primary implementation locations: both query repository `groupProfile` methods.

### Medium — `findByLesson`

- Current SQLite behavior: rich Attendance DTO with tenant/lesson/student identity, student name, normalized reason/note values, and `createdAt`.
- Current PostgreSQL behavior: reduced projection without tenant/lesson/student name/created time and with nullable reason fields.
- Root causes: RC-MI, RC-SQL, RC-PR.
- Expected canonical behavior: exact SQLite Attendance DTO ordered by `studentId`.
- Recommended implementation: join PostgreSQL students, select every canonical field, and use the shared Attendance record mapper. Preserve calendar/timestamp strings and empty-string defaults.
- Required tests: populated/empty lesson, null reason/note, tenant collision, deterministic order.
- Risk: Medium now, but it feeds correction comparison/preservation logic.
- Estimated migration impact: **Medium; required before write-contract certification**.
- Primary implementation locations: `SQLiteAttendanceRepository.js:82-98,203-212`; `PostgresAttendanceRepository.js:105-114`.

### Medium — `listReasons`

- Current SQLite behavior: exact reason DTOs ordered by system/status/name, with source timestamps.
- Current PostgreSQL behavior: same logical order/shape, but five current `updatedAt` values drifted because PG update triggers replace explicit source timestamps.
- Root causes: RC-DT, RC-EV.
- Expected canonical behavior: exact reason DTO and exact source event timestamps; `activeOnly` semantics unchanged.
- Recommended implementation: shared reason mapper plus the narrowly scoped trigger/remirror repair described under `updateReason`; add `createdAt`/`updatedAt` to parity checksum coverage.
- Required tests: active/all, tie order, timestamp exactness, system/custom reasons, relay replay.
- Risk: Medium API/history drift.
- Estimated migration impact: **Medium; existing timestamp repair required**.
- Primary implementation locations: both reason mappers/list methods; PG trigger; verifier columns.

### Medium — `findReason`

- Current SQLite behavior: canonical reason DTO or null.
- Current PostgreSQL behavior: same query intent, but stored `updatedAt` drift makes 5/7 current results different.
- Root causes: RC-DT, RC-EV.
- Expected canonical behavior: exact `listReasons` DTO for the requested tenant/id or null.
- Recommended implementation: same shared mapper, timestamp preservation, and data repair as `listReasons`; no independent implementation path.
- Required tests: existing, missing, wrong tenant, timestamp exactness after create/update/replay.
- Risk: Medium because update commands derive expected version from this result.
- Estimated migration impact: **Medium; bundled with reason remediation**.
- Primary implementation locations: both `findReason` methods and reason relay paths.

### Low — `audit`

- Current SQLite behavior: generates ID and writes an audit row with application `Date.now()` time.
- Current PostgreSQL behavior: generates ID and writes using database `NOW()`.
- Root causes: RC-DT, RC-TX.
- Expected canonical behavior: exactly one tenant-scoped audit row with the same context/action/entity fields, a valid unique ID, and a canonical UTC timestamp from an injected clock. The method resolves with no value. Audit remains a separate transaction in both adapters unless an accepted contract changes both.
- Recommended implementation: inject a shared clock into both repositories and pass one ISO timestamp explicitly; define semantic ID validity rather than byte equality; normalize database errors consistently.
- Required tests: all fields, default/custom entity, frozen clock, tenant isolation, failure propagation, return value.
- Risk: Low operational metadata drift.
- Estimated migration impact: **Low; does not independently block data parity but blocks full contract certification**.
- Primary implementation locations: `SQLiteAttendanceRepository.js:597-603`; `PostgresAttendanceRepository.js:501-506`.

## Remediation order

| Order | Work package | Methods | Why this order | Exit evidence |
|---:|---|---|---|---|
| 0 | Expand identical contract harness and isolated fixtures | All 17 | Prevents changing one adapter without proving the other | Every listed case is executable against both adapters; writes are rolled back/reset safely |
| 1 | Canonical calendar-date mapper | `findLesson`, `findAlertSource` | Proven 29/29 production-like mismatch and business-date impact | Asia/Tashkent and UTC matrix PASS; no date DIFF |
| 2 | Authoritative finance guard and fencing | `hasActiveSettlement`, `findClosedFinancePeriod`, `replaceForLesson`, `reopenLesson` | Highest integrity risk | Positive settlement/closed-period/race/concurrency suite PASS |
| 3 | Canonical write builders and logical event policy | `replaceForLesson`, `reopenLesson`, `createReason`, `updateReason` | Needed for rollback-safe state/history parity | State, result, errors, revision, event, and outbox normalized PASS |
| 4 | Stable attendance identity propagation | Four query methods plus both writes/relays | Existing 30/43 raw ID mismatch breaks rollback/API identity | New events preserve IDs in both directions; approved repair dry-run reports zero collisions |
| 5 | Canonical roster/reference projection | `findLessonRoster`, `findLesson`, `findAlertSource` | Removes cross-context and historical roster assumptions without module migration | Historical enrollment, guardian, ledger, teacher/time fallback suite PASS |
| 6 | Canonical query record projection | `list`, `listForTeacher`, `studentProfile`, `groupProfile` | Builds on stable identity and shared mappings | Raw, not ID-stripped, query parity PASS |
| 7 | Reason timestamp/error parity | `createReason`, `updateReason`, `listReasons`, `findReason` | Narrow schema approval and data repair are dependencies | Exact timestamp/error/replay suite PASS |
| 8 | Remaining DTO and audit parity | `findByLesson`, `audit` | Lower risk, completes the surface | Exact contract suite PASS |
| 9 | Regression gate activation proposal | All 20 | Enforcement follows evidence, not implementation claims | Two consecutive clean isolated runs and one clean shadow snapshot; owner approval |

## Final execution backlog

### PRP-001 — Contract fixture foundation

- Add isolated SQLite/PostgreSQL fixture lifecycle with deterministic tenant IDs and injected clocks/ID generators.
- Execute all 20 methods; include state, result, normalized event, error, and rollback assertions.
- Remove the current query test's ID omission from the final raw-contract gate; retain normalized comparison only as a diagnostic.
- Acceptance: five write methods execute identically; no test touches production/canary data.

### PRP-002 — Date and lesson projection parity

- Implement shared calendar-date and lesson mappers.
- Provide effective teacher/reference reader.
- Add lesson `version` to PostgreSQL mapping.
- Acceptance: `findLesson` and `findAlertSource` exact PASS for timezone/reference matrix.

### PRP-003 — Finance authority contract

- Define `AttendanceFinanceGuard` with closed-period selection and settlement check.
- Back it with authoritative SQLite without moving finance tables.
- Specify unavailable behavior as fail-closed.
- Acceptance: positive/negative/tenant/boundary tests exact PASS.

### PRP-004 — Cross-store finance fencing

- Document and implement lock order for PG lesson lock plus authoritative SQLite finance fence.
- Add close/settlement race and process-failure tests.
- Acceptance: no transition commits after the canonical guard becomes blocking; one concurrent writer wins with canonical conflict.

### PRP-005 — Canonical Attendance write model

- Share row normalization, snapshots, actor defaults, event actions, financial resets, and outbox payload builder.
- Apply to `replaceForLesson` and `reopenLesson` without public API changes.
- Acceptance: exact final lesson, attendance, revisions, events, and normalized outbox equality.

### PRP-006 — Stable Attendance identity

- Generate row IDs once at the primary write and carry them in relay payloads.
- Preserve IDs during forward/reverse apply and backfill; maintain backward compatibility for old payloads.
- Produce a collision-checked, reversible repair specification for existing 30/43 mismatches; do not execute without approval.
- Acceptance: all new logical rows have identical IDs in both stores after retries.

### PRP-007 — Canonical roster projection

- Implement authoritative roster/reference enrichment and PG attendance overlay.
- Preserve historical-attendance membership.
- Acceptance: exact full DTO parity for active, ended, historical, guardian, ledger, and read-after-write fixtures.

### PRP-008 — Canonical query records

- Share record mapper/default rules and reason fallback semantics.
- Add deterministic secondary ordering.
- Acceptance: raw `list`, teacher list, and both profiles deep-equal without removing IDs.

### PRP-009 — Reason write and timestamp parity

- Share reason mapper, error map, and logical outbox policy.
- Submit the narrow PostgreSQL timestamp-trigger change for Architecture Owner approval.
- Add reason timestamps to parity verifier and specify reversible timestamp repair.
- Acceptance: create/update/read/list/replay exact PASS, including conflicts.

### PRP-010 — `findByLesson` DTO parity

- Return every canonical field with identical normalization and ordering.
- Acceptance: populated, empty, null, and tenant-isolation cases exact PASS.

### PRP-011 — Audit parity

- Inject a deterministic clock and explicitly persist its UTC timestamp in both stores.
- Acceptance: same semantic audit contract and failure behavior in both adapters.

### PRP-012 — Full evidence rerun

- Run architecture, repository contract, raw query parity, data/history parity, relay replay, concurrency, and rollback tests in isolated infrastructure.
- Require zero Critical/High/Medium/Low method differences; allowed physical-store variance must be normalized by explicit contract rules, not ignored fields.
- Produce a new evidence hash and readiness review. Do not activate migration or fail-mode gates automatically.

## Completion criteria

Parity remediation is complete only when:

- all 20 repository methods are `Equivalent` under the normative matrix;
- all five write methods pass identical isolated contract suites;
- raw query parity passes without dropping IDs or contract fields;
- positive settlement and closed-period race tests pass;
- relay replay preserves IDs, timestamps, state, revisions, and events;
- existing-data repair has a reviewed reversible plan, even if execution remains unauthorized;
- no public API or module ownership changed;
- the Architecture Owner separately approves any schema change, data repair, routing change, or migration activity.
