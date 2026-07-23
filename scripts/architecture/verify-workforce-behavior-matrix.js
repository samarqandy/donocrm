#!/usr/bin/env node

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../..");
const MATRIX_FILE = "architecture/workforce-behavior-matrix.json";
const CONTRACT_FILE = "architecture/workforce-contract-baseline.json";
const DECISION_FILE = "docs/architecture/workforce-behavior-matrix.md";
const ALLOWED_COVERAGE = new Set(["covered", "partial", "missing", "not_applicable"]);

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath));
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function fail(message) {
  throw new Error(`Workforce behavior matrix verification failed: ${message}`);
}

function main() {
  const matrixBytes = read(MATRIX_FILE);
  const matrix = JSON.parse(matrixBytes.toString("utf8"));
  const contractBytes = read(CONTRACT_FILE);
  const contract = JSON.parse(contractBytes.toString("utf8"));
  const decision = read(DECISION_FILE).toString("utf8");

  if (matrix.schemaVersion !== 1 || matrix.decisionId !== "WF-PRE-06" || matrix.status !== "approved") {
    fail("identity/status metadata is invalid");
  }

  const matrixHash = sha256(matrixBytes);
  if (!decision.includes(matrixHash)) fail("decision does not contain the current matrix SHA-256");

  const contractHash = sha256(contractBytes);
  if (matrix.contractBaseline?.id !== contract.baselineId || matrix.contractBaseline?.sha256 !== contractHash) {
    fail("WF-PRE-05 contract baseline binding changed");
  }

  const sourceEntries = Object.entries(matrix.testSourceFingerprints || {});
  if (sourceEntries.length !== 3) fail(`expected 3 test source fingerprints, found ${sourceEntries.length}`);
  for (const [sourceFile, expectedHash] of sourceEntries) {
    if (sha256(read(sourceFile)) !== expectedHash) fail(`${sourceFile} evidence fingerprint changed`);
  }

  const requiredCategories = matrix.requiredCategories || [];
  if (requiredCategories.length !== 8 || new Set(requiredCategories).size !== 8) {
    fail("exactly 8 unique required categories must be declared");
  }

  const operations = matrix.operations || [];
  const contractIds = contract.operations.map((operation) => operation.id);
  const matrixIds = operations.map((operation) => operation.operationId);
  if (operations.length !== 10 || JSON.stringify(matrixIds) !== JSON.stringify(contractIds)) {
    fail("matrix operations must match all 10 frozen contract operations in order");
  }

  const caseIds = new Set();
  const testIds = new Set();
  const counts = { covered: 0, partial: 0, missing: 0, not_applicable: 0 };

  for (const operation of operations) {
    const cases = operation.cases || [];
    const categories = new Set(cases.map((item) => item.category));
    for (const category of requiredCategories) {
      if (!categories.has(category)) fail(`${operation.operationId} has no ${category} row`);
    }

    for (const item of cases) {
      if (!item.id || caseIds.has(item.id)) fail(`duplicate or missing behavior case ID: ${item.id || "<missing>"}`);
      caseIds.add(item.id);
      if (!ALLOWED_COVERAGE.has(item.coverage)) fail(`${item.id} has invalid coverage state`);
      counts[item.coverage] += 1;

      if (item.coverage === "not_applicable") {
        if (!item.reason || item.testId || item.scenario || item.expected) {
          fail(`${item.id} not_applicable row must have only an explicit reason, not a test mapping`);
        }
        continue;
      }

      if (!item.testId || !item.scenario || !item.expected || !Array.isArray(item.evidence)) {
        fail(`${item.id} must have testId, scenario, expected, and evidence`);
      }
      if (testIds.has(item.testId)) fail(`duplicate test ID: ${item.testId}`);
      testIds.add(item.testId);
      if ((item.coverage === "covered" || item.coverage === "partial") && item.evidence.length === 0) {
        fail(`${item.id} claims ${item.coverage} without evidence`);
      }
      if (item.coverage === "missing" && item.evidence.length !== 0) {
        fail(`${item.id} is missing but contains accepted evidence`);
      }
    }
  }

  const risk = (matrix.knownRisks || []).find((item) => item.id === "WF-CONTRACT-RISK-01");
  if (!risk || risk.severity !== "blocking" || !caseIds.has(risk.behaviorCaseId)) {
    fail("WF-CONTRACT-RISK-01 must remain blocking and mapped to a behavior case");
  }

  const operationCases = Object.values(counts).reduce((sum, value) => sum + value, 0);
  console.log(
    `Workforce behavior matrix PASS: matrix=${matrix.matrixId}; sha256=${matrixHash}; operations=10/10; cases=${operationCases}; covered=${counts.covered}; partial=${counts.partial}; missing=${counts.missing}; n/a=${counts.not_applicable}; mappedTests=${testIds.size}`,
  );
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
