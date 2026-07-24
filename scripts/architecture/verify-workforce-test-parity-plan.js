#!/usr/bin/env node

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../..");
const MANIFEST_FILE = "architecture/workforce-test-parity-plan.json";
const DECISION_FILE = "docs/architecture/workforce-test-parity-plan.md";
const BEHAVIOR_FILE = "architecture/workforce-behavior-matrix.json";
const APPLICATION_FILE = "architecture/workforce-application-contracts.json";
const PORTS_FILE = "architecture/workforce-focused-ports.json";
const CONSISTENCY_FILE = "architecture/workforce-consistency-model.json";

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath));
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function fail(message) {
  throw new Error(`Workforce test/parity plan verification failed: ${message}`);
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
  const behavior = JSON.parse(read(BEHAVIOR_FILE).toString("utf8"));
  const application = JSON.parse(read(APPLICATION_FILE).toString("utf8"));
  const ports = JSON.parse(read(PORTS_FILE).toString("utf8"));
  const consistency = JSON.parse(read(CONSISTENCY_FILE).toString("utf8"));

  if (
    manifest.schemaVersion !== 1 ||
    manifest.decisionId !== "WF-PRE-13" ||
    manifest.status !== "approved" ||
    manifest.planVersion !== "1.0.0"
  ) {
    fail("identity, status, or version metadata is invalid");
  }

  const manifestHash = sha256(manifestBytes);
  if (!decision.includes(manifestHash)) fail("decision does not contain the current manifest SHA-256");

  const fingerprints = Object.entries(manifest.sourceFingerprints || {});
  if (fingerprints.length !== 10) fail(`expected 10 evidence fingerprints, found ${fingerprints.length}`);
  for (const [sourceFile, expectedHash] of fingerprints) {
    if (sha256(read(sourceFile)) !== expectedHash) fail(`${sourceFile} evidence fingerprint changed`);
  }

  const policy = manifest.testPolicy || {};
  for (const field of [
    "purpose", "contractAuthority", "currentEvidence", "implementationStatus",
    "activationRule", "failureRule", "routeEffect", "parityRule",
    "normalizationRule", "executionEnvironment", "evidenceRule",
  ]) {
    if (!policy[field]) fail(`testPolicy.${field} is missing`);
  }
  if (
    policy.implementationStatus !== "specification_approved_implementation_missing" ||
    !policy.failureRule.startsWith("Failed, skipped, flaky, quarantined, unknown") ||
    !policy.routeEffect.includes("enables zero target routes") ||
    !policy.parityRule.includes("zero tolerance")
  ) {
    fail("implementation, failure, route, or parity policy is weakened");
  }

  const controls = manifest.deterministicControls || {};
  if (
    controls.timezone !== "Asia/Tashkent" ||
    controls.fixedClock !== "2026-07-24T06:00:00.000Z" ||
    !sameArray(controls.tenantIds, ["tenant_wf_a", "tenant_wf_b"]) ||
    !controls.concurrency?.includes("sleeps and timing races are forbidden") ||
    !controls.network?.startsWith("Forbidden")
  ) {
    fail("deterministic execution controls are incomplete");
  }

  const fixtures = manifest.fixtures || [];
  const expectedFixtureIds = Array.from(
    { length: 8 },
    (_, index) => `WF-FIX-${String(index + 1).padStart(2, "0")}`,
  );
  if (!sameArray(fixtures.map((fixture) => fixture.id), expectedFixtureIds)) {
    fail("the exact eight fixtures changed");
  }
  for (const fixture of fixtures) {
    if (!fixture.name || fixture.provides?.length < 3 || !fixture.cleanup) {
      fail(`${fixture.id} fixture is incomplete`);
    }
  }

  const suites = manifest.suiteCatalog || [];
  const expectedSuiteIds = Array.from(
    { length: 10 },
    (_, index) => `WF-TEST-SUITE-${String(index + 1).padStart(2, "0")}`,
  );
  const expectedSuiteTypes = [
    "domain", "application", "repository", "provider_contract", "system_contract",
    "http", "tenant_isolation", "consistency", "parity", "rollback",
  ];
  if (
    !sameArray(suites.map((suite) => suite.id), expectedSuiteIds) ||
    !sameArray(suites.map((suite) => suite.type), expectedSuiteTypes)
  ) {
    fail("the exact ten-suite catalog changed");
  }
  const fixtureIdSet = new Set(expectedFixtureIds);
  for (const suite of suites) {
    if (
      suite.ownerRoles?.length < 2 ||
      suite.fixtureIds?.length < 1 ||
      suite.plannedFiles?.length < 1 ||
      !suite.plannedFiles.every((file) => file.startsWith("tests/workforce/") && file.endsWith(".test.js")) ||
      !suite.plannedCommand?.startsWith("node --test tests/workforce/") ||
      !suite.expected ||
      suite.implementationStatus !== "missing_blocking" ||
      !suite.requiredBefore
    ) {
      fail(`${suite.id} executable suite specification is incomplete`);
    }
    for (const fixtureId of suite.fixtureIds) {
      if (!fixtureIdSet.has(fixtureId)) fail(`${suite.id} references unknown fixture ${fixtureId}`);
    }
  }

  const appCoverage = manifest.applicationContractCoverage || [];
  const expectedContractIds = application.contracts.map((contract) => contract.id);
  if (
    appCoverage.length !== 11 ||
    !sameArray(appCoverage.map((item) => item.contractId), expectedContractIds)
  ) {
    fail("all 11 PRE-09 public contracts must be covered in order");
  }
  for (const item of appCoverage) {
    if (
      item.suiteId !== "WF-TEST-SUITE-02" ||
      item.behaviorTestIds?.length < 5 ||
      item.requiredDimensions?.length < 5
    ) {
      fail(`${item.contractId} Application coverage is incomplete`);
    }
  }
  const behaviorTestIds = behavior.operations.flatMap((operation) =>
    operation.cases
      .filter((item) => item.coverage !== "not_applicable")
      .map((item) => item.testId),
  );
  const plannedBehaviorIds = appCoverage
    .filter((item) => item.contractId !== "WF-REF-01")
    .flatMap((item) => item.behaviorTestIds);
  if (
    behaviorTestIds.length !== 69 ||
    !sameArray(plannedBehaviorIds, behaviorTestIds) ||
    new Set(plannedBehaviorIds).size !== 69
  ) {
    fail("all 69 applicable PRE-06 behavior IDs must be covered exactly once");
  }
  if (!sameArray(appCoverage.at(-1).behaviorTestIds, [
    "WFT-REF-001", "WFT-REF-002", "WFT-REF-003", "WFT-REF-004", "WFT-REF-005",
  ])) {
    fail("the five Teacher-reference test IDs changed");
  }

  const crossCutting = manifest.crossCuttingCoverage || [];
  const expectedCrossCuttingIds = behavior.crossCuttingRequirements.map((item) => item.testId);
  if (
    crossCutting.length !== 3 ||
    !sameArray(crossCutting.map((item) => item.testId), expectedCrossCuttingIds) ||
    crossCutting.some((item) => item.suiteIds?.length < 1 || !item.expected)
  ) {
    fail("the three PRE-06 cross-cutting cases are incomplete");
  }

  const portCoverage = manifest.portContractCoverage || [];
  const expectedPortIds = ports.ports.map((port) => port.id);
  if (
    portCoverage.length !== 18 ||
    !sameArray(portCoverage.map((item) => item.portId), expectedPortIds)
  ) {
    fail("all 18 PRE-10 ports must be covered in order");
  }
  const portById = new Map(ports.ports.map((port) => [port.id, port]));
  const adapterByPort = new Map();
  for (const adapter of ports.adapterPlan) {
    for (const portId of adapter.implements) {
      if (adapterByPort.has(portId)) fail(`${portId} is implemented by multiple PRE-10 adapter groups`);
      adapterByPort.set(portId, adapter.adapterId);
    }
  }
  for (const item of portCoverage) {
    const port = portById.get(item.portId);
    const expectedMethods = port.methods.map((method) => method.name);
    if (
      item.adapterId !== adapterByPort.get(item.portId) ||
      !sameArray(item.methods, expectedMethods) ||
      item.requiredCases?.length < 3 ||
      !expectedSuiteIds.includes(item.suiteId)
    ) {
      fail(`${item.portId} method/adapter/case coverage is invalid`);
    }
  }
  const coveredMethods = portCoverage.flatMap((item) => item.methods);
  if (coveredMethods.length !== 32) fail(`expected 32 port methods, found ${coveredMethods.length}`);
  if (!sameSet(
    [...new Set(portCoverage.map((item) => item.adapterId))],
    ports.adapterPlan.map((adapter) => adapter.adapterId),
  )) {
    fail("all nine PRE-10 adapter groups must be covered");
  }

  const consistencyCoverage = manifest.consistencyCoverage || [];
  const expectedVariantIds = consistency.variantConsistencyMatrix.map((variant) => variant.variantId);
  if (
    consistencyCoverage.length !== 14 ||
    !sameArray(consistencyCoverage.map((item) => item.variantId), expectedVariantIds)
  ) {
    fail("all 14 PRE-11 consistency variants must be covered in order");
  }
  const legacyHoldIds = consistency.variantConsistencyMatrix
    .filter((variant) => variant.routeAdmission.startsWith("legacy_hold"))
    .map((variant) => variant.variantId);
  for (const item of consistencyCoverage) {
    const expectedTreatment = legacyHoldIds.includes(item.variantId)
      ? "legacy_characterization_only"
      : "target_contract";
    if (
      item.suiteId !== "WF-TEST-SUITE-08" ||
      item.targetTreatment !== expectedTreatment ||
      item.testIds?.length < 2
    ) {
      fail(`${item.variantId} consistency treatment is invalid`);
    }
  }

  const parity = manifest.parityPlan || {};
  const expectedDeltaIds = application.intentionalTargetDeltas.map((delta) => delta.id);
  if (
    parity.suiteId !== "WF-TEST-SUITE-09" ||
    parity.comparisonDimensions?.length < 10 ||
    parity.zeroToleranceDimensions?.length < 9 ||
    parity.numericTolerance !== null ||
    !sameArray(parity.allowedDeltaIds, expectedDeltaIds) ||
    !sameArray(parity.contracts?.map((item) => item.contractId), expectedContractIds) ||
    !parity.passRule?.includes("zero unexplained mismatch") ||
    parity.failureArtifact !== "artifacts/architecture/workforce-parity-diff.json"
  ) {
    fail("parity dimensions, thresholds, contracts, or artifact are incomplete");
  }
  const usedDeltaIds = parity.contracts.flatMap((item) => item.allowedDeltaIds);
  if (!sameSet(usedDeltaIds, expectedDeltaIds) || usedDeltaIds.length !== expectedDeltaIds.length) {
    fail("parity must use exactly the two governed target deltas once each");
  }
  for (const item of parity.contracts) {
    if (item.mode === "governed_delta" && item.allowedDeltaIds.length !== 1) {
      fail(`${item.contractId} governed delta mapping is invalid`);
    }
    if (item.mode !== "governed_delta" && item.allowedDeltaIds.length !== 0) {
      fail(`${item.contractId} has an unauthorized parity delta`);
    }
  }

  const rollback = manifest.rollbackAndReconciliationCoverage || [];
  const expectedRollbackIds = Array.from(
    { length: 7 },
    (_, index) => `WF-ROLL-${String(index + 1).padStart(2, "0")}`,
  );
  if (
    !sameArray(rollback.map((item) => item.id), expectedRollbackIds) ||
    rollback.some((item) => !item.scenario || !item.expected)
  ) {
    fail("the exact seven rollback/reconciliation scenarios are incomplete");
  }
  if (
    !rollback[2].expected.includes("committed_unacknowledged") ||
    !rollback[4].expected.includes("no fallback mutation or blind replay") ||
    !rollback[6].expected.includes("denies target invocation")
  ) {
    fail("post-commit, unknown, or legacy-hold rollback safety is weakened");
  }

  const artifact = manifest.artifactContract || {};
  if (
    artifact.requiredFiles?.length !== 5 ||
    artifact.requiredMetadata?.length !== 11 ||
    !artifact.directory?.startsWith("artifacts/architecture/workforce/") ||
    !artifact.redaction?.startsWith("No password")
  ) {
    fail("machine-readable evidence artifact contract is incomplete");
  }

  const admission = manifest.releaseAdmission || {};
  if (
    admission.plannedSuiteCount !== 10 ||
    admission.plannedSuiteCommandsImplemented !== 0 ||
    admission.plannedSuiteCommandsPassing !== 0 ||
    admission.behaviorIdsSpecified !== 69 ||
    admission.referenceTestIdsSpecified !== 5 ||
    admission.publicContractsSpecified !== 11 ||
    admission.portsSpecified !== 18 ||
    admission.portMethodsSpecified !== 32 ||
    admission.consistencyVariantsSpecified !== 14 ||
    admission.governedDeltasSpecified !== 2 ||
    admission.targetRoutesEnabled !== 0 ||
    !admission.moduleReadinessEffect?.includes("Module Readiness remains Failed")
  ) {
    fail("release-admission accounting or route status is invalid");
  }

  const risks = manifest.risks || [];
  if (
    risks.length !== 5 ||
    !sameArray(risks.map((risk) => risk.id), [
      "WF-TEST-RISK-01", "WF-TEST-RISK-02", "WF-TEST-RISK-03",
      "WF-TEST-RISK-04", "WF-TEST-RISK-05",
    ]) ||
    risks.some((risk) => !["high", "critical"].includes(risk.severity) || !risk.issue || !risk.treatment)
  ) {
    fail("five exact test risks/treatments are required");
  }

  if (
    manifest.guards?.length !== 7 ||
    !sameArray(manifest.guards.map((guard) => guard.id), [
      "WF-TEST-GUARD-01", "WF-TEST-GUARD-02", "WF-TEST-GUARD-03",
      "WF-TEST-GUARD-04", "WF-TEST-GUARD-05", "WF-TEST-GUARD-06",
      "WF-TEST-GUARD-07",
    ]) ||
    !Array.isArray(manifest.temporaryTestExceptions) ||
    manifest.temporaryTestExceptions.length !== 0
  ) {
    fail("seven test guards and zero test exceptions are required");
  }

  const deferred = manifest.deferredDecisions || {};
  for (const id of ["WF-PRE-14", "WF-PRE-16", "WF-EXT-02+"]) {
    if (!deferred[id]) fail(`deferred decision ${id} is missing`);
  }

  const requiredApprovalRoles = [
    "Architecture Owner", "Workforce Module Owner", "Product Authority",
    "Identity & Access Owner", "Organization & Branches Owner", "Academic Groups Owner",
    "Scheduling Owner", "Lesson Delivery Owner", "Student Information Owner",
    "Audit & History Owner", "Data Owner", "Operations Owner", "Security Owner", "Quality Owner",
  ];
  const approvals = manifest.approvals || [];
  if (
    approvals.length !== requiredApprovalRoles.length ||
    !sameArray(approvals.map((approval) => approval.role), requiredApprovalRoles) ||
    approvals.some(
      (approval) =>
        approval.owner !== "Sukhrob Khaydarov" ||
        approval.decision !== "approved" ||
        approval.date !== "2026-07-24",
    )
  ) {
    fail("required test-plan approvals are incomplete");
  }

  for (const text of [
    "WF-PRE-13: PASSED",
    "10 executable suite specifications",
    "69/69",
    "11/11 public contracts",
    "18/18 focused ports",
    "14/14 consistency variants",
    "two governed target deltas",
    "zero target routes",
    "implementation missing",
    "WF-PRE-14",
  ]) {
    if (!decision.includes(text)) fail(`decision is missing required statement: ${text}`);
  }

  console.log(
    `Workforce test/parity plan verified: ${suites.length}/10 suites, ${fixtures.length}/8 fixtures, ` +
    `${plannedBehaviorIds.length}/69 behavior IDs, ${appCoverage.length}/11 contracts, ` +
    `${portCoverage.length}/18 ports, ${coveredMethods.length}/32 methods, ` +
    `${consistencyCoverage.length}/14 variants, ${parity.contracts.length}/11 parity rows, ` +
    `${rollback.length}/7 rollback cases, 0 implemented planned suites, 0 target routes, ` +
    `${manifest.temporaryTestExceptions.length} exceptions.`,
  );
}

main();
