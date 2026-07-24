#!/usr/bin/env node

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../..");
const MANIFEST_FILE = "architecture/workforce-module-readiness-decision.json";
const DECISION_FILE = "docs/architecture/workforce-module-readiness-decision.md";
const EXIT_FILE = "docs/architecture/phase-1b-exit-criteria.md";
const RUNBOOK_FILE = "architecture/workforce-migration-runbook.json";
const TEST_PLAN_FILE = "architecture/workforce-test-parity-plan.json";
const MODULES_FILE = "architecture/modules.yaml";
const TABLES_FILE = "architecture/tables.yaml";
const BASELINE_FILE = "architecture/baseline.json";
const EXCEPTIONS_FILE = "architecture/exceptions.yaml";
const PACKAGE_FILE = "package.json";
const ENFORCE_RUNNER_FILE = "scripts/architecture/run-enforce.js";
const PR_TEMPLATE_FILE = ".github/pull_request_template.md";

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath));
}

function json(relativePath) {
  return JSON.parse(read(relativePath).toString("utf8"));
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function fail(message) {
  throw new Error(`Workforce module readiness verification failed: ${message}`);
}

function sameArray(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function main() {
  const manifestBytes = read(MANIFEST_FILE);
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  const decision = read(DECISION_FILE).toString("utf8");
  const exitCriteria = read(EXIT_FILE).toString("utf8");
  const runbook = json(RUNBOOK_FILE);
  const testPlan = json(TEST_PLAN_FILE);
  const modules = json(MODULES_FILE);
  const tables = json(TABLES_FILE);
  const baseline = json(BASELINE_FILE);
  const exceptions = json(EXCEPTIONS_FILE);
  const packageJson = json(PACKAGE_FILE);
  const enforceRunner = read(ENFORCE_RUNNER_FILE).toString("utf8");
  const prTemplate = read(PR_TEMPLATE_FILE).toString("utf8");

  if (
    manifest.schemaVersion !== 1 ||
    manifest.decisionId !== "WF-PRE-16" ||
    manifest.status !== "approved" ||
    manifest.decision !== "passed" ||
    manifest.authorizationScope !== "ordered_extraction_implementation_only"
  ) {
    fail("identity, decision, or authorization scope is invalid");
  }

  const manifestHash = sha256(manifestBytes);
  if (!decision.includes(manifestHash)) fail("decision does not contain the current manifest SHA-256");

  const fingerprints = Object.entries(manifest.sourceFingerprints || {});
  if (fingerprints.length !== 10) fail(`expected 10 predecessor fingerprints, found ${fingerprints.length}`);
  for (const [file, expectedHash] of fingerprints) {
    if (sha256(read(file)) !== expectedHash) fail(`${file} evidence fingerprint changed`);
  }

  const accounting = manifest.criteriaAccounting || {};
  if (
    accounting.total !== 55 ||
    accounting.passed !== 54 ||
    accounting.approvedNotApplicableAtEntry !== 1 ||
    accounting.failed !== 0 ||
    accounting.unchecked !== 0 ||
    Object.keys(accounting.sections || {}).length !== 10
  ) {
    fail("55-item exit accounting is incomplete or falsely passing");
  }
  const totals = Object.values(accounting.sections).reduce(
    (sum, section) => ({
      total: sum.total + section.total,
      passed: sum.passed + section.passed,
      notApplicable: sum.notApplicable + section.notApplicable,
    }),
    { total: 0, passed: 0, notApplicable: 0 },
  );
  if (totals.total !== 55 || totals.passed !== 54 || totals.notApplicable !== 1) {
    fail("section accounting does not reconcile to the gate result");
  }

  const checklistRows = exitCriteria.match(/^- \[[ x]\] /gm) || [];
  const uncheckedRows = exitCriteria.match(/^- \[ \] /gm) || [];
  if (checklistRows.length !== 55 || uncheckedRows.length !== 0) {
    fail(`exit checklist must have 55 disposed and zero unchecked criteria; found ${checklistRows.length}/${uncheckedRows.length}`);
  }

  const notApplicable = manifest.approvedNotApplicable || [];
  if (
    notApplicable.length !== 1 ||
    notApplicable[0].criterionId !== "WF-EXIT-MR-05" ||
    notApplicable[0].approvers?.length !== 6 ||
    !notApplicable[0].activationTreatment?.includes("Mandatory fail-closed")
  ) {
    fail("the exact production-like rehearsal N/A and activation treatment are missing");
  }

  if (
    baseline.status !== "approved" ||
    baseline.commit !== "3bc3097e2903b4cc917807f9b799ca7628f54617" ||
    baseline.fingerprints?.length !== 68 ||
    exceptions.exceptions?.length !== 0
  ) {
    fail("Legacy Freeze baseline or empty exception register changed");
  }
  const workforceModule = modules.contexts?.workforce;
  const workforceOwnedTables = Object.entries(tables.tables || {})
    .filter(([, definition]) => definition.owner === "workforce")
    .map(([table]) => table)
    .sort();
  const legacyState = workforceModule?.status === "legacy" && sameArray(workforceModule.sourceRoots || [], []);
  const migratingState =
    workforceModule?.status === "migrating" &&
    sameArray(workforceModule.sourceRoots || [], ["src/modules/workforce"]) &&
    sameArray(workforceModule.publicPaths || [], ["src/modules/workforce/application"]) &&
    fs.existsSync(path.join(ROOT, "src/modules/workforce"));
  if (
    workforceModule?.owner !== "architecture-owner" ||
    (!legacyState && !migratingState) ||
    !sameArray(workforceOwnedTables, ["teacher_working_hours", "teachers"])
  ) {
    fail("Workforce module lifecycle or exact two-table ownership state is invalid");
  }

  const current = manifest.currentRuntimeState || {};
  const admission = runbook.currentAdmission || {};
  const release = testPlan.releaseAdmission || {};
  if (
    current.plannedTargetSuitesImplemented !== 0 ||
    current.plannedTargetSuitesPassing !== 0 ||
    current.operatorCommandsImplemented !== 0 ||
    current.rollbackRehearsalsExecuted !== 0 ||
    current.productionCohortTenantIds?.length !== 0 ||
    current.shadowRoutesEnabled !== 0 ||
    current.targetRoutesEnabled !== 0 ||
    current.authorityTransfersExecuted !== 0 ||
    release.plannedSuiteCommandsImplemented !== 0 ||
    release.plannedSuiteCommandsPassing !== 0 ||
    admission.operatorCommandsImplemented !== 0 ||
    admission.rollbackRehearsalsExecuted !== 0 ||
    admission.productionCohortTenantIds?.length !== 0 ||
    admission.targetRoutesEnabled !== 0 ||
    admission.authorityTransfersExecuted !== 0
  ) {
    fail("runtime admission falsely claims target implementation or activation");
  }
  if (!sameArray(current.legacyHoldVariants, ["WF-CONS-03B", "WF-CONS-04B", "WF-CONS-05A", "WF-CONS-05B"])) {
    fail("four legacy-hold variants are not preserved");
  }

  const authorization = manifest.authorization || {};
  const expectedBacklog = Array.from({ length: 12 }, (_, index) => `WF-EXT-${String(index + 1).padStart(2, "0")}`);
  if (
    authorization.orderedExtractionImplementationMayBegin !== true ||
    authorization.firstAuthorizedItem !== "WF-EXT-01" ||
    !sameArray(authorization.authorizedBacklog, expectedBacklog) ||
    authorization.sourceCreationAllowed !== true ||
    authorization.targetTestAndAdapterImplementationAllowed !== true ||
    authorization.schemaChangeAllowed !== false ||
    authorization.productionCohortBindingAllowedByThisGate !== false ||
    authorization.shadowRouteActivationAllowedByThisGate !== false ||
    authorization.targetRouteActivationAllowedByThisGate !== false ||
    authorization.authorityTransferAllowedByThisGate !== false ||
    authorization.legacyRemovalAllowedByThisGate !== false
  ) {
    fail("implementation authorization or runtime denial boundary changed");
  }

  const blockers = manifest.activationBlockers || [];
  if (
    !sameArray(blockers.map((item) => item.id), ["WF-ACT-01", "WF-ACT-02", "WF-ACT-03", "WF-ACT-04"]) ||
    blockers.some((item) => !item.condition || !item.current || item.blocks?.length < 3) ||
    manifest.invariants?.length !== 6 ||
    manifest.temporaryExceptions?.length !== 0
  ) {
    fail("activation blockers, invariants, or exception state is incomplete");
  }

  const expectedRoles = [
    "Architecture Owner", "Workforce Module Owner", "Product Authority",
    "Identity & Access Owner", "Organization & Branches Owner", "Audit & History Owner",
    "Data Owner", "Operations Owner", "Security Owner", "Quality Owner",
  ];
  const approvals = manifest.approvals || [];
  if (
    !sameArray(approvals.map((item) => item.role), expectedRoles) ||
    approvals.some((item) =>
      item.owner !== "Sukhrob Khaydarov" ||
      item.decision !== "passed" ||
      item.date !== "2026-07-24")
  ) {
    fail("required final approvals are incomplete");
  }

  if (
    packageJson.scripts?.["architecture:workforce-readiness"] !== "node scripts/architecture/verify-workforce-module-readiness.js" ||
    !packageJson.scripts?.["architecture:workforce"]?.includes("architecture:workforce-readiness") ||
    !enforceRunner.includes("verify-workforce-module-readiness.js") ||
    !enforceRunner.includes("verify-workforce-table-access.js") ||
    !enforceRunner.includes("verify-workforce-contract-freeze.js") ||
    !prTemplate.includes("docs/architecture/architecture-checklist.md") ||
    !prTemplate.includes("WF gate / increment")
  ) {
    fail("required npm, CI, or pull-request checklist enforcement is missing");
  }

  for (const text of [
    "WF-PRE-16: PASSED",
    "ordered extraction backlog",
    "55 criteria",
    "54",
    "0/10 implemented",
    "0/8 implemented",
    "zero shadow routes",
    "zero target routes",
    "WF-EXT-01",
    "not permission to enable a shadow route",
  ]) {
    if (!decision.includes(text)) fail(`decision is missing required statement: ${text}`);
  }

  console.log(
    "Workforce Module Readiness PASS: 55/55 criteria disposed (54 PASS, 1 approved entry N/A), " +
    "10/10 predecessor fingerprints, 10/10 approvals, 4/4 activation blockers, " +
    "ordered extraction implementation authorized at WF-EXT-01; 0 suites, 0 commands, " +
    "0 rehearsals, 0 production tenants, 0 shadow/target routes, 0 authority transfers.",
  );
}

main();
