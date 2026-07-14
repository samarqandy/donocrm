# DonoCRM teacher management benchmark

Audit date: 2026-07-12

## Verified benchmark patterns

OpenEduCat treats faculty as an academic profile connected to subjects, courses, timetables and optional HR/user records. Its useful patterns for DonoCRM are unified profiles, qualification-aware assignments, workload visibility, schedule-conflict prevention, self-service with restricted permissions and historical faculty/session attribution.

Official references:

- https://openeducat.org/feature-faculty-management-system/
- https://newdocs.openeducat.org/features/core/faculty/
- https://github.com/openeducat/openeducat_erp/blob/18.0/openeducat_core/models/faculty.py
- https://github.com/openeducat/openeducat_erp/blob/18.0/openeducat_timetable/models/timetable.py

AlfaCRM gives learning centers a dedicated teacher directory and a practical profile card containing the next seven days of lessons, contacts, working schedule, qualification, workload/statistics and CRM access. Teacher profile and user account are separate. Archiving access preserves operational history, while teacher permissions are scoped to assigned lessons, groups and students.

Official references:

- https://alfacrm.pro/knowledge/main-sections/customers-teachers
- https://alfacrm.pro/knowledge/main-sections/user
- https://alfacrm.pro/knowledge/getting-started/teacher-account
- https://alfacrm.pro/knowledge/main-sections/calendar

## DonoCRM decisions

Implemented now:

- dedicated admin navigation and teacher directory;
- unified profile with specialization and employment details;
- active/archive lifecycle without hard deletion;
- optional portal account with separate access state;
- transactional profile/account creation using the same identity ID;
- PBKDF2 passwords, session invalidation and admin reset;
- tenant-scoped group, student, completed-lesson and weekly-workload aggregates;
- profile tabs for overview, groups, working hours/upcoming lessons and access;
- working-hour overlap validation;
- lesson-level teacher snapshot so reassignment does not rewrite history;
- audit log entries for profile, access, password and working-hour mutations.

Intentionally deferred:

- payroll/rate rules and payouts, until a dedicated immutable teacher payroll ledger exists;
- university-oriented research, publication, tenure and accreditation workflows;
- substitute-teacher workflows and multiple teachers per group;
- document/qualification verification and performance reviews.

The result borrows product principles, not UI or source code, from either platform.
