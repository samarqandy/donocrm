# DONOCRM Executable Architecture Infrastructure

Status: Stage 3 blocking no-growth enforcement active
Effective date: 2026-07-22
Scope: Architecture validation infrastructure only
Owners: Architecture Owner, Quality Owner, Data Owner

## Outcome

DONOCRM now has executable, blocking no-growth architecture validation backed by machine-readable ownership manifests. The original Phase 1A implementation began in warning-only mode; on 2026-07-23 the baseline was approved and the required GitHub check was activated. The historical assessment below is retained to show the promotion path. Current evidence is owned by [Formal and Operational Gate Closure](formal-operational-gate-closure-2026-07-23.md).

Generated evidence is written under `artifacts/architecture/` and excluded from version control.

## Machine-Readable Manifests

The files use the JSON-compatible subset of YAML 1.2. This gives deterministic parsing through the existing Node.js runtime without adding a production or development parser dependency. File extension remains `.yaml` for governance clarity; comments and YAML-only syntax are intentionally unsupported.

| Manifest | Authority |
|---|---|
| `architecture/owners.yaml` | Named governance and specialist owner IDs; CI operational owner status |
| `architecture/modules.yaml` | Bounded contexts, source roots, lifecycle status, public paths, layer roots, composition roots, SQL placement roots, and Shared Kernel allowlist |
| `architecture/tables.yaml` | Single target owner and tenant-scope metadata for every known physical/temporary business or migration table |
| `architecture/exceptions.yaml` | Exact expiring exception records; currently empty |
| `architecture/baseline.json` | Legacy no-growth metrics and semantic violation fingerprints; approval remains pending |

Unknown owner IDs, context IDs, tables, malformed manifests, unresolved local imports, and expired/incomplete exceptions are findings. In future fail mode they are blocking.

## Implemented Scanners

The entrypoint is `scripts/architecture/scan.js`.

| Check | Rule IDs | Implementation |
|---|---|---|
| Forbidden imports | AR-000, AR-001, AR-002, AR-007, AR-008 | Resolves CommonJS and static ESM edges across production source; detects unresolved imports, outward Domain/Application edges, private cross-module imports, and module-to-legacy dependencies |
| Layer violations | AR-001–AR-005 | Classifies module Domain/Application/HTTP/Infrastructure paths and applies direction/restricted dependency rules |
| Presentation SQL | AR-030 | Extracts SQL-shaped JavaScript string/template literals and reports SQL in HTTP/workers/browser or outside approved roots |
| Cross-context/table access | AR-031 | Extracts read/write tables and compares executing module context with `tables.yaml`; CTE/system catalogs are distinguished from owned physical tables |
| Forbidden Infrastructure dependencies | AR-004 | Detects module Infrastructure importing HTTP or another module's Infrastructure |
| Legacy growth | AR-060 | Compares lines/methods/routes/frontend functions/Shared Kernel metrics with `baseline.json` |
| Shared Kernel | AR-070, AR-071 | Compares `src/core` files and consumers with the empty-by-default allowlist and baseline-only entries |
| Manifest/exception validity | AR-020, AR-031, AR-050 | Resolves every module/table owner and validates exact exception fields/expiry |

The scanner publishes:

- `architecture-report.json` — machine-readable findings, dispositions, dependency/SQL counts, metrics, configuration hash;
- `architecture-report.md` — human-readable evidence table.

Finding dispositions are `UNBASELINED`, `CANDIDATE_BASELINE`, `BASELINE`, or `EXCEPTION`. OBSERVE mode prints all findings as warnings and exits successfully. The current candidate fingerprints remain blocking in future enforce mode until the baseline has a reviewed commit, approver, and approved status.

## Repository Contract Runner

`scripts/architecture/contract-runner.js` loads the actual Attendance SQLite and PostgreSQL command/query adapter classes and runs one shared contract definition against both sides.

Always-executed checks:

- command repository method-surface parity;
- query repository method-surface parity;
- known static semantic checks, including the current `hasActiveSettlement` implementation difference.

Live checks run only when both are explicitly supplied:

