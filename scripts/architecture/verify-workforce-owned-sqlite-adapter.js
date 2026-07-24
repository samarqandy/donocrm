#!/usr/bin/env node

"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "../..");
const MANIFEST_FILE = "architecture/workforce-owned-sqlite-adapter.json";
const STATE_FILE = "architecture/workforce-extraction-state.json";
const PORT_FILE = "architecture/workforce-focused-ports.json";
const ACCESS_FILE = "architecture/workforce-table-access-manifest.json";
const TEST_PLAN_FILE = "architecture/workforce-test-parity-plan.json";
const TABLES_FILE = "architecture/tables.yaml";
const MODULES_FILE = "architecture/modules.yaml";
const BASELINE_FILE = "architecture/baseline.json";
const EXCEPTIONS_FILE = "architecture/exceptions.yaml";
const REGISTRATION_FILE = "src/bootstrap/workforceRegistration.js";
const SCHEMA_FILE = "src/db/schema.js";
const MODULE_ROOT = "src/modules/workforce";
const DECISION_FILE = "docs/architecture/workforce-owned-sqlite-adapter.md";
const PACKAGE_FILE = "package.json";
const ENFORCE_FILE = "scripts/architecture/run-enforce.js";
const TEST_FILE = "tests/workforce/contracts/owned-sqlite.contract.test.js";

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
  throw new Error(`Workforce owned SQLite adapter verification failed: ${message}`);
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

