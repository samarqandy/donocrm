#!/usr/bin/env node

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../..");
const MANIFEST_FILE = "architecture/workforce-context-seams.json";
const DECISION_FILE = "docs/architecture/workforce-bounded-context-seams.md";
const CONTRACT_FILE = "architecture/workforce-contract-baseline.json";
const EXPECTED_SEAMS = [
  "WF-SEAM-01",
  "WF-SEAM-02",
  "WF-SEAM-03",
  "WF-SEAM-04",
  "WF-SEAM-05",
  "WF-SEAM-06",
  "WF-SEAM-07",
];
const ALLOWED_MODES = new Set(["synchronous_command", "synchronous_query", "synchronous_composed_query"]);

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath));
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function fail(message) {
  throw new Error(`Workforce context seam verification failed: ${message}`);
}

function main() {
  const manifestBytes = read(MANIFEST_FILE);
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  const decision = read(DECISION_FILE).toString("utf8");
  const contract = JSON.parse(read(CONTRACT_FILE).toString("utf8"));

  if (manifest.schemaVersion !== 1 || manifest.decisionId !== "WF-PRE-07" || manifest.status !== "approved") {
    fail("identity/status metadata is invalid");
  }

  const manifestHash = sha256(manifestBytes);
  if (!decision.includes(manifestHash)) fail("decision does not contain the current seam manifest SHA-256");

  const fingerprints = Object.entries(manifest.sourceFingerprints || {});
  if (fingerprints.length !== 8) fail(`expected 8 evidence fingerprints, found ${fingerprints.length}`);
  for (const [sourceFile, expectedHash] of fingerprints) {
    if (sha256(read(sourceFile)) !== expectedHash) fail(`${sourceFile} evidence fingerprint changed`);
  }

  const policy = manifest.architecturePolicy || {};
  for (const field of [
    "coordinationOwner",
    "coordinationPlacement",
    "coordinationAuthority",
    "dependencyRule",
    "cycleRule",
    "transactionRule",
    "eventRule",
    "legacyRule",
  ]) {
    if (!policy[field]) fail(`architecturePolicy.${field} is missing`);
  }

  const contexts = manifest.contexts || [];
  const contextIds = new Set(contexts.map((context) => context.id));
  if (contexts.length !== 8 || contextIds.size !== 8) fail("exactly 8 unique participating contexts are required");
  for (const context of contexts) {
    if (!context.name || !Array.isArray(context.owns) || context.owns.length === 0) {
      fail(`${context.id || "<unknown>"} context ownership is incomplete`);
    }
  }

  const seams = manifest.seams || [];
  const seamIds = seams.map((seam) => seam.id);
  if (JSON.stringify(seamIds) !== JSON.stringify(EXPECTED_SEAMS)) {
    fail("the seven required seam IDs must be present in order");
  }

  for (const seam of seams) {
    for (const field of [
      "capability",
      "coordinator",
      "direction",
      "mode",
      "authority",
      "interaction",
      "failurePolicy",
      "consistencyBoundary",
      "transition",
    ]) {
      if (!seam[field] || (typeof seam[field] === "object" && Object.keys(seam[field]).length === 0)) {
        fail(`${seam.id}.${field} is missing`);
      }
    }
    if (!ALLOWED_MODES.has(seam.mode)) fail(`${seam.id} has an unapproved communication mode`);
    if (!Array.isArray(seam.providers) || seam.providers.length === 0) fail(`${seam.id} has no provider`);
    if (seam.providers.some((provider) => !contextIds.has(provider))) fail(`${seam.id} references an unknown provider`);
    if (!Array.isArray(seam.operations) || seam.operations.length === 0) fail(`${seam.id} has no operation mapping`);
    if (!Array.isArray(seam.forbidden) || seam.forbidden.length < 3) fail(`${seam.id} needs at least 3 forbidden shortcuts`);
    if (!Array.isArray(seam.legacyEvidence) || seam.legacyEvidence.length === 0) fail(`${seam.id} has no legacy evidence`);
  }

  const contractOperationIds = contract.operations.map((operation) => operation.id);
  const dispositions = manifest.operationSeamDisposition || [];
  if (
    dispositions.length !== 10 ||
    JSON.stringify(dispositions.map((item) => item.operationId)) !== JSON.stringify(contractOperationIds)
  ) {
    fail("all 10 frozen operations must have a seam disposition in contract order");
  }
  for (const disposition of dispositions) {
    if (!Array.isArray(disposition.seamIds)) fail(`${disposition.operationId} seamIds must be an array`);
    if (disposition.seamIds.some((id) => !EXPECTED_SEAMS.includes(id))) {
      fail(`${disposition.operationId} references an unknown seam`);
    }
    if (disposition.seamIds.length === 0 && !disposition.reason) {
      fail(`${disposition.operationId} needs a reason when no cross-context seam applies`);
    }
  }

  const risks = manifest.blockingRisks || [];
  const requiredRisks = new Set(["WF-SEAM-RISK-01", "WF-CONTRACT-RISK-01", "WF-SEAM-RISK-02", "WF-SEAM-RISK-03"]);
  if (risks.length !== requiredRisks.size || risks.some((risk) => !requiredRisks.has(risk.id))) {
    fail("the four required blocking risks are not registered");
  }
  for (const risk of risks) {
    if (!EXPECTED_SEAMS.includes(risk.seamId) || risk.severity !== "high" || !risk.issue || !risk.treatment) {
      fail(`${risk.id} risk metadata/treatment is incomplete`);
    }
  }

  const deferred = Object.keys(manifest.deferredDecisions || {});
  const expectedDeferred = ["WF-PRE-08", "WF-PRE-09", "WF-PRE-10", "WF-PRE-11", "WF-PRE-12", "WF-PRE-13", "WF-PRE-14"];
  if (JSON.stringify(deferred) !== JSON.stringify(expectedDeferred)) {
    fail("follow-on gate ownership must remain explicit for WF-PRE-08 through WF-PRE-14");
  }

  const approverRoles = new Set((manifest.approvals || []).map((approval) => approval.role));
  for (const role of [
    "Architecture Owner",
    "Workforce Module Owner",
    "Identity & Access Owner",
    "Organization & Branches Owner",
    "Academic Groups Owner",
    "Lesson Delivery Owner",
    "Audit & History Owner",
    "Security Owner",
  ]) {
    if (!approverRoles.has(role)) fail(`${role} approval is missing`);
  }

  console.log(
    `Workforce context seams PASS: model=${manifest.seamModelId}; sha256=${manifestHash}; contexts=8/8; seams=7/7; operations=10/10; risks=4/4; sources=8/8`,
  );
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
