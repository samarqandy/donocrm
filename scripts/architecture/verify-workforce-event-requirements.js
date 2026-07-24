#!/usr/bin/env node

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../..");
const MANIFEST_FILE = "architecture/workforce-event-requirements.json";
const DECISION_FILE = "docs/architecture/workforce-event-requirements.md";
const APPLICATION_FILE = "architecture/workforce-application-contracts.json";
const PORTS_FILE = "architecture/workforce-focused-ports.json";
const SEAMS_FILE = "architecture/workforce-context-seams.json";
const CONSISTENCY_FILE = "architecture/workforce-consistency-model.json";

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath));
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function fail(message) {
  throw new Error(`Workforce event-requirements verification failed: ${message}`);
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
  const ports = JSON.parse(read(PORTS_FILE).toString("utf8"));
  const seams = JSON.parse(read(SEAMS_FILE).toString("utf8"));
  const consistency = JSON.parse(read(CONSISTENCY_FILE).toString("utf8"));

  if (
    manifest.schemaVersion !== 1 ||
    manifest.decisionId !== "WF-PRE-12" ||
    manifest.status !== "approved" ||
    manifest.catalogVersion !== "1.0.0"
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

  const policy = manifest.eventPolicy || {};
  for (const field of [
    "decisionRule", "currentEvidence", "firstExtraction", "versioning", "delivery",
    "migrationEvents", "futureChange", "routeEffect",
  ]) {
    if (!policy[field]) fail(`eventPolicy.${field} is missing`);
  }
  if (
    !policy.firstExtraction.includes("No Workforce integration event is approved") ||
    !policy.delivery.includes("migration_outbox") ||
    !policy.routeEffect.includes("authorizes no runtime route")
  ) {
    fail("no-event, infrastructure, or route policy is weakened");
  }

  for (const field of ["publishedEvents", "consumedEvents", "approvedEventVersions"]) {
    if (!Array.isArray(manifest[field]) || manifest[field].length !== 0) {
      fail(`${field} must be an approved empty catalog`);
    }
  }

  const decisions = manifest.dependencyDecisions || [];
  const expectedDecisionIds = Array.from(
    { length: 19 },
    (_, index) => `WF-EVENT-DEP-${String(index + 1).padStart(2, "0")}`,
  );
  if (!sameArray(decisions.map((item) => item.id), expectedDecisionIds)) {
    fail("the exact 19 dependency dispositions changed");
  }
  for (const item of decisions) {
    if (
      !["upstream", "downstream", "internal_consumer"].includes(item.relationship) ||
      !["synchronous_context", "synchronous_query", "synchronous_command"].includes(item.mode) ||
      item.eventDecision !== "no_event" ||
      !item.providerContext ||
      !item.consumerContext ||
      !item.capability ||
      !item.contractRef ||
      !Array.isArray(item.portIds) ||
      !Array.isArray(item.seamIds) ||
      !item.reason ||
      !Array.isArray(item.evidence) ||
      item.evidence.length === 0
    ) {
      fail(`${item.id} dependency disposition is incomplete`);
    }
  }

  const portById = new Map(ports.ports.map((port) => [port.id, port]));
  const providerPortIds = ports.ports
    .filter((port) => port.category === "provider_command" || port.category === "provider_query")
    .map((port) => port.id);
  const dispositionPortIds = decisions.flatMap((item) => item.portIds);
  if (!sameSet(dispositionPortIds, providerPortIds) || dispositionPortIds.length !== providerPortIds.length) {
    fail("every PRE-10 provider port must have exactly one dependency disposition");
  }
  for (const item of decisions) {
    for (const portId of item.portIds) {
      const port = portById.get(portId);
      if (!port) fail(`${item.id} references unknown port ${portId}`);
      if (port.providerContext !== item.providerContext) {
        fail(`${item.id} provider differs from ${portId}`);
      }
      const expectedMode = port.category === "provider_command"
        ? "synchronous_command"
        : "synchronous_query";
      if (item.mode !== expectedMode) fail(`${item.id} mode differs from ${portId}`);
    }
  }

  const seamIds = new Set(seams.seams.map((seam) => seam.id));
  for (const item of decisions) {
    for (const seamId of item.seamIds) {
      if (!seamIds.has(seamId)) fail(`${item.id} references unknown seam ${seamId}`);
    }
  }
  const coveredSeams = new Set(decisions.flatMap((item) => item.seamIds));
  if (!seams.seams.every((seam) => coveredSeams.has(seam.id))) {
    fail("all seven PRE-07 seams must have a dependency disposition");
  }

  const referenceContract = application.contracts.find((contract) => contract.id === "WF-REF-01");
  if (!referenceContract) fail("WF-REF-01 is missing");
  const serviceCallers = referenceContract.authorization?.serviceCallers || [];
  const referenceDecisions = decisions.filter(
    (item) => item.contractRef === "TeacherReferenceApplicationV1.getTeacherReference",
  );
  if (
    referenceDecisions.length !== 7 ||
    !sameSet(referenceDecisions.map((item) => item.consumerContext), serviceCallers) ||
    referenceDecisions.some(
      (item) =>
        item.providerContext !== "workforce" ||
        item.mode !== "synchronous_query" ||
        item.eventDecision !== "no_event",
    )
  ) {
    fail("WF-REF-01 service callers are not exactly covered");
  }

  const audit = manifest.auditDeliveryDecision || {};
  if (
    audit.seamId !== "WF-SEAM-07" ||
    audit.portId !== "WF-PORT-PROV-11" ||
    audit.mode !== "synchronous_required_acceptance" ||
    audit.eventReplacement !== false ||
    audit.publisher !== null ||
    audit.eventName !== null ||
    audit.eventVersion !== null ||
    !audit.ordering?.startsWith("After the authoritative provider-local business commit") ||
    !audit.acceptance?.includes("Audit & History returns success") ||
    !audit.businessTransaction?.includes("cannot roll back") ||
    !audit.explicitFailure?.includes("committed_unacknowledged") ||
    !audit.ambiguousFailure?.includes("committed_unacknowledged") ||
    !audit.retry?.startsWith("Never retry") ||
    !audit.reconciliation?.includes("no direct audit_logs SQL") ||
    !audit.reliabilityLimit?.includes("not an atomic durable handoff") ||
    audit.targetMutationRoutesEnabled !== 0
  ) {
    fail("Audit synchronous acceptance decision is incomplete or weakened");
  }

  const supersession = manifest.consistencySupersession || {};
  const expectedResolvedVariants = [
    "WF-CONS-03A", "WF-CONS-04A", "WF-CONS-06",
    "WF-CONS-07", "WF-CONS-09", "WF-CONS-10",
  ];
  const expectedLegacyHolds = ["WF-CONS-03B", "WF-CONS-04B", "WF-CONS-05A", "WF-CONS-05B"];
  if (
    supersession.sourceDecision !== "WF-PRE-11" ||
    supersession.resolvedRiskId !== "WF-CONS-RISK-02" ||
    !sameArray(supersession.resolvedVariantIds, expectedResolvedVariants) ||
    supersession.newDisposition !== "target_write_pending_later_gates" ||
    !sameArray(supersession.remainingReleaseGates, ["WF-PRE-13", "WF-PRE-14", "WF-PRE-16"]) ||
    !sameArray(supersession.legacyHoldVariantIds, expectedLegacyHolds)
  ) {
    fail("PRE-11 Audit-condition supersession is invalid");
  }
  const consistencyVariants = new Map(
    consistency.variantConsistencyMatrix.map((variant) => [variant.variantId, variant]),
  );
  for (const variantId of expectedResolvedVariants) {
    const variant = consistencyVariants.get(variantId);
    if (
      variant?.routeAdmission !== "target_write_blocked_audit_delivery" ||
      !variant.releaseGates.includes("WF-PRE-12")
    ) {
      fail(`${variantId} is not an exact PRE-11 Audit-blocked variant`);
    }
  }
  for (const variantId of expectedLegacyHolds) {
    if (!consistencyVariants.get(variantId)?.routeAdmission.startsWith("legacy_hold")) {
      fail(`${variantId} is not preserved as a PRE-11 legacy hold`);
    }
  }

  const risks = manifest.eventRisks || [];
  if (
    risks.length !== 4 ||
    !sameArray(risks.map((risk) => risk.id), [
      "WF-EVENT-RISK-01", "WF-EVENT-RISK-02", "WF-EVENT-RISK-03", "WF-EVENT-RISK-04",
    ]) ||
    risks.some((risk) => risk.severity !== "high" || !risk.issue || !risk.treatment)
  ) {
    fail("four exact event risks/treatments are required");
  }

  if (
    manifest.guards?.length !== 7 ||
    !sameArray(manifest.guards.map((guard) => guard.id), [
      "WF-EVENT-GUARD-01", "WF-EVENT-GUARD-02", "WF-EVENT-GUARD-03",
      "WF-EVENT-GUARD-04", "WF-EVENT-GUARD-05", "WF-EVENT-GUARD-06",
      "WF-EVENT-GUARD-07",
    ]) ||
    !Array.isArray(manifest.temporaryEventExceptions) ||
    manifest.temporaryEventExceptions.length !== 0
  ) {
    fail("seven event guards and zero event exceptions are required");
  }

  const deferred = manifest.deferredDecisions || {};
  for (const id of ["WF-PRE-13", "WF-PRE-14", "WF-PRE-16", "future-event-revision"]) {
    if (!deferred[id]) fail(`deferred decision ${id} is missing`);
  }

  const requiredApprovalRoles = [
    "Architecture Owner", "Workforce Module Owner", "Identity & Access Owner",
    "Organization & Branches Owner", "Academic Groups Owner", "Scheduling Owner",
    "Lesson Delivery Owner", "Student Information Owner", "Attendance Owner",
    "Lesson Finance & Payroll Owner", "Reporting & Export Owner", "Audit & History Owner",
    "Data Owner", "Operations Owner", "Security Owner", "Quality Owner",
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
    fail("required owner approvals are incomplete");
  }

  for (const text of [
    "WF-PRE-12: PASSED",
    "19/19",
    "zero published events",
    "zero consumed events",
    "synchronous mandatory Audit acceptance",
    "committed_unacknowledged",
    "zero target mutation routes",
    "WF-PRE-13",
  ]) {
    if (!decision.includes(text)) fail(`decision is missing required statement: ${text}`);
  }

  console.log(
    `Workforce event requirements verified: ${decisions.length}/19 dependency dispositions, ` +
    `${providerPortIds.length}/11 provider ports, ${referenceDecisions.length}/7 reference consumers, ` +
    "0 published events, 0 consumed events, synchronous Audit acceptance, 0 target mutation routes, " +
    `${manifest.temporaryEventExceptions.length} exceptions.`,
  );
}

main();