function main() {
  const manifestBytes = read(MANIFEST_FILE);
  const stateBytes = read(STATE_FILE);
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  const state = JSON.parse(stateBytes.toString("utf8"));
  const ports = json(PORT_FILE);
  const access = json(ACCESS_FILE);
  const testPlan = json(TEST_PLAN_FILE);
  const tables = json(TABLES_FILE);
  const modules = json(MODULES_FILE);
  const baseline = json(BASELINE_FILE);
  const exceptions = json(EXCEPTIONS_FILE);
  const packageJson = json(PACKAGE_FILE);
  const decision = read(DECISION_FILE).toString("utf8");
  const enforceSource = read(ENFORCE_FILE).toString("utf8");

  if (
    manifest.schemaVersion !== 1 ||
    manifest.decisionId !== "WF-EXT-04" ||
    manifest.status !== "passed" ||
    manifest.adapterEvidenceId !== "workforce-owned-sqlite-2026-07-24.1"
  ) {
    fail("manifest identity is invalid");
  }
  for (const [relativePath, expectedHash] of Object.entries(manifest.sourceFingerprints || {})) {
    if (sha256(read(relativePath)) !== expectedHash) fail(`source fingerprint drifted: ${relativePath}`);
  }

  const ownedPorts = ports.ports.filter((port) => port.id.startsWith("WF-PORT-OWN-"));
  const adapter = manifest.adapter || {};
  const expectedPortIds = ownedPorts.map((port) => port.id);
  const expectedMethods = ownedPorts.reduce((count, port) => count + port.methods.length, 0);
  if (
    adapter.adapterId !== "WF-ADAPTER-OWNED-SQLITE-01" ||
    !same(adapter.implementedPortIds, expectedPortIds) ||
    adapter.implementedMethodCount !== expectedMethods ||
    !same(adapter.directTableAllowlist, ["teachers", "teacher_working_hours"]) ||
    adapter.databaseAcquisition !== "injected SQLite handle only" ||
    adapter.schemaChanges !== 0 ||
    adapter.migrationFilesAdded !== 0 ||
    adapter.legacyDependencies !== 0 ||
    adapter.foreignTableAccesses !== 0 ||
    adapter.providerResponsibilities !== 0 ||
    adapter.auditWrites !== 0 ||
    adapter.identityWrites !== 0 ||
    adapter.identifierGeneration !== 0 ||
    adapter.timestampGeneration !== 0
  ) {
    fail("five owned ports/12 methods or strict adapter boundary is incomplete");
  }

  const { createSQLiteWorkforceAdapters } = require(path.join(
    ROOT,
    "src/modules/workforce/infrastructure/createSQLiteWorkforceAdapters.js",
  ));
  if (typeof createSQLiteWorkforceAdapters !== "function") fail("adapter factory export is missing");
  const infrastructureSource = adapter.implementationFiles
    .map((file) => read(file).toString("utf8"))
    .join("\n");
  for (const prohibited of [
    "AppService", "AppRepository", "db/client", "src/services", "src/repositories",
    "process.env", "users", "user_roles", "user_branch_access", "sessions",
    "branches", "groups", "schedules", "lessons", "students", "audit_logs",
  ]) {
    if (infrastructureSource.includes(prohibited)) {
      fail(`adapter contains legacy, provider, environment, or foreign-table dependency: ${prohibited}`);
    }
  }
  if (
    !infrastructureSource.includes("FROM teachers") ||
    !infrastructureSource.includes("INTO teachers") ||
    !infrastructureSource.includes("UPDATE teachers") ||
    !infrastructureSource.includes("FROM teacher_working_hours") ||
    !infrastructureSource.includes("INTO teacher_working_hours") ||
    !infrastructureSource.includes("DELETE FROM teacher_working_hours") ||
    !infrastructureSource.includes("BEGIN IMMEDIATE")
  ) {
    fail("explicit owned SQL operations or atomic Working Hour transaction is absent");
  }

  const ownedTables = Object.entries(tables.tables || {})
    .filter(([, definition]) => definition.owner === "workforce")
    .map(([table]) => table)
    .sort();
  const accessOwnedTables = (access.tables || [])
    .filter((table) => table.classification === "owned_direct")
    .map((table) => table.table)
    .sort();
  if (
    !same(ownedTables, ["teacher_working_hours", "teachers"]) ||
    !same(accessOwnedTables, ["teacher_working_hours", "teachers"]) ||
    sha256(read(SCHEMA_FILE)) !== manifest.sourceFingerprints[SCHEMA_FILE]
  ) {
    fail("owned table authority or unchanged schema evidence drifted");
  }

  const moduleFiles = filesUnder(MODULE_ROOT);
  if (
    !same(moduleFiles, state.moduleState?.trackedModuleFiles) ||
    !same(state.moduleState?.implementedLayers, ["domain", "application", "infrastructure"]) ||
    state.moduleState?.infrastructureAdaptersImplemented !== 1 ||
    state.moduleState?.httpAdaptersImplemented !== 0 ||
    fs.existsSync(path.join(ROOT, MODULE_ROOT, "http")) ||
    !same(modules.contexts?.workforce?.publicPaths, ["src/modules/workforce/application"])
  ) {
    fail("module topology is not exact or Infrastructure leaked into the public path");
  }

  const admission = manifest.admission || {};
  const runtime = state.runtimeState || {};
  if (
    state.currentIncrement !== "WF-EXT-04" ||
    !same(state.completedIncrements, ["WF-EXT-01", "WF-EXT-02", "WF-EXT-03", "WF-EXT-04"]) ||
    state.nextOrderedIncrement !== "WF-EXT-05" ||
    state.ownedSQLiteAdapterEvidence?.manifest !== MANIFEST_FILE ||
    state.ownedSQLiteAdapterEvidence?.manifestSha256 !== sha256(manifestBytes) ||
    runtime.legacyAuthority !== true ||
    runtime.plannedTargetSuitesImplemented !== 4 ||
    runtime.plannedTargetSuitesPassing !== 4 ||
    runtime.targetContractCasesPassing !== 30 ||
    runtime.ownedSQLiteAdapterImplementations !== 1 ||
    runtime.ownedSQLitePortsImplemented !== 5 ||
    runtime.ownedSQLitePortMethodsImplemented !== 12 ||
    runtime.publicApplicationInstances !== 0 ||
    runtime.adapterBindings !== 0 ||
    runtime.routeBindings !== 0 ||
    runtime.shadowRoutesEnabled !== 0 ||
    runtime.targetRoutesEnabled !== 0 ||
    runtime.schemaChanges !== 0 ||
    admission.pre13TargetSuitesImplemented !== 4 ||
    admission.pre13TargetSuitesRemainingBlocking !== 6 ||
    admission.nextOrderedIncrement !== "WF-EXT-05"
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
    fail("adapter was bound, routed, or given target authority");
  }

  if (
    testPlan.suiteCatalog?.find((suite) => suite.id === "WF-TEST-SUITE-03")?.implementationStatus !==
      "missing_blocking" ||
    manifest.contractSuite?.suiteId !== "WF-TEST-SUITE-03" ||
    manifest.contractSuite?.caseCount !== 9 ||
    manifest.contractSuite?.passing !== 9 ||
    manifest.contractSuite?.determinism?.sleepCalls !== 0 ||
    manifest.contractSuite?.determinism?.networkCalls !== 0
  ) {
    fail("historical PRE-13 plan or owned SQLite suite evidence is invalid");
  }
  const execution = spawnSync(process.execPath, ["--test", path.join(ROOT, TEST_FILE)], {
    cwd: ROOT,
    env: { ...process.env, TZ: "Asia/Tashkent" },
    encoding: "utf8",
  });
  if (execution.status !== 0) {
    if (execution.stdout) process.stdout.write(execution.stdout);
    if (execution.stderr) process.stderr.write(execution.stderr);
    fail(`owned SQLite contract suite exited ${execution.status}`);
  }
  const output = `${execution.stdout || ""}\n${execution.stderr || ""}`;
  if (!output.includes("tests 9") || !output.includes("pass 9") || !output.includes("fail 0")) {
    fail("owned SQLite contract result is not exactly 9/9 passing");
  }

  const gateBaseline = manifest.baseline || {};
  if (
    baseline.configurationHash !== gateBaseline.configurationHash ||
    gateBaseline.configurationHash !== "adde24e84a4f43b7e6771489e574b2ce3f647b558e823a9b70b944d55d1d5d91" ||
    baseline.fingerprints?.length !== 68 ||
    gateBaseline.approvedFingerprintCount !== 68 ||
    gateBaseline.newFingerprintCount !== 0 ||
    gateBaseline.activeExceptionCount !== 0 ||
    gateBaseline.legacyMetricChanges !== 0 ||
    exceptions.exceptions?.length !== 0
  ) {
    fail("architecture baseline, findings, metrics, or exceptions expanded");
  }

  if (
    packageJson.scripts?.["test:workforce:owned-sqlite"] !==
      "node --test tests/workforce/contracts/owned-sqlite.contract.test.js" ||
    !packageJson.scripts?.["test:workforce:target"]?.includes("test:workforce:owned-sqlite") ||
    packageJson.scripts?.["architecture:workforce-sqlite"] !==
      "node scripts/architecture/verify-workforce-owned-sqlite-adapter.js" ||
    !packageJson.scripts?.["architecture:workforce"]?.includes("architecture:workforce-sqlite") ||
    !enforceSource.includes("verify-workforce-owned-sqlite-adapter.js")
  ) {
    fail("contract suite or verifier is absent from required commands");
  }

  const manifestHash = sha256(manifestBytes);
  const stateHash = sha256(stateBytes);
  for (const required of [
    "WF-EXT-04: PASSED",
    manifestHash,
    stateHash,
    "5/5",
    "12/12",
    "9/9",
    "4/10",
    "30/30",
    "legacy remains the sole runtime authority",
    "WF-EXT-05",
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
    "Workforce WF-EXT-04 PASS: owned SQLite ports 5/5 and methods 12/12, suite 9/9, " +
    "target suites 4/10 with cases 30/30, tables 2/2, schema changes 0, bindings/routes 0, " +
    "exceptions 0; next=WF-EXT-05.",
  );
}

main();
