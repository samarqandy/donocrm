#!/usr/bin/env node

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../..");
const MANIFEST_FILE = "architecture/workforce-table-access-manifest.json";
const DECISION_FILE = "docs/architecture/workforce-table-ownership-access.md";
const CONTRACT_FILE = "architecture/workforce-contract-baseline.json";
const GLOBAL_TABLES_FILE = "architecture/tables.yaml";
const ALLOWED_VERBS = new Set(["read", "insert", "update", "delete"]);

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath));
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function fail(message) {
  throw new Error(`Workforce table access verification failed: ${message}`);
}

function sameSet(left, right) {
  return left.length === right.length && left.every((value) => right.includes(value));
}

function main() {
  const manifestBytes = read(MANIFEST_FILE);
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  const decision = read(DECISION_FILE).toString("utf8");
  const contract = JSON.parse(read(CONTRACT_FILE).toString("utf8"));
  const globalTables = JSON.parse(read(GLOBAL_TABLES_FILE).toString("utf8")).tables;

  if (manifest.schemaVersion !== 1 || manifest.decisionId !== "WF-PRE-08" || manifest.status !== "approved") {
    fail("identity/status metadata is invalid");
  }

  const manifestHash = sha256(manifestBytes);
  if (!decision.includes(manifestHash)) fail("decision does not contain the current manifest SHA-256");

  const fingerprints = Object.entries(manifest.sourceFingerprints || {});
  if (fingerprints.length !== 6) fail(`expected 6 evidence fingerprints, found ${fingerprints.length}`);
  for (const [sourceFile, expectedHash] of fingerprints) {
    if (sha256(read(sourceFile)) !== expectedHash) fail(`${sourceFile} evidence fingerprint changed`);
  }

  const scope = manifest.scope || {};
  const contractOperationIds = contract.operations.map((operation) => operation.id);
  if (JSON.stringify(scope.entrypoints) !== JSON.stringify(contractOperationIds)) {
    fail("scope entrypoints must match all 10 frozen operations in order");
  }
  if (!scope.closureRule || !scope.verifiedContextBoundary) {
    fail("SQL closure and verified-context boundaries must be explicit");
  }
  if (
    scope.directTableCount !== 12 ||
    scope.ownedDirectTableCount !== 2 ||
    scope.foreignDirectTableCount !== 10 ||
    scope.schemaOnlyDependencyCount !== 2
  ) {
    fail("declared table counts are invalid");
  }

  const policy = manifest.targetAccessPolicy || {};
  for (const field of [
    "defaultAccess",
    "ownedDirectAccess",
    "foreignDirectAccess",
    "foreignInteraction",
    "schemaConstraints",
    "legacyAccess",
    "exceptions",
  ]) {
    if (!policy[field]) fail(`targetAccessPolicy.${field} is missing`);
  }
  if (policy.defaultAccess !== "deny") fail("target access must default to deny");

  const tables = manifest.tables || [];
  if (tables.length !== 14) fail(`expected 14 table records, found ${tables.length}`);
  const tableNames = tables.map((table) => table.table);
  if (new Set(tableNames).size !== tables.length) fail("table records are not unique");

  const counts = { owned_direct: 0, foreign_direct: 0, schema_only: 0 };
  const tableByName = new Map();
  for (const table of tables) {
    if (!(table.classification in counts)) fail(`${table.table} has invalid classification`);
    counts[table.classification] += 1;
    tableByName.set(table.table, table);

    const globalRecord = globalTables[table.table];
    if (!globalRecord) fail(`${table.table} is absent from architecture/tables.yaml`);
    if (globalRecord.owner !== table.owner || globalRecord.tenantScoped !== table.tenantScoped) {
      fail(`${table.table} owner/tenant scope conflicts with architecture/tables.yaml`);
    }
    if (!Array.isArray(table.currentVerbs) || !Array.isArray(table.currentOperations)) {
      fail(`${table.table} current access metadata is incomplete`);
    }
    if (!table.targetDirectAccess || !table.targetTreatment?.type || !table.targetTreatment?.capability) {
      fail(`${table.table} target treatment is incomplete`);
    }
    if (!Array.isArray(table.targetTreatment.seamIds) || !table.tenantPredicate || !Array.isArray(table.legacyEvidence) || table.legacyEvidence.length === 0) {
      fail(`${table.table} seam/predicate/evidence metadata is incomplete`);
    }

    if (table.classification === "owned_direct") {
      if (table.owner !== "workforce" || table.targetDirectAccess !== "allow_owned_adapter" || table.targetTreatment.type !== "focused_workforce_port") {
        fail(`${table.table} owned-table target rule is invalid`);
      }
    } else if (table.classification === "foreign_direct") {
      if (table.owner === "workforce" || table.targetDirectAccess !== "forbid" || table.targetTreatment.type !== "provider_contract") {
        fail(`${table.table} foreign-table target rule is invalid`);
      }
      if (table.targetTreatment.seamIds.length === 0) fail(`${table.table} has no WF-PRE-07 seam`);
    } else if (table.currentVerbs.length !== 0 || table.currentOperations.length !== 0 || table.targetDirectAccess !== "forbid") {
      fail(`${table.table} schema-only dependency must have zero direct access and target access forbidden`);
    }
  }
  if (counts.owned_direct !== 2 || counts.foreign_direct !== 10 || counts.schema_only !== 2) {
    fail("table classification counts are invalid");
  }

  const matrix = manifest.operationAccessMatrix || [];
  if (
    matrix.length !== 10 ||
    JSON.stringify(matrix.map((operation) => operation.operationId)) !== JSON.stringify(contractOperationIds)
  ) {
    fail("operation matrix must cover all 10 frozen operations in order");
  }

  const aggregate = new Map();
  for (const operation of matrix) {
    if (!Array.isArray(operation.accesses) || operation.accesses.length === 0) {
      fail(`${operation.operationId} has no direct access record`);
    }
    const seenTables = new Set();
    for (const access of operation.accesses) {
      if (seenTables.has(access.table)) fail(`${operation.operationId} duplicates ${access.table}`);
      seenTables.add(access.table);
      const table = tableByName.get(access.table);
      if (!table || table.classification === "schema_only") {
        fail(`${operation.operationId} references unknown/schema-only table ${access.table}`);
      }
      if (!Array.isArray(access.verbs) || access.verbs.length === 0 || access.verbs.some((verb) => !ALLOWED_VERBS.has(verb))) {
        fail(`${operation.operationId}/${access.table} has invalid verbs`);
      }
      if (!aggregate.has(access.table)) aggregate.set(access.table, { verbs: new Set(), operations: new Set() });
      const summary = aggregate.get(access.table);
      access.verbs.forEach((verb) => summary.verbs.add(verb));
      summary.operations.add(operation.operationId);
    }
  }

  for (const table of tables.filter((item) => item.classification !== "schema_only")) {
    const actual = aggregate.get(table.table);
    if (!actual) fail(`${table.table} is declared direct but absent from operation matrix`);
    if (!sameSet(table.currentVerbs, [...actual.verbs])) fail(`${table.table} currentVerbs disagree with operation matrix`);
    if (!sameSet(table.currentOperations, [...actual.operations])) fail(`${table.table} currentOperations disagree with operation matrix`);
  }
  if (aggregate.size !== 12) fail(`operation matrix must reference exactly 12 direct tables, found ${aggregate.size}`);

  const exclusions = manifest.reviewedExclusions || [];
  if (exclusions.length !== 4 || new Set(exclusions.map((item) => item.table)).size !== 4) {
    fail("four unique reviewed exclusions are required");
  }
  for (const exclusion of exclusions) {
    if (!globalTables[exclusion.table] || globalTables[exclusion.table].owner !== exclusion.owner || !exclusion.reason) {
      fail(`${exclusion.table || "<unknown>"} exclusion is invalid`);
    }
    if (tableByName.has(exclusion.table)) fail(`${exclusion.table} cannot be both accessed and excluded`);
  }

  if (!Array.isArray(manifest.temporaryExceptions) || manifest.temporaryExceptions.length !== 0) {
    fail("no temporary target table-access exception is approved");
  }

  const risks = manifest.blockingRisks || [];
  const riskIds = ["WF-ACCESS-RISK-01", "WF-ACCESS-RISK-02", "WF-ACCESS-RISK-03", "WF-ACCESS-RISK-04", "WF-ACCESS-RISK-05"];
  if (risks.length !== 5 || !sameSet(risks.map((risk) => risk.id), riskIds)) {
    fail("five blocking access risks are required");
  }
  for (const risk of risks) {
    if (risk.severity !== "high" || !risk.issue || !risk.treatment || !Array.isArray(risk.tables) || risk.tables.some((table) => !tableByName.has(table))) {
      fail(`${risk.id} metadata/treatment is incomplete`);
    }
  }

  const approvalRoles = new Set((manifest.approvals || []).map((approval) => approval.role));
  for (const role of [
    "Architecture Owner",
    "Workforce Module Owner",
    "Data Owner",
    "Identity & Access Owner",
    "Organization & Branches Owner",
    "Academic Groups Owner",
    "Scheduling Owner",
    "Lesson Delivery Owner",
    "Student Information Owner",
    "Audit & History Owner",
    "Security Owner",
  ]) {
    if (!approvalRoles.has(role)) fail(`${role} approval is missing`);
  }

  console.log(
    `Workforce table access PASS: manifest=${manifest.manifestId}; sha256=${manifestHash}; operations=10/10; directTables=12/12; owned=2/2; foreign=10/10; schemaOnly=2/2; exceptions=0; risks=5/5`,
  );
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
