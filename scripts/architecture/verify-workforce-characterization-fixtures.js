#!/usr/bin/env node

"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "../..");
const MANIFEST_FILE = "architecture/workforce-characterization-fixtures.json";
const STATE_FILE = "architecture/workforce-extraction-state-wf-ext-02.json";
const TEST_PLAN_FILE = "architecture/workforce-test-parity-plan.json";
const REGISTRATION_FILE = "src/bootstrap/workforceRegistration.js";
const FIXTURE_FILE = "tests/workforce/fixtures/focused-contract-fixtures.js";
const TEST_FILE = "tests/workforce/characterization/legacy-focused-contracts.test.js";
const DECISION_FILE = "docs/architecture/workforce-characterization-fixtures.md";
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
  throw new Error(`Workforce characterization fixture verification failed: ${message}`);
}

function main() {
  const manifestBytes = read(MANIFEST_FILE);
  const stateBytes = read(STATE_FILE);
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  const state = JSON.parse(stateBytes.toString("utf8"));
  const testPlan = json(TEST_PLAN_FILE);
  const packageJson = json(PACKAGE_FILE);
  const decision = read(DECISION_FILE).toString("utf8");
  const enforceSource = read(ENFORCE_FILE).toString("utf8");
  const testSource = read(TEST_FILE).toString("utf8");
  const fixtureSource = read(FIXTURE_FILE).toString("utf8");

  if (
    manifest.schemaVersion !== 1 ||
    manifest.decisionId !== "WF-EXT-02" ||
    manifest.status !== "passed" ||
    manifest.fixtureSetId !== "workforce-legacy-characterization-2026-07-24.1"
  ) {
    fail("manifest identity is invalid");
  }

  for (const [relativePath, expectedHash] of Object.entries(manifest.sourceFingerprints || {})) {
    if (sha256(read(relativePath)) !== expectedHash) fail(`source fingerprint drifted: ${relativePath}`);
  }

  const fixtureIds = manifest.fixtures?.map((item) => item.id);
  if (
    !same(fixtureIds, ["WF-FIX-01", "WF-FIX-02", "WF-FIX-03", "WF-FIX-04", "WF-FIX-05", "WF-FIX-06", "WF-FIX-07", "WF-FIX-08"]) ||
    manifest.fixtures.some((item) => item.legacyExecutable !== true) ||
    manifest.execution?.fixtureCount !== 8 ||
    manifest.execution?.caseCount !== 8 ||
    manifest.execution?.expectedPassing !== 8 ||
    manifest.execution?.networkCalls !== 0 ||
    manifest.execution?.sleepCalls !== 0
  ) {
    fail("the exact eight-fixture executable catalog is incomplete");
  }

  const fixtures = require(path.join(ROOT, FIXTURE_FILE));
  if (
    fixtures.FIXTURES.length !== 8 ||
    !same(fixtures.FIXTURES.map((item) => item.id), fixtureIds) ||
    fixtures.HTTP_OPERATIONS.length !== 10 ||
    new Set(fixtures.HTTP_OPERATIONS.map((item) => `${item.method} ${item.path}`)).size !== 10 ||
    !Object.isFrozen(fixtures.CONTROLS) ||
    !Object.isFrozen(fixtures.FIXTURES) ||
    !Object.isFrozen(fixtures.HTTP_OPERATIONS) ||
    fixtures.CONTROLS.fixedClock !== "2026-07-24T06:00:00.000Z" ||
    !same(fixtures.CONTROLS.tenantIds, ["tenant_wf_a", "tenant_wf_b"])
  ) {
    fail("runtime fixture exports or deterministic controls differ from the manifest");
  }

  for (const prohibited of ["setTimeout(", "Math.random(", "Date.now(", "fetch(", "http.request(", "https.request("]) {
    if (fixtureSource.includes(prohibited) || testSource.includes(prohibited)) {
      fail(`fixture implementation contains prohibited nondeterminism or network call: ${prohibited}`);
    }
  }

  if (
    testPlan.fixtures?.length !== 8 ||
    !same(testPlan.fixtures.map((item) => item.id), fixtureIds) ||
    testPlan.suiteCatalog?.length !== 10 ||
    testPlan.suiteCatalog.some((suite) => suite.implementationStatus !== "missing_blocking") ||
    testPlan.releaseAdmission?.plannedSuiteCommandsImplemented !== 0
  ) {
    fail("PRE-13 fixture authority drifted or a target suite is falsely marked implemented");
  }

  const admission = manifest.admission || {};
  const runtime = state.runtimeState || {};
  if (
    state.status !== "active" ||
    state.currentIncrement !== "WF-EXT-02" ||
    !same(state.completedIncrements, ["WF-EXT-01", "WF-EXT-02"]) ||
    state.nextOrderedIncrement !== "WF-EXT-03" ||
    state.characterizationEvidence?.decisionId !== "WF-EXT-02" ||
    state.characterizationEvidence?.manifest !== MANIFEST_FILE ||
    state.characterizationEvidence?.manifestSha256 !== sha256(manifestBytes) ||
    runtime.legacyAuthority !== true ||
    runtime.legacyCharacterizationFixturesImplemented !== 8 ||
    runtime.legacyCharacterizationCasesPassing !== 8 ||
    runtime.plannedTargetSuitesImplemented !== 0 ||
    runtime.publicApplicationInstances !== 0 ||
    runtime.adapterBindings !== 0 ||
    runtime.routeBindings !== 0 ||
    runtime.targetRoutesEnabled !== 0 ||
    admission.pre13TargetSuitesImplemented !== 0 ||
    admission.pre13TargetSuitesRemainingBlocking !== 10 ||
    admission.nextOrderedIncrement !== "WF-EXT-03"
  ) {
    fail("live extraction state or no-activation admission is invalid");
  }

  const { workforceRegistration } = require(path.join(ROOT, REGISTRATION_FILE));
  const registration = workforceRegistration();
  if (
    registration.incrementId !== "WF-EXT-01" ||
    registration.lifecycle !== "structure_only" ||
    registration.publicApplication !== null ||
    registration.adapterBindings.length !== 0 ||
    registration.routeBindings.length !== 0 ||
    registration.defaultAuthority !== "legacy" ||
    registration.activation !== "disabled"
  ) {
    fail("WF-EXT-02 changed composition or runtime authority");
  }

  const expectedTestCommand =
    "TZ=Asia/Tashkent node --test tests/workforce/characterization/legacy-focused-contracts.test.js";
  if (
    packageJson.scripts?.["test:workforce:characterization"] !== expectedTestCommand ||
    packageJson.scripts?.["architecture:workforce-fixtures"] !==
      "node scripts/architecture/verify-workforce-characterization-fixtures.js" ||
    !packageJson.scripts?.["architecture:workforce"]?.includes("architecture:workforce-fixtures") ||
    !enforceSource.includes("verify-workforce-characterization-fixtures.js")
  ) {
    fail("fixture test or verifier is absent from required commands");
  }

  const execution = spawnSync(process.execPath, ["--test", path.join(ROOT, TEST_FILE)], {
    cwd: ROOT,
    env: { ...process.env, TZ: "Asia/Tashkent" },
    encoding: "utf8",
  });
  if (execution.status !== 0) {
    if (execution.stdout) process.stdout.write(execution.stdout);
    if (execution.stderr) process.stderr.write(execution.stderr);
    fail(`legacy characterization command exited ${execution.status}`);
  }
  const output = `${execution.stdout || ""}\n${execution.stderr || ""}`;
  if (!output.includes("tests 8") || !output.includes("pass 8") || !output.includes("fail 0")) {
    fail("legacy characterization result is not exactly 8/8 passing");
  }

  const manifestHash = sha256(manifestBytes);
  const stateHash = sha256(stateBytes);
  for (const required of [
    "WF-EXT-02: PASSED",
    manifestHash,
    stateHash,
    "8/8",
    "0/10",
    "legacy remains the sole runtime authority",
    "WF-EXT-03",
  ]) {
    if (!decision.includes(required)) fail(`decision is missing required evidence: ${required}`);
  }

  if (
    manifest.temporaryExceptions?.length !== 0 ||
    manifest.approvals?.length !== 3 ||
    manifest.approvals.some((approval) =>
      approval.owner !== "Sukhrob Khaydarov" ||
      approval.decision !== "approved" ||
      approval.date !== "2026-07-24")
  ) {
    fail("approvals or zero-exception evidence is invalid");
  }

  console.log(
    "Workforce WF-EXT-02 PASS: deterministic legacy characterization fixtures 8/8, " +
    "HTTP pairs 10/10, PRE-13 target suites 0/10, routes 0, adapters 0, exceptions 0; next=WF-EXT-03.",
  );
}

main();
