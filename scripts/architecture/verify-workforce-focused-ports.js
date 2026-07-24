#!/usr/bin/env node

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../..");
const MANIFEST_FILE = "architecture/workforce-focused-ports.json";
const DECISION_FILE = "docs/architecture/workforce-focused-ports.md";
const APPLICATION_FILE = "architecture/workforce-application-contracts.json";
const SEAMS_FILE = "architecture/workforce-context-seams.json";
const ACCESS_FILE = "architecture/workforce-table-access-manifest.json";
const TABLES_FILE = "architecture/tables.yaml";

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath));
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function fail(message) {
  throw new Error(`Workforce focused-port verification failed: ${message}`);
}

function sameArray(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sameSet(left, right) {
  return left.length === right.length && left.every((value) => right.includes(value));
}

function fieldsOf(contractName, manifest, application) {
  const local = manifest.dataContracts[contractName];
  if (local?.fields) return local.fields;
  if (local?.base) return fieldsOf(local.base, manifest, application);
  const publicType = application.outputTypes[contractName];
  if (publicType?.fields) return publicType.fields;
  fail(`${contractName} data contract does not exist`);
}

function main() {
  const manifestBytes = read(MANIFEST_FILE);
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  const decision = read(DECISION_FILE).toString("utf8");
  const application = JSON.parse(read(APPLICATION_FILE).toString("utf8"));
  const seams = JSON.parse(read(SEAMS_FILE).toString("utf8"));
  const access = JSON.parse(read(ACCESS_FILE).toString("utf8"));
  const globalTables = JSON.parse(read(TABLES_FILE).toString("utf8")).tables;

  if (
    manifest.schemaVersion !== 1 ||
    manifest.decisionId !== "WF-PRE-10" ||
    manifest.status !== "approved" ||
    manifest.portCatalogVersion !== "1.0.0"
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

  if (
    !sameArray(
      manifest.contexts?.WorkforcePersistenceContextV1?.fields,
      ["tenantId", "correlationId"],
    ) ||
    !sameArray(
      manifest.contexts?.WorkforcePortCallContextV1?.fields,
      ["tenantId", "caller", "correlationId"],
    )
  ) {
    fail("owned/provider port contexts are not exact");
  }

  const ports = manifest.ports || [];
  const expectedPortIds = [
    "WF-PORT-OWN-01", "WF-PORT-OWN-02", "WF-PORT-OWN-03", "WF-PORT-OWN-04",
    "WF-PORT-OWN-05", "WF-PORT-PROV-01", "WF-PORT-PROV-02", "WF-PORT-PROV-03",
    "WF-PORT-PROV-04", "WF-PORT-PROV-05", "WF-PORT-PROV-06", "WF-PORT-PROV-07",
    "WF-PORT-PROV-08", "WF-PORT-PROV-09", "WF-PORT-PROV-10", "WF-PORT-PROV-11",
    "WF-PORT-SYS-01", "WF-PORT-SYS-02",
  ];
  if (!sameArray(ports.map((port) => port.id), expectedPortIds)) {
    fail("the exact 18-port catalog/order changed");
  }
  if (
    new Set(ports.map((port) => port.name)).size !== ports.length ||
    new Set(ports.map((port) => port.id)).size !== ports.length
  ) {
    fail("port IDs/names must be unique");
  }

  const categoryCounts = ports.reduce((counts, port) => {
    counts[port.category] = (counts[port.category] || 0) + 1;
    return counts;
  }, {});
  const expectedCategoryCounts = {
    owned_repository: 2,
    owned_query: 3,
    provider_command: 3,
    provider_query: 8,
    system: 2,
  };
  if (JSON.stringify(categoryCounts) !== JSON.stringify(expectedCategoryCounts)) {
    fail(`port category counts are invalid: ${JSON.stringify(categoryCounts)}`);
  }

  const portById = new Map(ports.map((port) => [port.id, port]));
  const seamById = new Map(seams.seams.map((seam) => [seam.id, seam]));
  const ownedTables = new Set(["teachers", "teacher_working_hours"]);
  for (const port of ports) {
    if (!port.interfaceOwner || !port.providerContext || !port.implementationBoundary) {
      fail(`${port.id} boundary metadata is incomplete`);
    }
    if (!Array.isArray(port.methods) || port.methods.length === 0 || port.methods.length > 5) {
      fail(`${port.id} must expose 1..5 cohesive methods`);
    }
    if (new Set(port.methods.map((method) => method.name)).size !== port.methods.length) {
      fail(`${port.id} method names are duplicated`);
    }
    for (const method of port.methods) {
      if (
        !["read", "write"].includes(method.mode) ||
        !method.signature?.startsWith(`${method.name}(`) ||
        /(^|[A-Z])(execute|rawSql|table|database|transaction|arbitrary)([A-Z]|$)/i.test(method.name)
      ) {
        fail(`${port.id}.${method.name || "<unknown>"} is invalid or unbounded`);
      }
    }
    if (!Array.isArray(port.allowedDirectTables) || !Array.isArray(port.providerAuthorityTables)) {
      fail(`${port.id} table boundaries are incomplete`);
    }
    if (port.category.startsWith("owned_")) {
      if (
        port.providerContext !== "workforce" ||
        port.allowedDirectTables.length === 0 ||
        port.allowedDirectTables.some((table) => !ownedTables.has(table))
      ) {
        fail(`${port.id} owned-table boundary is invalid`);
      }
    } else if (port.allowedDirectTables.length !== 0) {
      fail(`${port.id} non-owned port cannot allow direct table access`);
    }
    for (const table of port.providerAuthorityTables) {
      if (!globalTables[table]) fail(`${port.id} references unknown authority table ${table}`);
      const expectedOwner = port.providerContext === "workforce" ? "workforce" : port.providerContext;
      if (globalTables[table].owner !== expectedOwner) {
        fail(`${port.id}/${table} provider authority conflicts with architecture/tables.yaml`);
      }
    }
    for (const seamId of port.seamIds || []) {
      const seam = seamById.get(seamId);
      if (!seam) fail(`${port.id} references unknown seam ${seamId}`);
      if (!seam.providers.includes(port.providerContext)) {
        fail(`${port.id} provider ${port.providerContext} is not authoritative in ${seamId}`);
      }
    }
    if (!Array.isArray(port.forbidden) || port.forbidden.length === 0) {
      fail(`${port.id} has no explicit negative boundary`);
    }
  }

  const ownedRepositories = ports.filter((port) => port.category === "owned_repository");
  if (
    !sameArray(ownedRepositories[0].allowedDirectTables, ["teachers"]) ||
    !sameArray(ownedRepositories[1].allowedDirectTables, ["teacher_working_hours"])
  ) {
    fail("owned repository table split is invalid");
  }
  const allAllowedTables = [...new Set(ports.flatMap((port) => port.allowedDirectTables))];
  if (!sameSet(allAllowedTables, ["teachers", "teacher_working_hours"])) {
    fail("the port catalog direct-table allowlist must contain only two Workforce tables");
  }

  const foreignDirectTables = access.tables
    .filter((table) => table.classification === "foreign_direct")
    .map((table) => table.table);
  for (const tableName of foreignDirectTables) {
    const owner = globalTables[tableName].owner;
    const coveringPorts = ports.filter(
      (port) =>
        port.providerContext === owner &&
        port.providerAuthorityTables.includes(tableName) &&
        port.allowedDirectTables.length === 0,
    );
    if (coveringPorts.length === 0) {
      fail(`${tableName} has no focused provider port treatment`);
    }
  }

  const expectedMatrix = {
    "WF-APP-01": ["WF-PORT-OWN-03", "WF-PORT-PROV-03", "WF-PORT-PROV-06", "WF-PORT-PROV-07", "WF-PORT-PROV-09", "WF-PORT-PROV-10"],
    "WF-APP-02": ["WF-PORT-OWN-04", "WF-PORT-OWN-02", "WF-PORT-PROV-03", "WF-PORT-PROV-06", "WF-PORT-PROV-07", "WF-PORT-PROV-09", "WF-PORT-PROV-10"],
    "WF-APP-03": ["WF-PORT-OWN-01", "WF-PORT-PROV-01", "WF-PORT-PROV-03", "WF-PORT-PROV-04", "WF-PORT-PROV-06", "WF-PORT-PROV-07", "WF-PORT-PROV-09", "WF-PORT-PROV-10", "WF-PORT-PROV-11", "WF-PORT-SYS-01", "WF-PORT-SYS-02"],
    "WF-APP-04": ["WF-PORT-OWN-01", "WF-PORT-PROV-01", "WF-PORT-PROV-03", "WF-PORT-PROV-04", "WF-PORT-PROV-06", "WF-PORT-PROV-07", "WF-PORT-PROV-09", "WF-PORT-PROV-10", "WF-PORT-PROV-11"],
    "WF-APP-05": ["WF-PORT-OWN-01", "WF-PORT-PROV-01", "WF-PORT-PROV-03", "WF-PORT-PROV-05", "WF-PORT-PROV-06", "WF-PORT-PROV-07", "WF-PORT-PROV-08", "WF-PORT-PROV-09", "WF-PORT-PROV-10", "WF-PORT-PROV-11"],
    "WF-APP-06": ["WF-PORT-OWN-01", "WF-PORT-PROV-03", "WF-PORT-PROV-06", "WF-PORT-PROV-07", "WF-PORT-PROV-09", "WF-PORT-PROV-10", "WF-PORT-PROV-11"],
    "WF-APP-07": ["WF-PORT-OWN-05", "WF-PORT-PROV-02", "WF-PORT-PROV-11"],
    "WF-APP-08": ["WF-PORT-OWN-02", "WF-PORT-OWN-03"],
    "WF-APP-09": ["WF-PORT-OWN-05", "WF-PORT-OWN-02", "WF-PORT-PROV-04", "WF-PORT-PROV-11", "WF-PORT-SYS-01", "WF-PORT-SYS-02"],
    "WF-APP-10": ["WF-PORT-OWN-02", "WF-PORT-PROV-11"],
    "WF-REF-01": ["WF-PORT-OWN-05"],
  };
  const applicationIds = application.contracts.map((contract) => contract.id);
  const matrix = manifest.operationPortMatrix || [];
  if (
    matrix.length !== 11 ||
    !sameArray(matrix.map((entry) => entry.contractId), applicationIds)
  ) {
    fail("operation-port matrix must cover all 11 public contracts in order");
  }
  for (const entry of matrix) {
    if (!sameArray(entry.portIds, expectedMatrix[entry.contractId])) {
      fail(`${entry.contractId} exact focused-port closure changed`);
    }
    if (
      new Set(entry.portIds).size !== entry.portIds.length ||
      entry.portIds.some((portId) => !portById.has(portId))
    ) {
      fail(`${entry.contractId} has duplicate or unknown port IDs`);
    }
    const applicationContract = application.contracts.find(
      (contract) => contract.id === entry.contractId,
    );
    for (const seamId of applicationContract.seamIds || []) {
      if (!entry.portIds.some((portId) => portById.get(portId).seamIds.includes(seamId))) {
        fail(`${entry.contractId} has no port for required ${seamId}`);
      }
    }
  }

  const teacherFields = [
    ...fieldsOf("TeacherAggregateSnapshotV1", manifest, application),
    ...fieldsOf("TeacherPortalAccessProjectionV1", manifest, application).filter((field) => field !== "teacherId"),
    ...fieldsOf("TeacherGroupCountV1", manifest, application).filter((field) => field !== "teacherId"),
    ...fieldsOf("TeacherWorkloadProjectionV1", manifest, application).filter((field) => field !== "teacherId"),
    ...fieldsOf("TeacherCompletedLessonCountV1", manifest, application).filter((field) => field !== "teacherId"),
    ...fieldsOf("TeacherStudentCountV1", manifest, application).filter((field) => field !== "teacherId"),
    ...manifest.compositionRules.TeacherAdminViewV1.derivedByCoordinator,
  ];
  if (
    new Set(teacherFields).size !== teacherFields.length ||
    !sameSet(teacherFields, application.outputTypes.TeacherAdminViewV1.fields)
  ) {
    fail("TeacherAdminViewV1 focused composition is incomplete or overlapping");
  }

  const groupFields = [
    ...fieldsOf("TeacherGroupBaseProjectionV1", manifest, application),
    ...fieldsOf("GroupScheduleProjectionV1", manifest, application).filter((field) => field !== "groupId"),
    ...fieldsOf("GroupLessonMetricsV1", manifest, application).filter((field) => field !== "groupId"),
    ...fieldsOf("GroupStudentCountV1", manifest, application).filter((field) => field !== "groupId"),
    ...manifest.compositionRules.TeacherProfileGroupAdminViewV1.derivedByCoordinator,
  ];
  if (
    new Set(groupFields).size !== groupFields.length ||
    !sameSet(groupFields, application.outputTypes.TeacherProfileGroupAdminViewV1.fields)
  ) {
    fail("TeacherProfileGroupAdminViewV1 focused composition is incomplete or overlapping");
  }
  const workingHourFields = [
    ...fieldsOf("TeacherWorkingHourSnapshotV1", manifest, application),
    ...manifest.compositionRules.TeacherWorkingHourViewV1.derivedByCoordinator,
  ];
  if (!sameSet(workingHourFields, application.outputTypes.TeacherWorkingHourViewV1.fields)) {
    fail("TeacherWorkingHourViewV1 focused composition is incomplete");
  }
  if (
    !sameArray(
      fieldsOf("TeacherReferenceV1", manifest, application),
      ["tenantId", "teacherId", "displayName", "status", "branchId"],
    )
  ) {
    fail("TeacherReferenceV1 changed");
  }

  const adapters = manifest.adapterPlan || [];
  const implementedPorts = adapters.flatMap((adapter) => adapter.implements);
  if (
    adapters.length !== 9 ||
    implementedPorts.length !== ports.length ||
    new Set(implementedPorts).size !== ports.length ||
    !sameSet(implementedPorts, expectedPortIds)
  ) {
    fail("adapter plan must implement every focused port exactly once");
  }
  for (const adapter of adapters) {
    if (
      adapter.adapterId === "WF-ADAPTER-OWNED-SQLITE-01"
        ? !sameArray(adapter.directTableAllowlist, ["teachers", "teacher_working_hours"])
        : adapter.directTableAllowlist.length !== 0
    ) {
      fail(`${adapter.adapterId} direct-table allowlist is invalid`);
    }
  }

  if (
    manifest.broadPortProhibitions?.length !== 5 ||
    !Array.isArray(manifest.temporaryExceptions) ||
    manifest.temporaryExceptions.length !== 0
  ) {
    fail("five broad-port guards and zero temporary exceptions are required");
  }
  if (/UnitOfWork|event bus|outbox/i.test(ports.map((port) => port.name).join(" "))) {
    fail("transaction/event infrastructure cannot be introduced as a WF-PRE-10 port");
  }

  const deferred = manifest.deferredDecisions || {};
  for (const id of ["WF-PRE-11", "WF-PRE-12", "WF-PRE-13", "WF-PRE-14"]) {
    if (!deferred[id]) fail(`${id} deferral is missing`);
  }

  const approvalRoles = new Set((manifest.approvals || []).map((approval) => approval.role));
  for (const role of [
    "Architecture Owner", "Workforce Module Owner", "Data Owner",
    "Identity & Access Owner", "Organization & Branches Owner", "Academic Groups Owner",
    "Scheduling Owner", "Lesson Delivery Owner", "Student Information Owner",
    "Audit & History Owner", "Security Owner", "Quality Owner",
  ]) {
    if (!approvalRoles.has(role)) fail(`${role} approval is missing`);
  }

  console.log(
    `Workforce focused ports PASS: catalog=${manifest.portCatalogId}; sha256=${manifestHash}; ports=18/18; operations=11/11; adapters=9/9; directTables=2/2; foreignDirect=0; guards=5/5; exceptions=0`,
  );
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
