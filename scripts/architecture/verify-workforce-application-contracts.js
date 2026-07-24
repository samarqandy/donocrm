#!/usr/bin/env node

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../..");
const MANIFEST_FILE = "architecture/workforce-application-contracts.json";
const DECISION_FILE = "docs/architecture/workforce-public-application-contracts.md";
const BASELINE_FILE = "architecture/workforce-contract-baseline.json";
const SEAMS_FILE = "architecture/workforce-context-seams.json";

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath));
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function fail(message) {
  throw new Error(`Workforce Application contract verification failed: ${message}`);
}

function sameArray(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function derivedFields(type, outputTypes) {
  if (!type.base) return type.fields;
  const base = outputTypes[type.base];
  if (!base) fail(`${type.base} base output type does not exist`);
  return derivedFields(base, outputTypes).filter((field) => !(type.omittedFields || []).includes(field));
}

function baselineMessages(operation) {
  return operation.semanticErrors.flatMap((error) => error.errors || [error.error]);
}

function verifyTypeCoverage(typeName, outputTypes) {
  const type = outputTypes[typeName];
  const typedFields = Object.values(type.fieldTypeGroups || {}).flat();
  if (
    typedFields.length !== type.fields.length ||
    new Set(typedFields).size !== typedFields.length ||
    !sameArray([...typedFields].sort(), [...type.fields].sort())
  ) {
    fail(`${typeName} scalar type coverage is not exact`);
  }
}

function main() {
  const manifestBytes = read(MANIFEST_FILE);
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  const decision = read(DECISION_FILE).toString("utf8");
  const baseline = JSON.parse(read(BASELINE_FILE).toString("utf8"));
  const seams = JSON.parse(read(SEAMS_FILE).toString("utf8"));

  if (
    manifest.schemaVersion !== 1 ||
    manifest.decisionId !== "WF-PRE-09" ||
    manifest.status !== "approved" ||
    manifest.contractVersion !== "1.0.0"
  ) {
    fail("identity, status, or version metadata is invalid");
  }

  const manifestHash = sha256(manifestBytes);
  if (!decision.includes(manifestHash)) fail("decision does not contain the current manifest SHA-256");

  const fingerprints = Object.entries(manifest.sourceFingerprints || {});
  if (fingerprints.length !== 6) fail(`expected 6 evidence fingerprints, found ${fingerprints.length}`);
  for (const [sourceFile, expectedHash] of fingerprints) {
    if (sha256(read(sourceFile)) !== expectedHash) fail(`${sourceFile} evidence fingerprint changed`);
  }

  const expectedSurfaces = [
    ["WorkforceCompatibilityApplicationV1", "WorkforceActorContextV1", 10],
    ["TeacherReferenceApplicationV1", "WorkforceServiceContextV1", 1],
  ];
  if (manifest.surfaces?.length !== 2) fail("exactly two public Application surfaces are required");
  expectedSurfaces.forEach(([name, contextType, count], index) => {
    const surface = manifest.surfaces[index];
    if (
      surface.name !== name ||
      surface.contextType !== contextType ||
      surface.contractIds?.length !== count
    ) {
      fail(`${name} surface is invalid`);
    }
  });

  const actorContext = manifest.contextTypes?.WorkforceActorContextV1;
  if (
    !sameArray(actorContext?.fields, ["tenantId", "actorUserId", "role", "permissions", "correlationId"]) ||
    actorContext.fieldTypes.role !== "admin|teacher"
  ) {
    fail("WorkforceActorContextV1 is not exact");
  }
  const serviceContext = manifest.contextTypes?.WorkforceServiceContextV1;
  if (
    !sameArray(serviceContext?.fields, ["tenantId", "caller", "correlationId"]) ||
    serviceContext.callerValues?.length !== 7
  ) {
    fail("WorkforceServiceContextV1 is not exact");
  }

  const contracts = manifest.contracts || [];
  if (contracts.length !== 11) fail(`expected 11 public contracts, found ${contracts.length}`);
  const compatibilityContracts = contracts.filter((contract) => contract.id.startsWith("WF-APP-"));
  const referenceContracts = contracts.filter((contract) => contract.id.startsWith("WF-REF-"));
  const expectedApplicationIds = baseline.operations.map((_, index) => `WF-APP-${String(index + 1).padStart(2, "0")}`);
  if (
    !sameArray(compatibilityContracts.map((contract) => contract.id), expectedApplicationIds) ||
    !sameArray(
      compatibilityContracts.map((contract) => contract.legacyOperationId),
      baseline.operations.map((operation) => operation.id),
    )
  ) {
    fail("compatibility contracts do not cover the frozen operations in order");
  }
  if (referenceContracts.length !== 1 || referenceContracts[0].id !== "WF-REF-01") {
    fail("the downstream reference surface must expose only WF-REF-01");
  }
  if (new Set(contracts.map((contract) => contract.method)).size !== contracts.length) {
    fail("public method names must be unique");
  }

  const inputTypes = manifest.inputTypes || {};
  const outputTypes = manifest.outputTypes || {};
  const errorCatalog = manifest.semanticErrorCatalog || {};
  const seamByOperation = new Map(
    seams.operationSeamDisposition.map((item) => [item.operationId, item.seamIds]),
  );
  for (const contract of contracts) {
    if (!["query", "command"].includes(contract.kind)) fail(`${contract.id} kind is invalid`);
    if (!contract.signature?.includes(`${contract.method}(`)) fail(`${contract.id} signature is missing`);
    if (!inputTypes[contract.inputType]) fail(`${contract.id} input type does not exist`);
    if (!Array.isArray(contract.outputTypes) || contract.outputTypes.some((type) => !outputTypes[type])) {
      fail(`${contract.id} output type does not exist`);
    }
    if (!contract.authorization?.owner || !contract.authorization.scope) {
      fail(`${contract.id} authorization is incomplete`);
    }
    if ((contract.semanticErrors || []).some((code) => !errorCatalog[code])) {
      fail(`${contract.id} references an unknown semantic error`);
    }
    const idempotency = contract.idempotency || {};
    if (idempotency.keyAccepted !== false || typeof idempotency.automaticRetry !== "boolean") {
      fail(`${contract.id} idempotency contract is incomplete`);
    }
    if (contract.kind === "command" && idempotency.automaticRetry !== false) {
      fail(`${contract.id} command cannot promise automatic retry before WF-PRE-11`);
    }
    if (contract.legacyOperationId) {
      const expectedSeams = seamByOperation.get(contract.legacyOperationId);
      if (!sameArray(contract.seamIds, expectedSeams)) fail(`${contract.id} seam disposition changed`);
    }
  }

  const teacherAdmin = outputTypes.TeacherAdminViewV1.fields;
  const teacherSelf = derivedFields(outputTypes.TeacherSelfViewV1, outputTypes);
  const workingHour = outputTypes.TeacherWorkingHourViewV1.fields;
  const groupAdmin = outputTypes.TeacherProfileGroupAdminViewV1.fields;
  const groupSelf = derivedFields(outputTypes.TeacherProfileGroupSelfViewV1, outputTypes);
  const lesson = outputTypes.TeacherProfileLessonViewV1.fields;
  for (const typeName of [
    "TeacherAdminViewV1",
    "TeacherWorkingHourViewV1",
    "TeacherProfileGroupAdminViewV1",
    "TeacherProfileLessonViewV1",
  ]) {
    verifyTypeCoverage(typeName, outputTypes);
  }
  if (!sameArray(teacherAdmin, baseline.responseDtos.TeacherAdmin.fields)) {
    fail("TeacherAdminViewV1 differs from the frozen response DTO");
  }
  if (
    !sameArray(
      teacherSelf,
      baseline.responseDtos.TeacherAdmin.fields.filter(
        (field) => !baseline.responseDtos.TeacherSelf.omittedFields.includes(field),
      ),
    )
  ) {
    fail("TeacherSelfViewV1 privacy projection is invalid");
  }
  if (!sameArray(workingHour, baseline.responseDtos.TeacherWorkingHour.fields)) {
    fail("TeacherWorkingHourViewV1 differs from the frozen response DTO");
  }
  if (!sameArray(groupAdmin, baseline.responseDtos.TeacherProfileGroup.fields)) {
    fail("TeacherProfileGroupAdminViewV1 differs from the frozen response DTO");
  }
  if (
    groupSelf.includes("monthlyFee") ||
    groupSelf.length !== groupAdmin.length - 1 ||
    teacherSelf.includes("username") ||
    teacherSelf.includes("accessStatus") ||
    !teacherSelf.includes("hasAccess")
  ) {
    fail("role-sensitive privacy projections are invalid");
  }
  if (!sameArray(lesson, baseline.responseDtos.TeacherProfileLesson.fields)) {
    fail("TeacherProfileLessonViewV1 differs from the frozen response DTO");
  }

  const reference = outputTypes.TeacherReferenceV1;
  if (!sameArray(reference.fields, ["tenantId", "teacherId", "displayName", "status", "branchId"])) {
    fail("TeacherReferenceV1 must contain exactly five approved fields");
  }
  const forbiddenReferenceFields = [
    "phone", "email", "username", "password", "maxWeeklyMinutes", "weeklyMinutes",
    "groupsCount", "studentsCount", "monthlyFee", "financialStatus",
  ];
  if (forbiddenReferenceFields.some((field) => reference.fields.includes(field))) {
    fail("TeacherReferenceV1 leaks a forbidden field");
  }

  const messageToError = new Map(
    Object.entries(errorCatalog)
      .filter(([, error]) => error.legacyMessage)
      .map(([code, error]) => [error.legacyMessage, { code, status: error.httpStatus }]),
  );
  for (const operation of baseline.operations) {
    for (const message of baselineMessages(operation)) {
      const catalogError = messageToError.get(message);
      const baselineStatus = operation.semanticErrors.find((error) =>
        (error.errors || [error.error]).includes(message),
      ).status;
      if (!catalogError || catalogError.status !== baselineStatus) {
        fail(`${operation.id} legacy semantic error is not mapped exactly: ${message}`);
      }
    }
  }

  const workingHourCreate = contracts.find((contract) => contract.id === "WF-APP-09");
  const branchDelta = manifest.intentionalTargetDeltas?.find(
    (delta) => delta.id === "WF-APP-DELTA-01",
  );
  const privacyDelta = manifest.intentionalTargetDeltas?.find(
    (delta) => delta.id === "WF-APP-DELTA-02",
  );
  if (
    !workingHourCreate.semanticErrors.includes("BRANCH_INVALID") ||
    branchDelta?.legacyRiskId !== "WF-SEAM-RISK-01" ||
    privacyDelta?.legacyRiskId !== "WF-CONTRACT-RISK-01" ||
    branchDelta.runtimeEffectNow !== "None; legacy HTTP/runtime remains unchanged." ||
    privacyDelta.runtimeEffectNow !== "None; legacy HTTP/runtime remains unchanged."
  ) {
    fail("governed Working Hour Branch/privacy target deltas are incomplete");
  }

  if (manifest.transportBoundaryErrors?.length !== 5) {
    fail("five adapter/middleware boundary error classes are required");
  }
  if (
    manifest.technicalErrorUnion?.length !== 2 ||
    !sameArray(manifest.technicalErrorUnion.map((error) => error.code), [
      "WORKFORCE_UNAVAILABLE",
      "WORKFORCE_FAILURE",
    ])
  ) {
    fail("technical error union is invalid");
  }

  const deferred = manifest.deferredDecisions || {};
  for (const id of ["WF-PRE-10", "WF-PRE-11", "WF-PRE-12", "WF-PRE-13", "WF-PRE-14"]) {
    if (!deferred[id]) fail(`${id} deferral is missing`);
  }

  const approvalRoles = new Set((manifest.approvals || []).map((approval) => approval.role));
  for (const role of [
    "Architecture Owner",
    "Workforce Module Owner",
    "Product Authority",
    "Identity & Access Owner",
    "Organization & Branches Owner",
    "Academic Groups Owner",
    "Scheduling Owner",
    "Lesson Delivery Owner",
    "Attendance Owner",
    "Lesson Finance & Payroll Owner",
    "Security Owner",
    "Quality Owner",
  ]) {
    if (!approvalRoles.has(role)) fail(`${role} approval is missing`);
  }

  console.log(
    `Workforce Application contracts PASS: manifest=${manifest.contractSetId}; sha256=${manifestHash}; surfaces=2/2; compatibility=10/10; downstream=1/1; semanticErrors=${Object.keys(errorCatalog).length}; targetDeltas=2/2`,
  );
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
