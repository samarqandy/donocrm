#!/usr/bin/env node

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../..");
const STATE_FILE = "architecture/workforce-extraction-entry-baseline.json";
const DECISION_FILE = "docs/architecture/workforce-extraction-entry.md";
const READINESS_FILE = "architecture/workforce-module-readiness-decision.json";
const MODULES_FILE = "architecture/modules.yaml";
const TABLES_FILE = "architecture/tables.yaml";
const BASELINE_FILE = "architecture/baseline.json";
const EXCEPTIONS_FILE = "architecture/exceptions.yaml";
const RUNBOOK_FILE = "architecture/workforce-migration-runbook.json";
const TEST_PLAN_FILE = "architecture/workforce-test-parity-plan.json";
const REGISTRATION_FILE = "src/bootstrap/workforceRegistration.js";
const CONTAINER_FILE = "src/bootstrap/stranglerContainer.js";
const MODULE_ROOT = "src/modules/workforce";
const PACKAGE_FILE = "package.json";
const ENFORCE_RUNNER_FILE = "scripts/architecture/run-enforce.js";

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
  throw new Error(`Workforce extraction structure verification failed: ${message}`);
}

function sameArray(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function filesUnder(relativeRoot) {
  const result = [];
  function visit(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) visit(fullPath);
      else result.push(path.relative(ROOT, fullPath).split(path.sep).join("/"));
    }
  }
  visit(path.join(ROOT, relativeRoot));
  return result.sort();
}

