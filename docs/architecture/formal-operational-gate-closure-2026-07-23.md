# Formal and Operational Gate Closure

Status: **PASSED**
Decision date: **2026-07-23 (Asia/Tashkent)**
Scope: Attendance SQLite/PostgreSQL migration safety and architecture no-growth enforcement
Decision authority: `architecture-owner`, `data-owner`, `operations-owner`, `quality-owner`, and `security-owner` under the active Single-Founder Governance record

## Decision

The formal and operational gates for the current `tenant_main` Attendance PostgreSQL authority are closed.

This decision also promotes the approved architecture baseline from observation to blocking no-growth enforcement. It does not authorize Workforce extraction, remove SQLite, retire legacy components, or widen PostgreSQL authority to another tenant or bounded context.

## Immutable release evidence

| Evidence | Result |
|---|---|
| Remediation implementation | `3bc3097e2903b4cc917807f9b799ca7628f54617` |
| Baseline approval | `cdcc01b29e1b19c86152d2805c1848e0276923c8` |
| Operational/relay fix | `568fe4c17dec0aa4a96c34d6c39340edb91065b1` |
| Approved configuration hash | `2732cc47b0b0913cf35aa4c176750c9cd4abafe16657d19fc2e00c9ef7b7f15d` |
| Blocking GitHub Actions run | `30027584361`, success |
| Required check | `architecture-enforce-blocking` |
| GitHub artifact | `architecture-enforcement-568fe4c17dec0aa4a96c34d6c39340edb91065b1`, artifact `8571938611`, retained through 2026-08-22 |
| Downloaded artifact SHA-256 | `ee314b6d95b273a98046a5bcd0686d277a13c69d6181b8d52eb630f9b79257d4` |
| Architecture report SHA-256 | `771f3fab3e55a2602baae9e397b52fcefebeae77857aaa16da8a6abadcb52cb6` |

The evidence bundle is stored on the production host under:

`/var/backups/dono/gate-cdcc01b29e1b-20260723T163346Z`

## Backup and restore gate

A paired checkpoint was taken with all three writers stopped for the bounded snapshot:

| Store | Artifact | SHA-256 | Restore result |
|---|---|---|---|
| SQLite | `dono.sqlite` | `b57a1f37ea58eb9533e4eb20cd343a8a96f82ab2da27cdb982547f72d6910941` | integrity `ok`; foreign-key violations `0` |
| PostgreSQL | `attendance-postgres.dump` | `3abb5703001aac60c0de846129b5503d56a26db75b4c8b494f80ee870766d856` | restored into disposable database; 16 tables; zero Attendance lesson/student orphans |

The restored checkpoint contained 29 lessons and 43 Attendance rows in each relevant store. The disposable PostgreSQL restore database was removed after verification.

Automated SQLite backup is active through `dono-backup.timer`. The installed backup path works with either the `sqlite3` CLI or Node's supported `node:sqlite` online backup API, validates integrity and foreign keys, compresses the copy, and writes a checksum. The latest manual timer probe completed with `Result=success` and `ExecMainStatus=0`.

## Controlled route-switch and rollback drill

The drill used only `ui_attendance_canary_13`.

1. Pre-flight stopped before switching when a legacy lesson checksum drift was detected. PostgreSQL migrations and a controlled backfill reconciled the drift; parity then passed.
2. A PostgreSQL canary write advanced Attendance version `2 → 3`. The reverse relay processed and applied it once with zero failures.
3. `tenant_main` was removed from the PostgreSQL allowlist and the application restarted. SQLite readiness and read-after-switch passed. Measured RTO was **1.547 seconds**.
4. A SQLite write advanced version `3 → 4`. This exposed a reference-before-attendance ordering defect while the route safely remained on SQLite.
5. The relay now applies an accepted attendance event when the lesson version is lower than or equal to the event version. A deterministic regression reproduces the exact three-event order and passes.
6. A second SQLite proof advanced version `4 → 5`; the observed order was `reference.lessons.upsert`, `reference.lesson_events.upsert`, then `attendance.replaced`. All three events processed with zero failures and exact parity.
7. `tenant_main` was restored to PostgreSQL authority. Read-after-switch returned version `5`; measured RTO was **1.720 seconds**.
8. The consolidated rollback command was proven with a final PostgreSQL write `5 → 6`: reverse `processed=1`, `applied=1`, `failed=0`; forward drain `processed=2`, `failed=0`; `safeToEnableCanary=true`.

Final reconciliation:

- 9/9 canonical table checksums match;
- Attendance events 38/38 match;
- Attendance revisions 35/35 match;
- all seven orphan checks are zero;
- SQLite→PostgreSQL pending/failed: 0/0;
- PostgreSQL→SQLite pending/failed: 0/0;
- RPO: **0 accepted canary writes lost**.

## Objective thresholds and stop rules

| Signal | Pass threshold | Mandatory stop/rollback condition | Observed |
|---|---:|---|---:|
| Paired backup | both artifacts checksummed and restored | either artifact missing, corrupt, or unrestorable | PASS |
| Canonical parity | 100% covered tables/history match | any count/checksum mismatch | PASS |
| Orphans | 0 | any orphan > 0 | 0 |
| Relay failed | 0 in both directions | any failed event | 0 |
| Relay pending at switch | 0 in both directions | any pending/processing event | 0 |
| Drain lag | ≤ 30 seconds | oldest pending > 30 seconds | 0 seconds |
| Route RTO | ≤ 30 seconds | readiness/read-after-switch not restored in 30 seconds | 1.547 s / 1.720 s |
| Canary HTTP | 100% expected 2xx | any unexpected non-2xx or 5xx | PASS |
| Post-cutover logs | 0 error/failure/exception lines | any unexplained matching line | 0 |
| Observation | 12 consecutive samples over at least 120 seconds | service inactive, readiness false, or queue non-zero | 12/12 over 124 seconds |

Observation ran from `2026-07-23T22:03:09+05:00` through `2026-07-23T22:05:13+05:00`. Every sample had all three services active, health/readiness true, and both relay queues at 0 pending / 0 failed.

## Runtime and access controls

- `dono.service`, `dono-attendance-relay.service`, and `dono-telegram-worker.service` run as `dono:dono`.
- `/etc/dono/dono.env` and `/etc/dono/attendance.env` are `0640 root:dono`.
- application data and backup directories are `0750 dono:dono`.
- `tenant_main` is explicitly routed to PostgreSQL; reverse relay readiness and execution remain enabled.
- readiness requires PostgreSQL while the canary allowlist is non-empty.

## Merge enforcement

The GitHub workflow is no longer warning-only. It executes:

1. approved-baseline architecture enforcement in `enforce` mode;
2. deterministic SQLite/PostgreSQL contract fixtures;
3. the reference-before-attendance relay-ordering regression;
4. 30-day architecture artifact publication.

`main` branch protection requires the strict, up-to-date `architecture-enforce-blocking` check, applies to administrators, requires linear history and resolved conversations, and disables force-push and branch deletion.

## Residual scope boundary

The following are deliberately not closed by this decision:

- Workforce Module Readiness and its business/contract decisions;
- SQLite retirement or deletion;
- legacy component retirement;
- authority expansion beyond `tenant_main` Attendance;
- enterprise-wide availability or latency SLOs outside this canary gate.

Those items require their own gate records.
