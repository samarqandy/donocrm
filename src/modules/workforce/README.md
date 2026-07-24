# Workforce module

Module runtime stage: WF-EXT-01 — structure and composition registration only.
Extraction evidence: WF-EXT-04 — owned SQLite compatibility adapter implemented.

This directory is the approved source root for the Workforce bounded context. The
context owns Teacher business profiles, lifecycle, working-hour availability, and
stable Teacher references as defined by the approved Workforce module definition.

Domain contains the Teacher and Working Hour invariants plus two owned repository
port contracts. Application contains one public facade implementing both approved
surfaces, the remaining focused port contracts, verified contexts, immutable typed
results, and closed errors. Infrastructure contains one injected-handle SQLite
adapter group for `teachers` and `teacher_working_hours`; HTTP remains absent.

Runtime authority remains the frozen legacy path. This directory contains no route,
provider adapter, schema, environment, migration selector, or legacy
`AppService`/`AppRepository` dependency. Infrastructure SQL is limited to the two
Workforce-owned tables and creates no schema.

The facade has no Bootstrap instance or binding at this increment. All ten HTTP
operations continue through legacy; the four consistency variants approved as
legacy holds remain ineligible for target dispatch.
