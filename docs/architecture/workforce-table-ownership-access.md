# Workforce Table Ownership and Access Manifest

Decision ID: WF-PRE-08  
Status: Approved  
Decision date: 2026-07-24  
Manifest: `workforce-table-access-2026-07-24.1`  
Implementation evidence commit: `5bcd2dd443b0ba429dfd04b711956945479e92b9`  
Machine-readable evidence: [`architecture/workforce-table-access-manifest.json`](../../architecture/workforce-table-access-manifest.json)  
Manifest SHA-256: `b5ee0a38035c7f4b7a02b0724829e17b6e3d4044ee42c7d35a848bcb4fd5d298`

## Decision Authority

| Concern | Approval role | Approver | Decision |
|---|---|---|---|
| Target table authority/access policy | Architecture Owner | Sukhrob Khaydarov | Approved |
| Workforce-owned persistence | Workforce Module Owner | Sukhrob Khaydarov | Approved |
| Exact SQL closure and schema constraints | Data Owner | Sukhrob Khaydarov | Approved |
| Identity tables | Identity & Access Owner | Sukhrob Khaydarov | Approved |
| Branch table | Organization & Branches Owner | Sukhrob Khaydarov | Approved |
| Group/Schedule/Lesson/Student tables | Respective context owners | Sukhrob Khaydarov | Approved |
| Audit table | Audit & History Owner | Sukhrob Khaydarov | Approved |
| Tenant predicates and sensitive-state treatment | Security Owner | Sukhrob Khaydarov | Approved with five blocking risk treatments |

## Decision

The exact direct SQL closure of all ten frozen Workforce operations contains:

- **12 directly accessed tables**;
- **2 Workforce-owned tables**;
- **10 foreign-owned tables**;
- **2 additional schema-only dependencies**;
- **0 temporary target access exceptions**.

Every foreign direct read/write is assigned to a WF-PRE-07 provider contract family. No target Workforce layer, compatibility coordinator, Infrastructure adapter, or migration adapter may directly access a foreign table.

Current `AppRepository` SQL remains permitted only on the frozen legacy route until an authorized operation cutover. Legacy access is debt, not a target exception.

No runtime source, route, schema, database, table, business behavior, or user-visible contract changed in WF-PRE-08.

## Scope and Closure Rule

The manifest starts from `WF-HTTP-01` through `WF-HTTP-10` and follows the complete legacy call closure, including:

- use-case validation lookups;
- aggregate persistence;
- response projection reads after mutations;
- Branch default lookup;
- Group/Lesson archive blockers;
- Working Hour overlap/readback;
- post-success audit append.

The closure begins after the HTTP layer establishes verified actor, tenant, and permission context. Identity/Platform SQL used to authenticate the request is an interface precondition, not Workforce capability access. Workforce-specific Identity projection and mutation SQL remains included.

This matters because a mutation such as create/restore can read several foreign tables only to build its response. Those reads are still architectural dependencies and are not omitted.

## Target Access Policy

| Rule | Decision |
|---|---|
| Default | Deny |
| `teachers` / `teacher_working_hours` | Direct access allowed only inside an authorized Workforce Infrastructure adapter implementing a focused port |
| Any foreign table | Direct access forbidden in every Workforce/coordination/migration layer |
| Foreign fact or command | Use provider public contract through the WF-PRE-07 outer coordinator |
| Existing cross-context FK | May remain during first extraction; grants no application access authority |
| Legacy SQL | Allowed only on the frozen legacy path |
| Temporary target exception | None approved |

WF-PRE-09 subsequently fixes public Application contract signatures and WF-PRE-10 fixes [focused owned/provider ports](workforce-focused-ports.md). This decision fixes authority and permitted access, not implementation names.

## Exact Table Inventory

### Workforce-owned direct tables

| Table | Current verbs | Operations | Target treatment |
|---|---|---|---|
| `teachers` | Read, Insert, Update | 01–06, 08–09 | Focused Teacher persistence/base-projection port |
| `teacher_working_hours` | Read, Insert, Delete | 02, 05, 08–10 | Focused Working Hour persistence/query port |

