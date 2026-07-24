#!/usr/bin/env node

"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "../..");
const MANIFEST_FILE = "architecture/workforce-application-facade-implementation.json";
const STATE_FILE = "architecture/workforce-extraction-state-wf-ext-03.json";
const APPLICATION_CONTRACT_FILE = "architecture/workforce-application-contracts.json";
const PORT_FILE = "architecture/workforce-focused-ports.json";
const TEST_PLAN_FILE = "architecture/workforce-test-parity-plan.json";
const MODULES_FILE = "architecture/modules.yaml";
const BASELINE_FILE = "architecture/baseline.json";
const EXCEPTIONS_FILE = "architecture/exceptions.yaml";
const REGISTRATION_FILE = "src/bootstrap/workforceRegistration.js";
const MODULE_ROOT = "src/modules/workforce";
const DECISION_FILE = "docs/architecture/workforce-application-facade.md";
const PACKAGE_FILE = "package.json";
const ENFORCE_FILE = "scripts/architecture/run-enforce.js";

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath));
}

function json(relativePath) {
  return JSON.parse(read(relativePath).toString("utf8"));
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function fail(message) {
  throw new Error(`Workforce Application facade verification failed: ${message}`);
}

function filesUnder(relativeRoot) {
  const result = [];
  function visit(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) visit(target);
      else result.push(path.relative(ROOT, target).split(path.sep).join("/"));
    }
  }
  visit(path.join(ROOT, relativeRoot));
  return result.sort();
}

function execute(script) {
  const result = spawnSync(process.execPath, ["--test", path.join(ROOT, script)], {
    cwd: ROOT,
    env: { ...process.env, TZ: "Asia/Tashkent" },
    encoding: "utf8",
  });
  if (result.status !== 0) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    fail(`${script} exited ${result.status}`);
  }
  return `${result.stdout || ""}\n${result.stderr || ""}`;
}

