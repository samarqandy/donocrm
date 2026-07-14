# DonoCRM teacher panel UI audit

Audit date: 2026-07-14

## Outcome

The teacher backend was materially ahead of the teacher UI. Tenant and assignment-scoped APIs already existed for lessons, weekly schedule, groups, students, attendance, teacher profile, working hours and tasks, but several of those capabilities were not reachable from the teacher navigation.

This pass closes the highest-value self-service gaps without widening teacher permissions.

## Backend-to-UI matrix

| Backend capability | Before | After |
|---|---|---|
| `GET /api/groups` | Loaded only as supporting data | Dedicated **My groups** directory and safe group profile |
| `GET /api/groups/:id/profile` | No teacher entry point | Read-only members, schedule, lessons and attendance views |
| `GET /api/students` | Loaded only for attendance | Dedicated **My students** directory |
| `GET /api/students/:id/profile` | No teacher entry point | Finance-safe contact, learning and attendance profile |
| `GET /api/teachers/:id` | Admin drawer only | Teacher self-profile with employment and workload data |
| Teacher working hours | Admin UI only | Read-only working-hours card in the teacher profile |
| Upcoming lessons | Generic calendar only | Profile summary plus calendar entry point |
| Teacher dashboard stats | Partly recomputed in browser | Server-scoped group/student counts are used |

## Permission decisions

- Teacher group and student screens remain read-only.
- Finance, balance, debt, Telegram IDs, portal-access controls and admin mutations are not rendered for teachers.
- Group and student detail requests remain protected server-side; unassigned records return `403`.
- Teacher password change remains available as self-service.
- Working-hour mutation remains an admin responsibility because the current API requires admin authority.

## Benchmark decisions

The implementation follows the practical teacher-portal pattern used by education CRMs: own schedule, assigned groups, assigned students, attendance, tasks and profile/workload visibility. It intentionally does not expose AlfaCRM's optional cashbox or payroll views because DonoCRM does not yet have a teacher-safe payout statement contract.

References:

- https://alfacrm.pro/knowledge/getting-started/teacher-account
- https://alfacrm.pro/knowledge/main-sections/customers-teachers
- https://openeducat.org/feature-faculty-management-system/

## Verification

- `node scripts/qa-smoke.js`
- `node scripts/test-backend-logic.js`
- Runtime login on `http://127.0.0.1:8081/` as teacher
- Desktop viewport: 1440×900
- Mobile viewport: 390×844
- No horizontal page overflow on the new groups, students or profile screens

## Deferred

- Teacher lesson topic, homework, private student note and grading workflow: no complete backend contract yet.
- Teacher payroll/accrual statement: immutable accrual data exists, but no scoped teacher statement API exists.
- Teacher-editable working hours: requires an explicit permission and server policy before exposing mutations.
- Day/month calendar modes and lesson filters: useful parity work, but lower priority than making existing scoped data reachable.