Only these two tables may be directly accessed by the future Workforce persistence adapter.

### Foreign direct tables

| Table | Owner | Current verbs | Operations | Required target contract/seam |
|---|---|---|---|---|
| `users` | Identity & Access | Read, Insert, Update | 01–07, 09 | Portal lifecycle/reset/Admin projection; WF-SEAM-01/02/06 |
| `user_roles` | Identity & Access | Insert | 03–04 | Teacher-role provisioning; WF-SEAM-01 |
| `user_branch_access` | Identity & Access | Insert | 03–04 | Branch-grant provisioning; WF-SEAM-01 |
| `sessions` | Identity & Access | Delete | 04–05, 07 | Session invalidation; WF-SEAM-01/02 |
| `branches` | Organization & Branches | Read | 03–04, 09 | Branch validation/default; WF-SEAM-03 |
| `groups` | Academic Groups | Read | 01–06, 09 | Archive blocker/summary; WF-SEAM-04/06 |
| `students` | Student Information | Read | 01–06, 09 | Count source facts; WF-SEAM-06 |
| `schedules` | Scheduling | Read | 01–06, 09 | Workload projection; WF-SEAM-06 |
| `lessons` | Lesson Delivery | Read | 01–06, 09 | Archive blocker/projection; WF-SEAM-05/06 |
| `audit_logs` | Audit & History | Insert | 03–07, 09–10 | Mandatory audit append; WF-SEAM-07 |

All ten rows have `targetDirectAccess: forbid` in the machine manifest.

### Schema-only dependencies

| Table | Owner | Direct operation access | Treatment |
|---|---|---|---|
| `tenants` | Platform Administration | None | Existing FK/cascade and verified tenant context only |
| `roles` | Identity & Access | None | Identity-internal FK target behind role provisioning |

Schema constraints are not application access. Their presence does not authorize Workforce SQL.

## Operation × Table Access

Legend: `R` read, `I` insert, `U` update, `D` delete.

| Operation | Exact direct table closure |
|---|---|
| WF-HTTP-01 List Teachers | `teachers R`, `users R`, `groups R`, `students R`, `schedules R`, `lessons R` |
| WF-HTTP-02 Get Profile | Above six + `teacher_working_hours R` |
| WF-HTTP-03 Create Teacher | `teachers R/I`, `users R/I`, `user_roles I`, `user_branch_access I`, `branches R`, `groups R`, `students R`, `schedules R`, `lessons R`, `audit_logs I` |
| WF-HTTP-04 Update Teacher | `teachers R/U`, `users R/I/U`, `user_roles I`, `user_branch_access I`, `sessions D`, `branches R`, `groups R`, `students R`, `schedules R`, `lessons R`, `audit_logs I` |
| WF-HTTP-05 Archive Teacher | `teachers R/U`, `teacher_working_hours R`, `users R/U`, `sessions D`, `groups R`, `students R`, `schedules R`, `lessons R`, `audit_logs I` |
| WF-HTTP-06 Restore Teacher | `teachers R/U`, `users R`, `groups R`, `students R`, `schedules R`, `lessons R`, `audit_logs I` |
| WF-HTTP-07 Reset Password | `users U`, `sessions D`, `audit_logs I` |
| WF-HTTP-08 List Working Hours | `teacher_working_hours R`, `teachers R` |
| WF-HTTP-09 Create Working Hour | `teachers R`, `teacher_working_hours R/I`, `users R`, `branches R` when defaulting, `groups R`, `students R`, `schedules R`, `lessons R`, `audit_logs I` |
| WF-HTTP-10 Delete Working Hour | `teacher_working_hours R/D`, `audit_logs I` |

Conditional accesses remain in the manifest:

- Identity inserts on create occur only when portal access is enabled.
- new Identity role/grant inserts on update depend on access state.
- session delete on update occurs when portal access is disabled.
- Working Hour Branch read occurs only when `branchId` is omitted and main/default resolution executes.

## Reviewed Exclusions

