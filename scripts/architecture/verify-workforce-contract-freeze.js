#!/usr/bin/env node

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../..");
const BASELINE_FILE = "architecture/workforce-contract-baseline.json";
const DECISION_FILE = "docs/architecture/workforce-contract-freeze.md";
const EXPECTED_DTO_COUNTS = {
  TeacherAdmin: 21,
  TeacherWorkingHour: 9,
  TeacherProfileGroup: 32,
  TeacherProfileLesson: 44,
};

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath));
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function fail(message) {
  throw new Error(`Workforce contract freeze verification failed: ${message}`);
}

function openapiOperations(source) {
  const result = new Set();
  let currentPath = "";
  for (const line of source.split(/\r?\n/)) {
    const pathMatch = line.match(/^  (\/[^:]+):\s*$/);
    if (pathMatch) {
      currentPath = pathMatch[1];
      continue;
    }
    const methodMatch = line.match(/^    (get|post|put|delete|patch):\s*$/);
    if (currentPath && methodMatch) result.add(`${methodMatch[1].toUpperCase()} ${currentPath}`);
  }
  return result;
}

function main() {
  const baselineBytes = read(BASELINE_FILE);
  const baseline = JSON.parse(baselineBytes.toString("utf8"));
  const decision = read(DECISION_FILE).toString("utf8");

  if (baseline.schemaVersion !== 1 || baseline.status !== "approved" || baseline.decisionId !== "WF-PRE-05") {
    fail("identity/status metadata is invalid");
  }

  const baselineHash = sha256(baselineBytes);
  if (!decision.includes(baselineHash)) fail("decision does not contain the current baseline SHA-256");

  const sourceEntries = Object.entries(baseline.sourceFingerprints || {});
  if (sourceEntries.length !== 5) fail(`expected 5 source fingerprints, found ${sourceEntries.length}`);
  for (const [sourceFile, expectedHash] of sourceEntries) {
    const actualHash = sha256(read(sourceFile));
    if (actualHash !== expectedHash) fail(`${sourceFile} fingerprint changed`);
  }

  const operations = baseline.operations || [];
  if (operations.length !== 10) fail(`expected 10 operations, found ${operations.length}`);
  if (new Set(operations.map((operation) => operation.id)).size !== 10) fail("operation IDs are not unique");
  if (new Set(operations.map((operation) => `${operation.method} ${operation.path}`)).size !== 10) {
    fail("method/path pairs are not unique");
  }

  const declaredOpenapiOperations = openapiOperations(read("docs/openapi.yaml").toString("utf8"));
  for (const operation of operations) {
    const key = `${operation.method} ${operation.path}`;
    if (!declaredOpenapiOperations.has(key)) fail(`OpenAPI operation is missing: ${key}`);
  }

  for (const [dto, expectedCount] of Object.entries(EXPECTED_DTO_COUNTS)) {
    const fields = baseline.responseDtos?.[dto]?.fields;
    if (!Array.isArray(fields) || fields.length !== expectedCount || new Set(fields).size !== expectedCount) {
      fail(`${dto} must contain ${expectedCount} unique fields`);
    }
  }

  if (!(baseline.knownRisks || []).some((risk) => risk.id === "WF-CONTRACT-RISK-01")) {
    fail("the observed Teacher profile privacy mismatch is not registered");
  }

  console.log(
    `Workforce contract freeze PASS: baseline=${baseline.baselineId}; sha256=${baselineHash}; sources=5/5; operations=10/10; openapi=10/10`,
  );
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
