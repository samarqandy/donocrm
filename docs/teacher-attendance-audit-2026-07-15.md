# Teacher attendance audit — 2026-07-15

Scope: assigned teacher lesson roster, attendance finalization, lesson summary, corrections, history and parent alerts.

## Benchmark decisions

Only operationally necessary patterns were selected:

- AlfaCRM teacher flow: conduct a lesson from the calendar, explicitly mark attendance and absence reason, add per-student notes, lesson topic and homework, and surface unconducted lessons.
  - https://alfacrm.pro/knowledge/getting-started/teacher-account
  - https://alfacrm.pro/knowledge/main-sections/calendar
- AlfaCRM reason policies: absence reasons may affect charging, therefore DonoCRM continues to snapshot reason code/name and charge/consume percentages per attendance revision.
  - https://alfacrm.pro/knowledge/main-sections/tariff
- OpenEduCat session lifecycle: a completed session is not treated as an ordinary editable calendar row.
  - https://newdocs.openeducat.org/attendance/track-attendance/
  - https://newdocs.openeducat.org/timetable/manage-sessions/

DonoCRM intentionally does not automatically mark everyone present. The bulk action is explicit and teacher-triggered to avoid silent attendance and billing errors.

## Findings and fixes

| Finding | Resolution |
|---|---|
| Backend stored a student attendance note, but lesson roster/UI did not return or edit it | Roster now returns `attendanceNote`; teacher can enter a 500-character student note |
| A deactivated reason disappeared from the teacher's completed lesson view | Roster returns snapshotted reason name/code and UI renders a historical fallback option |
| Admin correction reason was lost by the saving re-render | Correction reason is state-backed and survives render/save |
| Correcting another field could fail when an old attendance reason was inactive | An unchanged historical reason may be preserved with its original financial snapshot; it still cannot be newly assigned |
| Lesson topic/homework/general note were outside the teacher attendance flow | They are now saved atomically with the attendance revision |
| No completion feedback before save | Added marked/remaining progress and present/absent/late/excused counters |
| Repetitive marking was slow | Added an explicit “mark all present” action; every student still must have a valid status/reason |
| Future schedule occurrences could be materialized from the attendance action and fail only at save | Future attendance action is disabled and guarded before materialization |
| Past unconducted lessons were not visible as an operational exception | Teacher dashboard now surfaces an overdue count and direct attendance entry point |
| Attendance history was a flat student-row feed and lesson table omitted date | History is grouped as a lesson journal with status counts and drill-down; lesson dates are visible |
| Telegram result was generic | UI reports queued, duplicate and skipped recipient counts |

## Preserved invariants

- Teacher access is tenant- and assignment-scoped.
- Roster must be complete and contain every eligible student exactly once.
- Cancelled/future lessons cannot be completed.
- Completed attendance is immutable for teachers.
- Admin correction requires a reason, an open finance period and no active settlement.
- Attendance revisions remain append-only; financial reason percentages are snapshotted.
- Attendance save does not automatically queue parent messages.
- Alerts target only absent/late students, respect guardian notification consent and use revision-scoped deduplication.

## Verification

- JavaScript syntax checks: passed.
- `scripts/test-backend-logic.js`: 20/20 suites passed.
- `scripts/qa-smoke.js`: full HTTP/UI smoke suite passed.
- New regression coverage includes atomic lesson details, student note round-trip, historical inactive reason display/preservation and existing alert/RBAC/lifecycle invariants.