The following related tables were explicitly reviewed but are not in the ten-operation SQL closure:

| Table | Reason excluded |
|---|---|
| `group_teacher_assignments` | Related to assignment history, but no Workforce operation SQL reads/writes it |
| `teacher_rate_rules` | Finance-owned Teacher consumer; no access in this closure |
| `teacher_accruals` | Finance-owned Teacher consumer; no access in this closure |
| `platform_audit_logs` | Platform audit is separate; Workforce appends tenant `audit_logs` only |

Exclusion means “not currently accessed,” not “owned by Workforce.”

## Tenant and Integrity Findings

- All in-scope `teachers` and `teacher_working_hours` statements bind `tenant_id`.
- Foreign projection joins explicitly bind tenant IDs on joined rows.
- `sessions` deletes use `user_id` without a tenant predicate. They rely on globally unique User IDs.
- `teachers` and `teacher_working_hours` reference `tenants`; the existing cascade remains Platform authority.
- `teacher_working_hours` references Teacher, but there is no composite `(tenant_id, teacher_id)` FK.
- `branch_id` has no FK and explicit Working Hour `branchId` currently bypasses validation.
- username uniqueness is global in the existing `users` schema.
- shared ID values between Teacher and User do not merge aggregate ownership.

These are exact current facts. They do not approve the same weaknesses for target contracts.

## Blocking Risks

| Risk | Finding | Required treatment |
|---|---|---|
| WF-ACCESS-RISK-01 | Legacy transaction writes Workforce and Identity tables | WF-PRE-11 keeps cross-context variants legacy-held; no target foreign write |
| WF-ACCESS-RISK-02 | Broad `teachers()` projection couples mutations/reads to five foreign contexts | WF-SEAM-06 plus approved WF-PRE-09 Application DTOs and focused WF-PRE-10 reads |
| WF-ACCESS-RISK-03 | Session deletes lack tenant predicate | Identity contract plus WF-PRE-13 two-tenant/fan-out suite specification; passing adapter evidence remains required before activation |
| WF-ACCESS-RISK-04 | Working Hour Branch is unvalidated and has no FK | WF-PRE-09 target contract and WF-PRE-13 exact legacy-characterization/target-remediation assertions approved |
| WF-ACCESS-RISK-05 | Audit writes foreign table after business persistence | WF-PRE-12 approves synchronous required acceptance through the Audit-owned port; post-commit failure is `committed_unacknowledged` and direct foreign SQL remains forbidden |

The risks block extraction where applicable; they do not change the ownership result.

## Temporary Exceptions

**None approved.**

If later implementation evidence proves a provider contract cannot be introduced before an operation slice, a proposed exception must name:

- exact table;
- exact adapter and operation;
- read/write verbs;
- owner;
- expiry/removal condition;
- compensating automated check;
- security/data approval.

No such exception exists in WF-PRE-08.

## Verification

Run:

```bash
npm run architecture:workforce-access
```

The verifier checks:

- manifest hash and six source fingerprints;
- alignment with the global deny-by-default [`architecture/tables.yaml`](../../architecture/tables.yaml);
- 10/10 frozen operation closure;
- 12 direct tables, split into 2 owned and 10 foreign;
- operation/table verb aggregation;
- 2 schema-only dependencies;
- provider contract/seam treatment for every foreign table;
- four reviewed exclusions;
- zero temporary exceptions;
- five blocking risks and all affected owner approvals.

This verifies decision completeness. It does not authorize target code, schema change, public contract implementation, or migration.

## Approval Result

**WF-PRE-08: PASSED**

Every direct and schema-only table dependency is exact, owner-approved, operation-mapped, deny-by-default, and assigned to either a focused Workforce port or a foreign provider contract. No foreign direct target access and no temporary exception are approved.

WF-PRE-09 through WF-PRE-13 subsequently approved public Application contracts, focused ports, the [transaction/consistency model](workforce-transaction-consistency.md), [event/Audit delivery](workforce-event-requirements.md), and the [executable test/parity plan](workforce-test-parity-plan.md). The next ordered prerequisite is WF-PRE-14.