```text
DATABASE_URL=<isolated PostgreSQL URL>
ARCHITECTURE_CONTRACT_TENANT=<isolated parity tenant>
```

The live runner uses the configured SQLite database and PostgreSQL pool, discovers tenant fixture identifiers from SQLite, and executes identical cases for:

- query counts/lists/teacher lists/student stats/group stats/profiles;
- command-side lesson, roster, records, reasons, closed-period, active-settlement, and alert-source reads.

Results are exactly `PASS`, `FAIL`, or `DIFF`:

- `PASS` — both adapters completed and normalized semantic results match;
- `FAIL` — an adapter/surface case failed or threw unexpectedly;
- `DIFF` — both were comparable but semantics differ, or live comparison prerequisites are absent.

Artifacts contain hashes and difference paths rather than raw student/tenant data.

## Parity Report Generator

`scripts/architecture/parity-report.js` executes the same shared contract runner and publishes:

- `parity-report.json`;
- `parity-report.md`.

The report lists only failed/different cases with SQLite/PostgreSQL evidence hashes and semantic difference paths. It performs no automatic fix, data mutation, backfill, or authority change.

Current expected OBSERVE result is `DIFF` because:

1. PostgreSQL `hasActiveSettlement` returns a constant while SQLite queries persisted settlement state;
2. local/CI live adapter comparison is unavailable unless an isolated PostgreSQL URL and tenant fixture are explicitly configured.

## Commands

```bash
npm run architecture:check
npm run architecture:contract
npm run architecture:parity
npm run architecture:observe
```

All commands default to OBSERVE mode. Direct future enforcement can be tested without changing package scripts:

```bash
ARCHITECTURE_MODE=enforce node scripts/architecture/scan.js --mode enforce
```

Enforce mode is not authorized for protected branches until baseline/tooling approval criteria below pass.

## CI Integration

`.github/workflows/architecture-observe.yml` runs on pull requests, pushes to `main`, and manual dispatch using Node.js 24 and `npm ci`.

The workflow:

1. runs architecture, contract, and parity checks;
2. keeps `ARCHITECTURE_MODE=observe`;
3. uses a warning-only/non-blocking job;
4. uploads generated evidence for 14 days;
5. does not deploy, migrate, backfill, or connect to production services.

Without an isolated PostgreSQL service/fixture the parity stage deliberately publishes `DIFF`, not a false `PASS`.

## Future Fail-Mode Activation

Promotion from OBSERVE to merge-blocking enforcement requires all of the following:

1. Architecture Owner approves the scanner rule set and exact semantic findings;
2. `baseline.json` records the reviewed commit, fingerprint list, approver, and configuration hash;
3. machine-readable owner/module/table manifests are reviewed against current schema and bounded-context decisions;
4. positive and negative scanner fixtures prove every enforced rule;
5. false-positive noise is resolved without broad ignores;
6. CI operational owner, artifact retention, and branch-protection authority are assigned;
7. full runtime regression baseline passes deterministically;
8. shared contract runner executes live against isolated SQLite/PostgreSQL fixtures;
9. authoritative-adapter parity has zero unexplained `FAIL` or `DIFF`;
10. exact expiring exception and individual-rule rollback procedures are rehearsed.

Activation sequence:

```text
OBSERVE → reviewed warnings → approved baseline → fail new violations
        → fail expired exceptions/unknowns → mandatory Gates A–F
```

Existing approved fingerprints remain visible as `BASELINE`; they are not compliant. Any broadened source, target, table, access mode, or consumer becomes a new failing fingerprint.

## Current Readiness Effect

Executable ownership and warning-only CI raise Architecture Enforcement Foundation readiness from 60/100 to **69/100**. The gate remains **NOT READY** because the baseline is unsigned, CI is non-blocking, live adapter parity is not established, the known settlement semantic difference remains, scanner fixtures are not yet comprehensive, and production-like rollback/observability evidence remains incomplete.

The next authorized work is enforcement hardening and baseline approval. Attendance migration is not started or expanded, and Workforce remains unauthorized.
