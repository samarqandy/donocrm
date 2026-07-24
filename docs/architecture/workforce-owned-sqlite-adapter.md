# Workforce Owned SQLite Compatibility Adapter

Status: WF-EXT-04 completed; owned persistence implemented, runtime binding disabled

Decision date: 2026-07-24

Next ordered increment: WF-EXT-05

Adapter manifest SHA-256:
`ec5967858c0da486a7ac521d83c4cae33477defe0f0c8d21933dd70b2d33b3a4`

Live extraction state SHA-256:
`cfd6ce3a9e54b9106107cda86fc857bf2e9371940e1e2871830c8688e354966b`

## Decision

**WF-EXT-04: PASSED.**

`WF-ADAPTER-OWNED-SQLITE-01` now implements all 5/5 owned focused ports and
12/12 methods. The adapter group consists of a Teacher store, a Working Hour
store, and a factory that maps those stores to the exact Application dependency
names.

The adapter receives an already-open SQLite handle. It does not import the legacy
database client, `AppRepository`, service container, environment configuration,
or migration infrastructure.

## Data Boundary

Direct access is limited to:

- `teachers` — explicit base fields, tenant-scoped reads/inserts/profile updates/status updates;
- `teacher_working_hours` — explicit fields, tenant-scoped reads/inserts/deletes.

No Identity, Branch, Group, Schedule, Lesson, Student, Audit, finance, session, or
other provider table is read or written. SQLite authorizer evidence denies any
non-owned data table during the owned-port suite.

The production schema fingerprint remains unchanged. Schema changes, migrations,
foreign-table exceptions, generated IDs/timestamps, Audit writes, and provider
responsibilities are all zero.

## Transaction and Concurrency Rules

Teacher mutations use SQLite single-statement atomicity. Working Hour insert and
delete use `BEGIN IMMEDIATE`:

1. acquire the write transaction;
2. recheck the tenant/Teacher/weekday interval overlap;
3. insert or tenant-scoped delete;
4. commit, or roll back on every failure.

Owned uniqueness/overlap constraints map to `OWNED_RECORD_CONFLICT`. Unknown
driver failures remain technical errors and are not mislabeled as business
conflicts.

The deterministic concurrency case opens two SQLite connections and releases both
workers through a `SharedArrayBuffer`/`Atomics` barrier. For overlapping inserts,
exactly one commits and one returns `OWNED_RECORD_CONFLICT`; there are no sleeps or
timing races.

## Executable Evidence

`WF-TEST-SUITE-03` runs:

```text
npm run test:workforce:owned-sqlite
```

Result: 9/9 cases passing. The suite covers all owned ports/methods, exact DTOs,
tenant isolation, Teacher ordering, minimum reference projection, explicit-field
mutation, rollback, driver errors, adjacency/overlap, authorizer table access,
unchanged production-schema compatibility, atomic delete, and competing inserts.

The cumulative target state is 4/10 PRE-13 suites and 30/30 target contract cases
passing. Six target suites remain blocking.

## Runtime Boundary

After WF-EXT-04:

- legacy remains the sole runtime authority;
- owned adapter implementations are 1, but Bootstrap adapter bindings are 0;
- Public Application instances remain 0;
- provider and HTTP adapters remain 0;
- route bindings, shadow routes, and target routes remain 0;
- production cohorts and authority transfers remain 0;
- schema changes remain 0;
- all four consistency legacy-hold variants remain target-ineligible.

The Bootstrap registration stays `publicApplication: null`,
`adapterBindings: []`, `routeBindings: []`, and `activation: disabled`.

## Enforcement

`npm run architecture:workforce-sqlite` verifies source fingerprints, the exact
five-port/twelve-method bundle, two-table SQL allowlist, unchanged schema, module
topology, deterministic suite, conflict/transaction policy, live state, baseline,
and zero activation. It is included in both `architecture:workforce` and required
`architecture:enforce`.

Architecture, Workforce Module, Data, and Quality owners approve WF-EXT-04 with
zero temporary exceptions. The next ordered increment is **WF-EXT-05 — extract
the read-only Teacher reference/list slice while preserving DTO, authorization,
ordering, and error contracts; routing remains separately gated**.
