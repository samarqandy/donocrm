#!/usr/bin/env node

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../..");
const MANIFEST_FILE = "architecture/workforce-consistency-model.json";
const DECISION_FILE = "docs/architecture/workforce-transaction-consistency.md";
const APPLICATION_FILE = "architecture/workforce-application-contracts.json";
const PORTS_FILE = "architecture/workforce-focused-ports.json";
const TABLES_FILE = "architecture/tables.yaml";

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath));
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function fail(message) {
  throw new Error(`Workforce consistency verification failed: ${message}`);
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
  const portCatalog = JSON.parse(read(PORTS_FILE).toString("utf8"));
  const globalTables = JSON.parse(read(TABLES_FILE).toString("utf8")).tables;

  if (
    manifest.schemaVersion !== 1 ||
    manifest.decisionId !== "WF-PRE-11" ||
    manifest.status !== "approved" ||
    manifest.modelVersion !== "1.0.0"
  ) {
    fail("identity, status, or version metadata is invalid");
  }

  const manifestHash = sha256(manifestBytes);
  if (!decision.includes(manifestHash)) fail("decision does not contain the current manifest SHA-256");

  const fingerprints = Object.entries(manifest.sourceFingerprints || {});
  if (fingerprints.length !== 7) fail(`expected 7 evidence fingerprints, found ${fingerprints.length}`);
  for (const [sourceFile, expectedHash] of fingerprints) {
    if (sha256(read(sourceFile)) !== expectedHash) fail(`${sourceFile} evidence fingerprint changed`);
  }

  const policy = manifest.consistencyPolicy || {};
  for (const field of [
    "authority", "localAtomicity", "distributedTransaction", "successAcknowledgement",
    "unknownOutcome", "retry", "compensation", "reconciliation", "audit",
    "routeAdmission", "legacyHold", "schema",
  ]) {
    if (!policy[field]) fail(`consistencyPolicy.${field} is missing`);
  }
  if (
    !policy.distributedTransaction.startsWith("Forbidden") ||
    !policy.retry.startsWith("No Workforce HTTP command") ||
    !policy.audit.includes("every target mutation route remains disabled")
  ) {
    fail("distributed transaction, retry, or Audit admission policy is weakened");
  }

  const expectedOutcomeStates = [
    "not_started", "rolled_back", "committed", "committed_unacknowledged", "unknown",
  ];
  if (!sameArray((manifest.outcomeStates || []).map((item) => item.state), expectedOutcomeStates)) {
    fail("five exact consistency outcome states are required");
  }

  const legacyEvidence = manifest.legacyEvidence || [];
  if (
    legacyEvidence.length !== 5 ||
    !sameArray(legacyEvidence.map((item) => item.id), [
      "WF-LEGACY-TX-01", "WF-LEGACY-TX-02", "WF-LEGACY-TX-03",
      "WF-LEGACY-TX-04", "WF-LEGACY-TX-05",
    ])
  ) {
    fail("legacy transaction evidence is incomplete");
  }
  for (const evidence of legacyEvidence) {
    if (!evidence.atomicity || !evidence.rollback || evidence.evidence?.length < 2) {
      fail(`${evidence.id} evidence/rollback semantics are incomplete`);
    }
  }

  const portById = new Map(portCatalog.ports.map((port) => [port.id, port]));
  const units = manifest.atomicUnits || [];
  const expectedUnitIds = [
    "WF-ATOMIC-01", "WF-ATOMIC-02", "ID-ATOMIC-01", "ID-ATOMIC-02", "AUD-ATOMIC-01",
  ];
  if (!sameArray(units.map((unit) => unit.id), expectedUnitIds)) {
    fail("five exact provider-local atomic units are required");
  }
  const unitById = new Map(units.map((unit) => [unit.id, unit]));
  for (const unit of units) {
    if (!portById.has(unit.portId)) fail(`${unit.id} references unknown PRE-10 port`);
    if (!Array.isArray(unit.tables) || unit.tables.length === 0) fail(`${unit.id} has no owned table`);
    for (const tableName of unit.tables) {
      if (!globalTables[tableName]) fail(`${unit.id} references unknown table ${tableName}`);
      if (globalTables[tableName].owner !== unit.owner) {
        fail(`${unit.id} crosses authority through ${tableName}`);
      }
    }
    if (!unit.isolation || !unit.commitRule || !Array.isArray(unit.excludes)) {
      fail(`${unit.id} atomicity metadata is incomplete`);
    }
  }
  if (
    !sameArray(unitById.get("ID-ATOMIC-02").tables, ["users", "sessions"]) ||
    unitById.get("ID-ATOMIC-02").portId !== "WF-PORT-PROV-02" ||
    !unitById.get("ID-ATOMIC-02").commitRule.includes("commit together or roll back together")
  ) {
    fail("credential reset/session invalidation is not one Identity atomic unit");
  }
  if (!unitById.get("WF-ATOMIC-02").commitRule.includes("recheck overlap and insert")) {
    fail("Working Hour overlap check/insert atomicity is missing");
  }

  const variants = manifest.variantConsistencyMatrix || [];
  const expectedVariantIds = [
    "WF-CONS-01", "WF-CONS-02", "WF-CONS-03A", "WF-CONS-03B",
    "WF-CONS-04A", "WF-CONS-04B", "WF-CONS-05A", "WF-CONS-05B",
    "WF-CONS-06", "WF-CONS-07", "WF-CONS-08", "WF-CONS-09",
    "WF-CONS-10", "WF-CONS-REF-01",
  ];
  if (!sameArray(variants.map((variant) => variant.variantId), expectedVariantIds)) {
    fail("the exact 14-variant consistency matrix changed");
  }
  const applicationIds = application.contracts.map((contract) => contract.id);
  const coveredContractIds = [...new Set(variants.map((variant) => variant.contractId))];
  if (!sameSet(coveredContractIds, applicationIds)) {
    fail("consistency variants do not cover all 11 public contracts");
  }
  for (const variant of variants) {
    if (
      !["query", "command"].includes(variant.kind) ||
      !Array.isArray(variant.businessAuthorities) ||
      variant.businessAuthorities.length === 0 ||
      !Array.isArray(variant.atomicUnitIds) ||
      !Array.isArray(variant.ordering) ||
      variant.ordering.length === 0 ||
      !variant.failure ||
      !variant.routeAdmission ||
      !Array.isArray(variant.releaseGates)
    ) {
      fail(`${variant.variantId} consistency metadata is incomplete`);
    }
    if (variant.automaticRetry !== false) fail(`${variant.variantId} cannot auto-retry`);
    if (variant.kind === "query" && variant.auditRequired !== false) {
      fail(`${variant.variantId} query cannot require mutation Audit`);
    }
    if (variant.kind === "command" && variant.auditRequired !== true) {
      fail(`${variant.variantId} command must require Audit`);
    }
    for (const unitId of variant.atomicUnitIds) {
      if (!unitById.has(unitId)) fail(`${variant.variantId} references unknown atomic unit ${unitId}`);
    }
    if (variant.routeAdmission.startsWith("legacy_hold")) {
      if (variant.atomicUnitIds.length !== 0 || variant.ordering[0] !== "Execute frozen legacy operation only") {
        fail(`${variant.variantId} legacy hold cannot invoke target atomic units`);
      }
    }
    if (variant.routeAdmission === "target_write_blocked_audit_delivery") {
      if (
        variant.kind !== "command" ||
        variant.businessAuthorities.length !== 1 ||
        variant.atomicUnitIds.length !== 1 ||
        !variant.releaseGates.includes("WF-PRE-12")
      ) {
        fail(`${variant.variantId} single-authority Audit-blocked closure is invalid`);
      }
      const unit = unitById.get(variant.atomicUnitIds[0]);
      if (unit.owner !== variant.businessAuthorities[0]) {
        fail(`${variant.variantId} atomic owner differs from business authority`);
      }
    }
  }

  const summary = manifest.routeAdmissionSummary || {};
  const expectedRead = ["WF-CONS-01", "WF-CONS-02", "WF-CONS-08", "WF-CONS-REF-01"];
  const expectedAuditBlocked = [
    "WF-CONS-03A", "WF-CONS-04A", "WF-CONS-06",
    "WF-CONS-07", "WF-CONS-09", "WF-CONS-10",
  ];
  const expectedLegacyHold = ["WF-CONS-03B", "WF-CONS-04B", "WF-CONS-05A", "WF-CONS-05B"];
  if (
    !sameArray(summary.targetReadAdmissibleVariants, expectedRead) ||
    !sameArray(summary.targetWriteAdmissibleVariants, []) ||
    !sameArray(summary.auditBlockedSingleAuthorityVariants, expectedAuditBlocked) ||
    !sameArray(summary.legacyHoldVariants, expectedLegacyHold)
  ) {
    fail("route-admission summary is invalid");
  }
  for (const variant of variants) {
    const expectedStatus = expectedRead.includes(variant.variantId)
      ? "target_read_admissible_now"
      : expectedAuditBlocked.includes(variant.variantId)
        ? "target_write_blocked_audit_delivery"
        : variant.routeAdmission;
    if (
      expectedRead.includes(variant.variantId) && variant.routeAdmission !== expectedStatus ||
      expectedAuditBlocked.includes(variant.variantId) && variant.routeAdmission !== expectedStatus ||
      expectedLegacyHold.includes(variant.variantId) && !variant.routeAdmission.startsWith("legacy_hold")
    ) {
      fail(`${variant.variantId} route status disagrees with summary`);
    }
  }

  const archiveVariants = variants.filter((variant) => variant.contractId === "WF-APP-05");
  if (
    archiveVariants.length !== 2 ||
    archiveVariants.some((variant) => !variant.routeAdmission.startsWith("legacy_hold")) ||
    manifest.providerPreconditionPolicy?.archiveBlockers?.routeEffect?.includes("remain legacy hold") !== true
  ) {
    fail("archive blocker TOCTOU is not fail-closed");
  }

  const retry = manifest.retryAndIdempotency || {};
  if (
    retry.externalKeyAccepted !== false ||
    retry.correlationIdIsIdempotencyKey !== false ||
    retry.automaticCommandRetry !== false ||
    !sameArray(retry.nonIdempotentCommands, ["WF-APP-03", "WF-APP-09"])
  ) {
    fail("retry/idempotency policy is invalid");
  }

  const reconciliation = manifest.reconciliationPolicy || {};
  if (
    !sameArray(reconciliation.triggerStates, ["committed_unacknowledged", "unknown"]) ||
    reconciliation.allowedActions?.length !== 3 ||
    reconciliation.forbiddenActions?.length !== 5 ||
    !reconciliation.runbookGate?.startsWith("WF-PRE-14")
  ) {
    fail("reconciliation policy is incomplete");
  }

  const risks = manifest.consistencyRisks || [];
  if (
    risks.length !== 5 ||
    !sameArray(risks.map((risk) => risk.id), [
      "WF-CONS-RISK-01", "WF-CONS-RISK-02", "WF-CONS-RISK-03",
      "WF-CONS-RISK-04", "WF-CONS-RISK-05",
    ]) ||
    risks.some((risk) => !["critical", "high"].includes(risk.severity) || !risk.issue || !risk.treatment)
  ) {
    fail("five exact consistency risks/treatments are required");
  }

  if (
    manifest.guards?.length !== 7 ||
    !sameArray(manifest.guards.map((guard) => guard.id), [
      "WF-CONS-GUARD-01", "WF-CONS-GUARD-02", "WF-CONS-GUARD-03",
      "WF-CONS-GUARD-04", "WF-CONS-GUARD-05", "WF-CONS-GUARD-06",
      "WF-CONS-GUARD-07",
    ]) ||
    !Array.isArray(manifest.temporaryTargetExceptions) ||
    manifest.temporaryTargetExceptions.length !== 0
  ) {
    fail("seven consistency guards and zero target exceptions are required");
  }

  const deferred = manifest.deferredDecisions || {};
  for (const id of ["WF-PRE-12", "WF-PRE-13", "WF-PRE-14", "WF-PRE-16"]) {
    if (!deferred[id]) fail(`${id} deferral is missing`);
  }

  const approvalRoles = new Set((manifest.approvals || []).map((approval) => approval.role));
  for (const role of [
    "Architecture Owner", "Workforce Module Owner", "Data Owner",
    "Identity & Access Owner", "Academic Groups Owner", "Lesson Delivery Owner",
    "Audit & History Owner", "Operations Owner", "Security Owner", "Quality Owner",
  ]) {
    if (!approvalRoles.has(role)) fail(`${role} approval is missing`);
  }

  console.log(
    `Workforce consistency PASS: model=${manifest.modelId}; sha256=${manifestHash}; variants=14/14; atomicUnits=5/5; readsAdmissible=4; writesAdmissible=0; auditBlocked=6; legacyHold=4; risks=5/5; guards=7/7; exceptions=0`,
  );
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
