#!/usr/bin/env node

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../..");
const MANIFEST_FILE = "architecture/workforce-migration-runbook.json";
const DECISION_FILE = "docs/architecture/workforce-migration-runbook.md";
const APPLICATION_FILE = "architecture/workforce-application-contracts.json";
const CONSISTENCY_FILE = "architecture/workforce-consistency-model.json";
const TEST_PLAN_FILE = "architecture/workforce-test-parity-plan.json";

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath));
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function fail(message) {
  throw new Error(`Workforce migration runbook verification failed: ${message}`);
}

function sameArray(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sameSet(left, right) {
  return left.length === right.length && left.every((value) => right.includes(value));
}

function main() {
  const manifestBytes = read(MANIFEST_FILE);
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  const decision = read(DECISION_FILE).toString("utf8");
  const application = JSON.parse(read(APPLICATION_FILE).toString("utf8"));
  const consistency = JSON.parse(read(CONSISTENCY_FILE).toString("utf8"));
  const testPlan = JSON.parse(read(TEST_PLAN_FILE).toString("utf8"));

  if (
    manifest.schemaVersion !== 1 ||
    manifest.decisionId !== "WF-PRE-14" ||
    manifest.status !== "approved" ||
    manifest.runbookVersion !== "1.0.0"
  ) {
    fail("identity, status, or version metadata is invalid");
  }
  const manifestHash = sha256(manifestBytes);
  if (!decision.includes(manifestHash)) fail("decision does not contain the current manifest SHA-256");

  const fingerprints = Object.entries(manifest.sourceFingerprints || {});
  if (fingerprints.length !== 8) fail(`expected 8 evidence fingerprints, found ${fingerprints.length}`);
  for (const [sourceFile, expectedHash] of fingerprints) {
    if (sha256(read(sourceFile)) !== expectedHash) fail(`${sourceFile} evidence fingerprint changed`);
  }

  const policy = manifest.migrationPolicy || {};
  for (const field of [
    "defaultRoute", "selectorKey", "authority", "readShadow", "commandCanary",
    "fallback", "storeAuthority", "legacyAvailability", "cohort", "routeEffect",
  ]) {
    if (!policy[field]) fail(`migrationPolicy.${field} is missing`);
  }
  if (
    policy.defaultRoute !== "legacy" ||
    !policy.authority.includes("Synchronous dual write") ||
    !policy.fallback.includes("cannot fall back to legacy") ||
    !policy.cohort.includes("explicitly empty") ||
    !policy.routeEffect.includes("No registry, script, route")
  ) {
    fail("default, authority, fallback, cohort, or no-activation policy is weakened");
  }

  const registry = manifest.routeRegistryContract || {};
  if (
    !sameArray(registry.modes, ["legacy", "shadow", "target", "quarantined"]) ||
    registry.requiredFields?.length !== 11 ||
    !registry.writeRule?.startsWith("Compare-and-set") ||
    !registry.readFailure?.startsWith("Select legacy") ||
    registry.currentProductionEntries?.length !== 0 ||
    registry.currentTargetRoutesEnabled !== 0
  ) {
    fail("route registry contract is incomplete or target-enabled");
  }

  const cohorts = manifest.cohorts || [];
  const expectedCohortIds = Array.from(
    { length: 6 },
    (_, index) => `WF-COHORT-${String(index).padStart(2, "0")}`,
  );
  if (
    !sameArray(cohorts.map((item) => item.id), expectedCohortIds) ||
    cohorts[0].production !== false ||
    cohorts.slice(1).some((item) => item.production !== true || !item.sizeRule || !item.promotion) ||
    !cohorts[1].sizeRule.startsWith("Exactly one explicitly approved tenant ID")
  ) {
    fail("the exact six zero-default cohort stages are incomplete");
  }

  const variants = consistency.variantConsistencyMatrix;
  const eligibleVariants = variants
    .filter((variant) =>
      variant.routeAdmission === "target_read_admissible_now" ||
      variant.routeAdmission === "target_write_blocked_audit_delivery")
    .map((variant) => variant.variantId);
  const legacyHolds = variants
    .filter((variant) => variant.routeAdmission.startsWith("legacy_hold"))
    .map((variant) => variant.variantId);
  const increments = manifest.routeIncrements || [];
  const expectedIncrementIds = Array.from(
    { length: 10 },
    (_, index) => `WF-ROUTE-${String(index + 1).padStart(2, "0")}`,
  );
  if (
    increments.length !== 10 ||
    !sameArray(increments.map((item) => item.id), expectedIncrementIds) ||
    !sameArray(increments.map((item) => item.order), Array.from({ length: 10 }, (_, index) => index + 1)) ||
    !sameSet(increments.flatMap((item) => item.variantIds), eligibleVariants)
  ) {
    fail("the exact ten ordered eligible route increments changed");
  }
  const applicationIds = new Set(application.contracts.map((contract) => contract.id));
  const suiteIds = new Set(testPlan.suiteCatalog.map((suite) => suite.id));
  const variantById = new Map(variants.map((variant) => [variant.variantId, variant]));
  for (const increment of increments) {
    if (
      !applicationIds.has(increment.contractId) ||
      increment.actorClasses?.length < 1 ||
      !["query", "command"].includes(increment.kind) ||
      increment.requiredSuiteIds?.length < 6 ||
      !increment.authority ||
      !increment.rollback
    ) {
      fail(`${increment.id} route specification is incomplete`);
    }
    for (const suiteId of increment.requiredSuiteIds) {
      if (!suiteIds.has(suiteId)) fail(`${increment.id} references unknown suite ${suiteId}`);
    }
    for (const variantId of increment.variantIds) {
      const variant = variantById.get(variantId);
      if (!variant || variant.contractId !== increment.contractId || variant.kind !== increment.kind) {
        fail(`${increment.id} contract/kind differs from ${variantId}`);
      }
      if (legacyHolds.includes(variantId)) fail(`${increment.id} attempts to route legacy hold ${variantId}`);
    }
    if (
      increment.kind === "query" && !sameArray(increment.stages, ["shadow", "target"]) ||
      increment.kind === "command" && !sameArray(increment.stages, ["target"])
    ) {
      fail(`${increment.id} query/command stage policy is invalid`);
    }
  }

  const holds = manifest.permanentLegacyHolds || [];
  if (
    holds.length !== 4 ||
    !sameArray(holds.map((item) => item.variantId), legacyHolds) ||
    holds.some((item) => !item.reason)
  ) {
    fail("the four PRE-11 legacy holds are not exactly preserved");
  }

  const stageGates = manifest.stageGates || [];
  if (
    !sameArray(stageGates.map((item) => item.stage), [
      "preflight", "shadow", "cohort_01", "cohort_02_to_04", "cohort_05",
    ]) ||
    !sameArray(stageGates.map((item) => item.minimumWindowHours), [0, 24, 72, 48, 168]) ||
    !sameArray(stageGates.map((item) => item.minimumSamplesPerIncrement), [0, 200, 20, 100, 500]) ||
    stageGates.some((item) => item.requirements?.length < 3)
  ) {
    fail("stage windows, samples, or requirements are incomplete");
  }

  const thresholds = manifest.thresholds || {};
  const critical = thresholds.criticalStop || {};
  const expectedCriticalFields = [
    "semanticMismatchCount", "tenantLeakCount", "authorizationOrPrivacyMismatchCount",
    "missingOrDuplicateAuditCount", "unknownOrCommittedUnacknowledgedCount",
    "legacyHoldTargetInvocationCount", "unexplainedDataChecksumMismatchCount",
    "synchronousDualWriteCount",
  ];
  if (
    !sameArray(Object.keys(critical), expectedCriticalFields) ||
    Object.values(critical).some((value) => value !== 0) ||
    thresholds.errorRate?.minimumSample !== 100 ||
    thresholds.errorRate?.maximumTargetTechnicalErrorPercent !== 1 ||
    thresholds.errorRate?.maximumIncreaseOverLegacyPercentagePoints !== 0.5 ||
    thresholds.errorRate?.burstStopCount !== 3 ||
    thresholds.errorRate?.burstWindowMinutes !== 5 ||
    thresholds.latency?.maximumP95RatioToLegacy !== 1.25 ||
    thresholds.latency?.maximumAbsoluteP95Milliseconds !== 500 ||
    thresholds.rollback?.selectorDisableRtoMinutes !== 5 ||
    thresholds.rollback?.acceptedWriteRpo !== 0 ||
    !thresholds.promotion?.includes("Insufficient samples never count as success")
  ) {
    fail("objective stop/performance/rollback thresholds are weakened");
  }

  const commands = manifest.operatorCommands || [];
  const expectedCommandIds = Array.from(
    { length: 8 },
    (_, index) => `WF-OPS-${String(index + 1).padStart(2, "0")}`,
  );
  if (
    !sameArray(commands.map((item) => item.id), expectedCommandIds) ||
    commands.some(
      (item) => !item.command?.startsWith("node scripts/workforce-") || !item.purpose || item.implemented !== false,
    )
  ) {
    fail("the exact eight planned operator commands or missing status changed");
  }

  const rollback = manifest.rollbackProcedure || [];
  if (
    rollback.length !== 8 ||
    !rollback[1].includes("within five minutes") ||
    !rollback[4].includes("do not fall back within the original request and do not replay") ||
    !rollback[5].includes("Append a missing Audit intent only when") ||
    !rollback[7].includes("14-day rollback window")
  ) {
    fail("rollback procedure is incomplete or unsafe");
  }

  const reconciliation = manifest.reconciliationPolicy || {};
  if (
    reconciliation.owners?.length !== 5 ||
    !sameArray(reconciliation.triggerStates, [
      "committed_unacknowledged", "unknown", "data_checksum_mismatch", "audit_mismatch",
    ]) ||
    reconciliation.allowed?.length !== 4 ||
    reconciliation.forbidden?.length !== 6 ||
    !reconciliation.forbidden.includes("Direct foreign SQL") ||
    !reconciliation.forbidden.includes("Blind replay")
  ) {
    fail("reconciliation ownership/actions are incomplete");
  }

  const observation = manifest.observationAndRetirement || {};
  if (
    observation.rollbackWindowDaysAfterFinalEligibleCutover !== 14 ||
    observation.minimumFullEligibleObservationHours !== 168 ||
    observation.legacyRemovalMinimumZeroUseDays !== 30 ||
    observation.legacyRemovalRequirements?.length !== 6 ||
    !observation.retirementProhibition?.includes("does not retire")
  ) {
    fail("observation/retirement gates are incomplete");
  }

  const evidence = manifest.evidenceContract || {};
  if (
    evidence.requiredFiles?.length !== 8 ||
    evidence.requiredMetadata?.length !== 13 ||
    !evidence.directory?.startsWith("artifacts/architecture/workforce/migration/") ||
    !evidence.redaction?.startsWith("No password")
  ) {
    fail("migration evidence contract is incomplete");
  }

  const admission = manifest.currentAdmission || {};
  if (
    admission.runbookSpecificationApproved !== true ||
    admission.operatorCommandsImplemented !== 0 ||
    admission.rollbackRehearsalsExecuted !== 0 ||
    admission.productionCohortTenantIds?.length !== 0 ||
    admission.targetRoutesEnabled !== 0 ||
    admission.authorityTransfersExecuted !== 0 ||
    !admission.moduleReadinessEffect?.includes("Module Readiness remains Failed")
  ) {
    fail("current admission status falsely claims implementation or activation");
  }

  const risks = manifest.risks || [];
  if (
    risks.length !== 6 ||
    !sameArray(risks.map((item) => item.id), [
      "WF-RUN-RISK-01", "WF-RUN-RISK-02", "WF-RUN-RISK-03",
      "WF-RUN-RISK-04", "WF-RUN-RISK-05", "WF-RUN-RISK-06",
    ]) ||
    risks.some((item) => !["high", "critical"].includes(item.severity) || !item.issue || !item.treatment)
  ) {
    fail("six exact migration risks/treatments are required");
  }
  if (
    manifest.guards?.length !== 7 ||
    !sameArray(manifest.guards.map((item) => item.id), [
      "WF-RUN-GUARD-01", "WF-RUN-GUARD-02", "WF-RUN-GUARD-03",
      "WF-RUN-GUARD-04", "WF-RUN-GUARD-05", "WF-RUN-GUARD-06",
      "WF-RUN-GUARD-07",
    ]) ||
    manifest.temporaryRunbookExceptions?.length !== 0
  ) {
    fail("seven runbook guards and zero exceptions are required");
  }

  const requiredApprovalRoles = [
    "Architecture Owner", "Workforce Module Owner", "Product Authority",
    "Identity & Access Owner", "Audit & History Owner", "Data Owner",
    "Operations Owner", "Security Owner", "Quality Owner",
  ];
  const approvals = manifest.approvals || [];
  if (
    !sameArray(approvals.map((item) => item.role), requiredApprovalRoles) ||
    approvals.some((item) =>
      item.owner !== "Sukhrob Khaydarov" ||
      item.decision !== "approved" ||
      item.date !== "2026-07-24")
  ) {
    fail("required operational approvals are incomplete");
  }

  for (const text of [
    "WF-PRE-14: PASSED",
    "10/10 route increments",
    "four legacy-hold variants",
    "production cohort is empty",
    "five-minute rollback RTO",
    "RPO is zero",
    "zero operator commands implemented",
    "zero target routes",
    "14-day rollback window",
    "30 consecutive zero-use days",
    "WF-PRE-16",
  ]) {
    if (!decision.includes(text)) fail(`decision is missing required statement: ${text}`);
  }

  console.log(
    `Workforce migration runbook verified: ${increments.length}/10 increments, ${holds.length}/4 legacy holds, ` +
    `${cohorts.length}/6 cohorts, ${stageGates.length}/5 stage gates, ${commands.length}/8 operator commands, ` +
    `${rollback.length}/8 rollback steps, ${risks.length}/6 risks, ${manifest.guards.length}/7 guards, ` +
    "0 implemented commands, 0 rehearsals, 0 production tenants, 0 target routes, 0 exceptions.",
  );
}

main();
