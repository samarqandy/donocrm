# DonoCRM group management benchmark

**Audit date:** 2026-07-12  
**Scope:** DonoCRM `Groups` module, AlfaCRM public documentation, OpenEduCat documentation and public Community source  
**Decision:** borrow proven domain patterns and operational workflows; do not copy either product's UI or source code.

## Executive decision

For DonoCRM, the useful common model is:

```text
Course / subject
  └─ Group / cohort
       ├─ effective-dated membership
       ├─ effective-dated teacher assignment
       └─ recurring schedule rule
            └─ concrete lesson/session
                 ├─ attendance record
                 ├─ notification event
                 └─ financial posting
```

The group record must not become the storage location for membership history, every lesson, attendance and finance. Those concerns have different lifecycles and must stay separate.

## Verified benchmark patterns

### AlfaCRM

AlfaCRM's group card includes a learning period, level, responsible teachers, participant limit, status, online stream and branches. Membership has its own status and validity period; group history is preserved. Recurring schedules have their own validity period, teacher, room and time. Concrete lessons are then planned, conducted or cancelled separately.

Official references:

- [Groups](https://alfacrm.pro/knowledge/main-sections/group)
- [Lessons and recurring schedules](https://alfacrm.pro/knowledge/main-sections/calendar)
- [Teachers](https://alfacrm.pro/knowledge/main-sections/customers-teachers)
- [AlfaCRM v2 API practical scheme](https://alfacrm.pro/knowledge/rekomendacii-po-rabote-s-sistemoj/v2api-prakticheskaya-skhema-integracii)
- [Analytics](https://alfacrm.pro/knowledge/main-sections/dashboard)

Useful decisions for DonoCRM:

- temporal membership instead of overwriting group history;
- recurring rule separated from a dated lesson;
- responsible teacher separated from the teacher of a schedule/session;
- soft archive rather than hard deletion;
- group 360 view with capacity, roster, plan/fact, attendance and debt;
- notification outbox driven by membership, lesson and payment events.

Patterns not copied blindly:

- AlfaCRM capacity and some schedule conflicts may be warnings that can be overridden. DonoCRM currently uses a hard capacity and hard collision policy; a future override must require a permission, reason and audit event.
- Automatically conducting yesterday's lessons with every student present creates attendance and charging risk; it must not be a DonoCRM default.
- Pricing rules must be effective-dated and immutable for already posted lessons.

### OpenEduCat

The strongest verified OpenEduCat pattern is a separate student-course/batch enrollment record. The public Community model stores student, course, batch, roll number, subjects, academic period and state outside the student master record. Timetable sessions separately connect course/batch, subject, faculty, classroom and time.

Official documentation and source:

- [Courses and batches](https://newdocs.openeducat.org/admin/courses-batches/)
- [Student enrollment](https://newdocs.openeducat.org/students/enroll-course/)
- [Timetable](https://newdocs.openeducat.org/timetable/)
- [Attendance](https://newdocs.openeducat.org/attendance/track-attendance/)
- [OpenEduCat Community 19.0 commit](https://github.com/openeducat/openeducat_erp/commit/7d5d28deb6856792f99a9a5a3e3d3a48f35aa444)
- [`op.student.course` source](https://github.com/openeducat/openeducat_erp/blob/7d5d28deb6856792f99a9a5a3e3d3a48f35aa444/openeducat_core/models/student.py)
- [Batch source](https://github.com/openeducat/openeducat_erp/blob/7d5d28deb6856792f99a9a5a3e3d3a48f35aa444/openeducat_core/models/batch.py)
- [Timetable session source](https://github.com/openeducat/openeducat_erp/blob/7d5d28deb6856792f99a9a5a3e3d3a48f35aa444/openeducat_timetable/models/timetable.py)

Documentation/source caveat:

- Current documentation describes richer batch capacity, section, coordinator, progression and merge behavior.
- The referenced public Community batch model only verifies code, name, start/end dates, course and active state.
- Therefore documentation-only capabilities must not be treated as proven Community implementation or copied without designing DonoCRM's own invariants.

## DonoCRM state after this audit

Implemented and retained:

- rich group profile: subject, description, level, capacity, period, status, color, note and monthly fee;
- temporal `student_group_enrollments` history for initial enrollment, transfer, withdrawal and restore;
- temporal `group_teacher_assignments` history;
- recurring schedule rules with teacher, room, weekday, time, validity period and online link;
- indexed group, teacher and room overlap detection;
- group profile with active/former roster, schedules, teacher history, lesson plan/fact, attendance aggregate and finance/debt summary;
- transaction-protected hard capacity enforcement;
- tenant-scoped joins and teacher-scoped read DTOs that omit finance and Telegram data;
- archive/restore without hard deletion, blocked by active members, future lessons or active recurring schedules;
- teacher reassignment that preserves completed lessons and explicit substitute teachers;
- migration-safe upgrade of legacy SQLite databases and atomic database initialization.

Production verification completed:

- legacy live-database copy upgraded successfully;
- `PRAGMA integrity_check = ok`;
- zero foreign-key violations;
- entity counts preserved across the upgrade;
- backend logic suite: `18/18` passed;
- full HTTP/UI smoke suite passed;
- live health, readiness, login, group list, group profile and logout returned success;
- service remained active with zero restarts after deployment.

## Prioritized remaining backlog

### P1 — next operational release

1. **Session exceptions and lifecycle**
   - materialize/cancel/reschedule one occurrence without rewriting the recurring rule;
   - holiday and mass-cancel workflow;
   - only future sessions follow a schedule-rule change.

2. **Transactional roster operations**
   - explicit transfer command: close old membership and open the new one in one transaction;
   - bulk enroll/transfer with dry-run, per-row errors and idempotency;
   - waitlist/reserve status when capacity is reached.

3. **Complete collision policy**
   - include concrete one-off lessons and overlapping students, not only recurring group/teacher/room rules;
   - optional privileged override with reason and audit history.

4. **Group lifecycle invariants**
   - prevent `completed/cancelled` transitions while active members or future sessions remain, or provide one explicit close-group workflow;
   - automatically propose closure after `end_date`; do not silently mutate financial or attendance history;
   - add a tenant/branch-scoped stable group code.

5. **Attendance finalization**
   - draft/finalized state;
   - absence reason as one source of truth for reports, billing and notifications;
   - correction/reversal records instead of destructive edits after finalization.

6. **Finance attribution**
   - invoice/payment allocation to a group or enrollment;
   - effective-dated fee plan and partial-payment allocation;
   - immutable reversal and closed-period rules before adding profitability reports.

### P2 — after the core is stable

- public enrollment and consent-aware waitlist routing;
- guardian multi-child portal with strict row scope;
- substitute-teacher workflow and workload balancing;
- attendance/debt alerts driven by the notification outbox;
- CSV/Excel export and scheduled group reports;
- assignments and simple assessments only if pilot customers validate demand.

Not recommended now: full LMS, university progression/GPA, OMR, biometrics, transport, library, HR/payroll and broad ERP scope.

## Required acceptance criteria for the next phase

- A membership never backfills lessons or attendance before its start date.
- Ending or transferring membership never deletes historical attendance or finance.
- Capacity remains correct under concurrent create, transfer and restore requests.
- Updating a schedule affects only future occurrences.
- A teacher, room, group or student collision is rejected unless an audited override is explicitly authorized.
- Lesson finalization is idempotent; a retry cannot duplicate attendance, charge or notification events.
- Reversal creates compensating records and never deletes the original financial posting.
- Teacher APIs never expose group finance, balances, debt or Telegram identifiers.
- Every group query remains tenant-scoped, including all joined tables and aggregates.