function main() {
  const manifestBytes = read(MANIFEST_FILE);
  const stateBytes = read(STATE_FILE);
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  const state = JSON.parse(stateBytes.toString("utf8"));
  const contracts = json(APPLICATION_CONTRACT_FILE);
  const ports = json(PORT_FILE);
  const testPlan = json(TEST_PLAN_FILE);
  const modules = json(MODULES_FILE);
  const baseline = json(BASELINE_FILE);
  const exceptions = json(EXCEPTIONS_FILE);
  const packageJson = json(PACKAGE_FILE);
  const decision = read(DECISION_FILE).toString("utf8");
  const enforceSource = read(ENFORCE_FILE).toString("utf8");

  if (
    manifest.schemaVersion !== 1 ||
    manifest.decisionId !== "WF-EXT-03" ||
    manifest.status !== "passed" ||
    manifest.implementationId !== "workforce-application-facade-2026-07-24.1"
  ) {
    fail("manifest identity is invalid");
  }
  for (const [relativePath, expectedHash] of Object.entries(manifest.sourceFingerprints || {})) {
    if (sha256(read(relativePath)) !== expectedHash) fail(`source fingerprint drifted: ${relativePath}`);
  }

  const implementation = manifest.implementation || {};
  const expectedContractIds = contracts.contracts.map((contract) => contract.id);
  const expectedPortIds = ports.ports.map((port) => port.id);
  const expectedMethodCount = ports.ports.reduce((count, port) => count + port.methods.length, 0);
  if (
    implementation.publicFacadeClass !== "WorkforceApplication" ||
    !same(implementation.surfacesImplemented, contracts.surfaces.map((surface) => surface.name)) ||
    !same(implementation.publicContractIds, expectedContractIds) ||
    !same(implementation.focusedPortIds, expectedPortIds) ||
    implementation.focusedPortMethodCount !== expectedMethodCount ||
    implementation.legacyDependencyCount !== 0 ||
    implementation.directSqlCount !== 0
  ) {
    fail("public surfaces, 11 contracts, or 18 focused ports/32 methods are incomplete");
  }

  const { FOCUSED_PORTS } = require(path.join(ROOT, "src/modules/workforce/application/ports.js"));
  const { WorkforceApplication } = require(path.join(ROOT, implementation.publicFacadeFile));
  if (
    typeof WorkforceApplication !== "function" ||
    FOCUSED_PORTS.length !== 18 ||
    FOCUSED_PORTS.reduce((count, port) => count + port.methods.length, 0) !== 32 ||
    !same(FOCUSED_PORTS.map((port) => port.id), expectedPortIds) ||
    !Object.isFrozen(FOCUSED_PORTS)
  ) {
    fail("runtime facade or focused port catalog differs from approved PRE-09/PRE-10 contracts");
  }

  const moduleFiles = filesUnder(MODULE_ROOT);
  const trackedFiles = state.moduleState?.trackedModuleFiles || [];
  if (
    trackedFiles.some((file) => !moduleFiles.includes(file)) ||
    !same(state.moduleState?.implementedLayers, ["domain", "application"]) ||
    state.moduleState?.domainImplemented !== true ||
    state.moduleState?.publicApplicationImplemented !== true ||
    !same(state.moduleState?.publicPaths, ["src/modules/workforce/application"]) ||
    fs.existsSync(path.join(ROOT, MODULE_ROOT, "http"))
  ) {
    fail("module layer/file topology is not the exact Domain/Application-only shape");
  }
  const productionSource = trackedFiles
    .filter((file) => file.endsWith(".js"))
    .map((file) => read(file).toString("utf8"))
    .join("\n");
  for (const prohibited of [
    "src/services", "src/repositories", "src/db", "AppService", "AppRepository",
    "node:sqlite", "SELECT ", "INSERT ", "UPDATE ", "DELETE FROM", "process.env",
  ]) {
    if (productionSource.includes(prohibited)) fail(`module contains prohibited legacy/infrastructure dependency: ${prohibited}`);
  }

  const workforceModule = modules.contexts?.workforce;
  const transition = manifest.baselineTransition || {};
  if (
    workforceModule?.status !== "migrating" ||
    !same(workforceModule.sourceRoots, [MODULE_ROOT]) ||
    !same(workforceModule.publicPaths, ["src/modules/workforce/application"]) ||
    baseline.configurationHash !== transition.currentConfigurationHash ||
    transition.previousConfigurationHash !== "7e17f5d2633a11940c2c9ac625e8818afcd6b5ebac41fcb33e637feab0e734ba" ||
    transition.currentConfigurationHash !== "adde24e84a4f43b7e6771489e574b2ce3f647b558e823a9b70b944d55d1d5d91" ||
    transition.approvedFingerprintCount !== 68 ||
    transition.newFingerprintCount !== 0 ||
    transition.activeExceptionCount !== 0 ||
    transition.legacyMetricChanges !== 0 ||
    baseline.fingerprints?.length !== 68 ||
    baseline.configurationRevisions?.at(-1)?.decision !== "WF-EXT-03" ||
    exceptions.exceptions?.length !== 0
  ) {
    fail("public-path baseline transition expanded findings, metrics, ownership, or exceptions");
  }

  const admission = manifest.admission || {};
  const runtime = state.runtimeState || {};
  if (
    state.currentIncrement !== "WF-EXT-03" ||
    !same(state.completedIncrements, ["WF-EXT-01", "WF-EXT-02", "WF-EXT-03"]) ||
    state.nextOrderedIncrement !== "WF-EXT-04" ||
    state.applicationFacadeEvidence?.manifest !== MANIFEST_FILE ||
    state.applicationFacadeEvidence?.manifestSha256 !== sha256(manifestBytes) ||
    runtime.legacyAuthority !== true ||
    runtime.plannedTargetSuitesImplemented !== 3 ||
    runtime.plannedTargetSuitesPassing !== 3 ||
    runtime.targetContractCasesPassing !== 21 ||
    runtime.publicApplicationImplementations !== 1 ||
    runtime.publicApplicationInstances !== 0 ||
    runtime.publicContractsImplemented !== 11 ||
    runtime.focusedPortsImplemented !== 18 ||
    runtime.focusedPortMethodsImplemented !== 32 ||
    runtime.adapterBindings !== 0 ||
    runtime.routeBindings !== 0 ||
    runtime.targetRoutesEnabled !== 0 ||
    admission.pre13TargetSuitesImplemented !== 3 ||
    admission.pre13TargetSuitesRemainingBlocking !== 7 ||
    admission.nextOrderedIncrement !== "WF-EXT-04"
  ) {
    fail("live extraction state or zero-activation admission is invalid");
  }

  const registration = require(path.join(ROOT, REGISTRATION_FILE)).workforceRegistration();
  if (
    registration.publicApplication !== null ||
    registration.adapterBindings.length !== 0 ||
    registration.routeBindings.length !== 0 ||
    registration.defaultAuthority !== "legacy" ||
    registration.activation !== "disabled"
  ) {
    fail("facade was instantiated, bound, routed, or given target authority");
  }

  if (
    testPlan.suiteCatalog?.length !== 10 ||
    testPlan.suiteCatalog.some((suite) => suite.implementationStatus !== "missing_blocking") ||
    !same(manifest.implementedSuites.map((suite) => suite.id), [
      "WF-TEST-SUITE-01", "WF-TEST-SUITE-02", "WF-TEST-SUITE-05",
    ]) ||
    manifest.implementedSuites.reduce((count, suite) => count + suite.passing, 0) !== 21
  ) {
    fail("historical PRE-13 plan or exact three-suite implementation evidence is invalid");
  }

  const domainOutput = execute("tests/workforce/domain/teacher.test.js");
  const domainHoursOutput = execute("tests/workforce/domain/teacher-working-hour.test.js");
  const applicationOutput = execute("tests/workforce/application/workforce-application.contract.test.js");
  const systemOutput = execute("tests/workforce/contracts/system-ports.contract.test.js");
  const domainCombined = `${domainOutput}\n${domainHoursOutput}`;
  if (
    !domainOutput.includes("tests 3") ||
    !domainOutput.includes("pass 3") ||
    !domainOutput.includes("fail 0") ||
    !domainHoursOutput.includes("tests 3") ||
    !domainHoursOutput.includes("pass 3") ||
    !domainHoursOutput.includes("fail 0") ||
    (domainCombined.match(/pass 3/g) || []).length !== 2 ||
    !applicationOutput.includes("tests 12") ||
    !applicationOutput.includes("pass 12") ||
    !applicationOutput.includes("fail 0") ||
    !systemOutput.includes("tests 3") ||
    !systemOutput.includes("pass 3") ||
    !systemOutput.includes("fail 0")
  ) {
    fail("Domain/Application/system-port target suites are not exactly passing");
  }

  if (
    packageJson.scripts?.["architecture:workforce-facade"] !==
      "node scripts/architecture/verify-workforce-application-facade.js" ||
    !packageJson.scripts?.["architecture:workforce"]?.includes("architecture:workforce-facade") ||
    !packageJson.scripts?.["test:workforce:target"]?.includes("test:workforce:application") ||
    !packageJson.scripts?.test?.includes("test:workforce:target") ||
    !enforceSource.includes("verify-workforce-application-facade.js")
  ) {
    fail("target suites or facade verifier are absent from required commands");
  }

  const manifestHash = sha256(manifestBytes);
  const stateHash = sha256(stateBytes);
  for (const required of [
    "WF-EXT-03: PASSED",
    manifestHash,
    stateHash,
    "11/11",
    "18/18",
    "32/32",
    "3/10",
    "21/21",
    "legacy remains the sole runtime authority",
    "WF-EXT-04",
  ]) {
    if (!decision.includes(required)) fail(`decision is missing required evidence: ${required}`);
  }

  if (
    manifest.temporaryExceptions?.length !== 0 ||
    manifest.approvals?.length !== 4 ||
    manifest.approvals.some((approval) =>
      approval.owner !== "Sukhrob Khaydarov" ||
      approval.decision !== "approved" ||
      approval.date !== "2026-07-24")
  ) {
    fail("approvals or zero-exception evidence is invalid");
  }

  console.log(
    "Workforce WF-EXT-03 PASS: public contracts 11/11, focused ports 18/18 and methods 32/32, " +
    "target suites 3/10 with cases 21/21, adapters 0, routes 0, exceptions 0; next=WF-EXT-04.",
  );
}

main();