function main() {
  const stateBytes = read(STATE_FILE);
  const state = JSON.parse(stateBytes.toString("utf8"));
  const decision = read(DECISION_FILE).toString("utf8");
  const readiness = json(READINESS_FILE);
  const modules = json(MODULES_FILE);
  const tables = json(TABLES_FILE);
  const baseline = json(BASELINE_FILE);
  const exceptions = json(EXCEPTIONS_FILE);
  const runbook = json(RUNBOOK_FILE);
  const testPlan = json(TEST_PLAN_FILE);
  const packageJson = json(PACKAGE_FILE);
  const registrationSource = read(REGISTRATION_FILE).toString("utf8");
  const containerSource = read(CONTAINER_FILE).toString("utf8");
  const moduleReadme = read(`${MODULE_ROOT}/README.md`).toString("utf8");
  const enforceRunner = read(ENFORCE_RUNNER_FILE).toString("utf8");

  if (
    state.schemaVersion !== 1 ||
    state.status !== "active" ||
    state.currentIncrement !== "WF-EXT-01" ||
    !sameArray(state.completedIncrements, ["WF-EXT-01"]) ||
    state.nextOrderedIncrement !== "WF-EXT-02"
  ) {
    fail("state identity, completion, or next-increment ordering is invalid");
  }

  const stateHash = sha256(stateBytes);
  if (!decision.includes(stateHash)) fail("decision does not contain the current state SHA-256");
  if (
    state.authorizationEvidence?.decisionId !== "WF-PRE-16" ||
    state.authorizationEvidence?.manifestSha256 !== sha256(read(READINESS_FILE)) ||
    readiness.decision !== "passed" ||
    readiness.authorization?.firstAuthorizedItem !== "WF-EXT-01"
  ) {
    fail("WF-PRE-16 authorization evidence is absent or changed");
  }

  const moduleState = state.moduleState || {};
  const configured = modules.contexts?.workforce;
  if (
    moduleState.contextId !== "workforce" ||
    moduleState.owner !== "architecture-owner" ||
    moduleState.lifecycle !== "migrating" ||
    moduleState.sourceRoot !== MODULE_ROOT ||
    !sameArray(moduleState.trackedModuleFiles, [`${MODULE_ROOT}/README.md`]) ||
    moduleState.implementedLayers?.length !== 0 ||
    moduleState.publicApplicationImplemented !== false ||
    moduleState.publicPaths?.length !== 0 ||
    moduleState.domainImplemented !== false ||
    moduleState.infrastructureAdaptersImplemented !== 0 ||
    moduleState.httpAdaptersImplemented !== 0 ||
    configured?.owner !== "architecture-owner" ||
    configured.status !== "migrating" ||
    !sameArray(configured.sourceRoots || [], [MODULE_ROOT]) ||
    !sameArray(configured.publicPaths || [], ["src/modules/workforce/application"]) ||
    !filesUnder(MODULE_ROOT).includes(`${MODULE_ROOT}/README.md`)
  ) {
    fail("the approved WF-EXT-01 source root evidence or current public path is invalid");
  }
  for (const text of [
    "WF-EXT-01", "Runtime authority remains the frozen legacy path", "AppService", "AppRepository",
  ]) {
    if (!moduleReadme.includes(text)) fail(`module boundary marker is missing: ${text}`);
  }

  const expectedRegistration = state.compositionRegistration || {};
  const { workforceRegistration } = require(path.join(ROOT, REGISTRATION_FILE));
  const { moduleRegistrations } = require(path.join(ROOT, CONTAINER_FILE));
  const registration = workforceRegistration();
  const registered = moduleRegistrations();
  const expectedRuntimeRegistration = {
    moduleId: expectedRegistration.moduleId,
    incrementId: expectedRegistration.incrementId,
    lifecycle: expectedRegistration.lifecycle,
    sourceRoot: expectedRegistration.sourceRoot,
    publicApplication: expectedRegistration.publicApplication,
    adapterBindings: expectedRegistration.adapterBindings,
    routeBindings: expectedRegistration.routeBindings,
    defaultAuthority: expectedRegistration.defaultAuthority,
    activation: expectedRegistration.activation,
  };
  if (
    JSON.stringify(registration) !== JSON.stringify(expectedRuntimeRegistration) ||
    registered.workforce !== registration ||
    Object.keys(registered).length !== 1 ||
    !Object.isFrozen(registration) ||
    !Object.isFrozen(registration.adapterBindings) ||
    !Object.isFrozen(registration.routeBindings) ||
    !Object.isFrozen(registered)
  ) {
    fail("immutable Bootstrap composition registration differs from the manifest");
  }
  if (
    registrationSource.includes("require(") ||
    registrationSource.includes("process.env") ||
    registrationSource.includes("register(") ||
    !containerSource.includes('require("./workforceRegistration")') ||
    !containerSource.includes("workforce: workforceRegistration()") ||
    !containerSource.includes("function moduleRegistrations()") ||
    containerSource.includes("registerWorkforceRoutes")
  ) {
    fail("composition registration has a dependency, side effect, or route binding");
  }

  const transition = state.baselineTransition || {};
  if (
    baseline.status !== "approved" ||
    transition.previousConfigurationHash !== "2732cc47b0b0913cf35aa4c176750c9cd4abafe16657d19fc2e00c9ef7b7f15d" ||
    transition.currentConfigurationHash !== "7e17f5d2633a11940c2c9ac625e8818afcd6b5ebac41fcb33e637feab0e734ba" ||
    baseline.fingerprints?.length !== 68 ||
    transition.approvedFingerprintCount !== 68 ||
    transition.newFingerprintCount !== 0 ||
    transition.activeExceptionCount !== 0 ||
    transition.legacyMetricChanges !== 0 ||
    !baseline.configurationRevisions?.some((revision) =>
      revision.decision === "WF-EXT-01" &&
      revision.hash === transition.currentConfigurationHash) ||
    exceptions.exceptions?.length !== 0
  ) {
    fail("approved architecture baseline transition is incomplete or expanded");
  }
  const workforceOwnedTables = Object.entries(tables.tables || {})
    .filter(([, definition]) => definition.owner === "workforce")
    .map(([table]) => table)
    .sort();
  if (!sameArray(workforceOwnedTables, ["teacher_working_hours", "teachers"])) {
    fail("Workforce table ownership expanded beyond the approved two tables");
  }

  const runtime = state.runtimeState || {};
  if (
    runtime.legacyAuthority !== true ||
    runtime.plannedTargetSuitesImplemented !== 0 ||
    runtime.publicApplicationInstances !== 0 ||
    runtime.adapterBindings !== 0 ||
    runtime.routeBindings !== 0 ||
    runtime.shadowRoutesEnabled !== 0 ||
    runtime.targetRoutesEnabled !== 0 ||
    runtime.productionCohortTenantIds?.length !== 0 ||
    runtime.authorityTransfersExecuted !== 0 ||
    runtime.schemaChanges !== 0 ||
    runbook.currentAdmission?.targetRoutesEnabled !== 0 ||
    runbook.currentAdmission?.authorityTransfersExecuted !== 0 ||
    testPlan.releaseAdmission?.plannedSuiteCommandsImplemented !== 0
  ) {
    fail("WF-EXT-01 falsely claims implementation or runtime activation");
  }
  if (
    state.negativeAssertions?.length !== 6 ||
    state.temporaryExceptions?.length !== 0
  ) {
    fail("six negative assertions and zero exceptions are required");
  }

  const expectedRoles = ["Architecture Owner", "Workforce Module Owner", "Operations Owner", "Quality Owner"];
  const approvals = state.approvals || [];
  if (
    !sameArray(approvals.map((item) => item.role), expectedRoles) ||
    approvals.some((item) =>
      item.owner !== "Sukhrob Khaydarov" ||
      item.decision !== "approved" ||
      item.date !== "2026-07-24")
  ) {
    fail("WF-EXT-01 approvals are incomplete");
  }

  if (
    packageJson.scripts?.["architecture:workforce-structure"] !==
      "node scripts/architecture/verify-workforce-extraction-structure.js" ||
    !packageJson.scripts?.["architecture:workforce"]?.includes("architecture:workforce-structure") ||
    !enforceRunner.includes("verify-workforce-extraction-structure.js")
  ) {
    fail("WF-EXT-01 verifier is not active in npm and required architecture enforcement");
  }

  for (const text of [
    "WF-EXT-01: PASSED", "structure_only", "Public Application", "Adapter bindings",
    "Route bindings", "legacy remains the sole authority", "0/10", "WF-EXT-02",
  ]) {
    if (!decision.includes(text)) fail(`decision is missing required statement: ${text}`);
  }

  console.log(
    "Workforce WF-EXT-01 PASS: source root 1/1 file, composition registration immutable, " +
    "layers 0, public Applications 0, adapters 0, routes 0, target suites 0/10, " +
    "68 approved fingerprints, 0 new findings, 0 exceptions; next=WF-EXT-02.",
  );
}

main();
