#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const {
  ROOT,
  absolute,
  fingerprint,
  hash,
  internalImports,
  loadManifest,
  parseArguments,
  relative,
  walk,
  writeJson,
  writeText,
} = require("./lib");

const args = parseArguments(process.argv.slice(2));
const mode = String(args.mode || process.env.ARCHITECTURE_MODE || "observe").toLowerCase();
const outputDirectory = String(args.output || "artifacts/architecture");
const owners = loadManifest("architecture/owners.yaml");
const modules = loadManifest("architecture/modules.yaml");
const tables = loadManifest("architecture/tables.yaml");
const exceptions = loadManifest("architecture/exceptions.yaml");
const baseline = loadManifest("architecture/baseline.json");

const findings = [];
const edges = [];
const sqlAccess = [];
const moduleEntries = Object.entries(modules.contexts);

function add(rule, source, target, message, details = {}) {
  const accessMode = details.accessMode || "";
  findings.push({
    rule,
    source,
    target: target || "",
    accessMode,
    message,
    fingerprint: fingerprint(rule, source, target || "", accessMode),
    ...details,
  });
}

function contextFor(file) {
  for (const [contextId, context] of moduleEntries) {
    if ((context.sourceRoots || []).some((root) => file === root || file.startsWith(`${root}/`))) return contextId;
  }
  return null;
}

function moduleLayer(file) {
  const match = file.match(/^src\/modules\/([^/]+)\/(domain|application|http|infrastructure)(?:\/|$)/);
  return match ? { physicalModule: match[1], layer: match[2] } : null;
}

function configuredPathMatches(file, configuredPath) {
  const escaped = configuredPath
    .split("*")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("[^/]*");
  return new RegExp(`^${escaped}(?:/|$)`).test(file);
}

function isPresentation(file) {
  return modules.presentationRoots.some((root) => configuredPathMatches(file, root)) || file === "app.js";
}

function isAllowedSqlLocation(file) {
  return modules.sqlAllowedRoots.some((root) => configuredPathMatches(file, root));
}

function isApprovedShared(file) {
  return (modules.sharedKernel.allowed || []).includes(file);
}

function samePhysicalModule(source, target, requiredLayer = null) {
  const left = moduleLayer(source);
  const right = moduleLayer(target);
  return Boolean(left && right && left.physicalModule === right.physicalModule && (!requiredLayer || right.layer === requiredLayer));
}

function scanImports(file, source) {
  const classification = moduleLayer(file);
  for (const imported of internalImports(absolute(file), source)) {
    if (!imported.external && !imported.target) {
      add("AR-000", file, imported.request, "Unresolved relative import");
      continue;
    }
    const target = imported.target ? relative(imported.target) : imported.request;
    edges.push({ source: file, target, external: imported.external });

    if (!classification) continue;
    if (classification.layer === "domain") {
      const allowed = !imported.external && (samePhysicalModule(file, target, "domain") || isApprovedShared(target));
      if (!allowed) add("AR-001", file, target, "Domain dependency points outside same-module Domain/approved Shared Kernel");
    }
    if (classification.layer === "application") {
      const targetLayer = moduleLayer(target);
      const allowed = !imported.external && (
        (targetLayer && targetLayer.physicalModule === classification.physicalModule && ["domain", "application"].includes(targetLayer.layer))
        || isApprovedShared(target)
      );
      if (!allowed) add("AR-002", file, target, "Application dependency points to a concrete, external, legacy, or unapproved shared dependency");
    }

    const targetClassification = moduleLayer(target);
    if (targetClassification && targetClassification.physicalModule !== classification.physicalModule) {
      const targetContext = contextFor(target);
      const publicPaths = targetContext ? modules.contexts[targetContext].publicPaths || [] : [];
      if (!publicPaths.some((publicPath) => target === publicPath || target.startsWith(`${publicPath}/`))) {
        add("AR-007", file, target, "Cross-module dependency bypasses a declared public Application path");
      }
    }

    if (["domain", "application", "http"].includes(classification.layer)
      && modules.legacyDependencyRoots.some((root) => target === root || target.startsWith(`${root}/`))) {
      add("AR-008", file, target, "Module depends on a frozen legacy root");
    }

    if (classification.layer === "http") {
      const forbidden = target.startsWith("src/db/")
        || target.startsWith("src/repositories/")
        || target.startsWith("src/bootstrap/")
        || /\/infrastructure\//.test(target)
        || target.startsWith("src/services/");
      if (forbidden) add("AR-003", file, target, "Presentation imports database/repository/bootstrap/infrastructure/legacy services");
    }

    if (classification.layer === "infrastructure") {
      const otherInfrastructure = targetClassification
        && targetClassification.layer === "infrastructure"
        && targetClassification.physicalModule !== classification.physicalModule;
      if (otherInfrastructure || target.startsWith("src/http/") || /\/http\//.test(target)) {
        add("AR-004", file, target, "Infrastructure depends on HTTP or another module's Infrastructure");
      }
    }
  }
}

const SQL_TABLE_PATTERN = /\b(INSERT\s+INTO|DELETE\s+FROM|UPDATE|FROM|JOIN|CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?|ALTER\s+TABLE|DROP\s+TABLE(?:\s+IF\s+EXISTS)?)\s+[`"']?([A-Za-z_][A-Za-z0-9_]*)/gi;

function sqlFragments(source) {
  const fragments = [];
  const stringPatterns = [
    /`((?:\\.|[^`])*)`/gs,
    /"((?:\\.|[^"\\])*)"/gs,
    /'((?:\\.|[^'\\])*)'/gs,
  ];
  const sqlShape = /(?:\bSELECT\b[\s\S]*?(?:\bFROM\b|\bAS\b)|\bINSERT\s+INTO\b|\bUPDATE\s+[A-Za-z_][A-Za-z0-9_]*\s+SET\b|\bDELETE\s+FROM\b|\bCREATE\s+TABLE\b|\bALTER\s+TABLE\b|\bDROP\s+TABLE\b|\bWITH\s+[A-Za-z_][A-Za-z0-9_]*\s+AS\s*\()/i;
  for (const pattern of stringPatterns) {
    for (const match of source.matchAll(pattern)) {
      if (sqlShape.test(match[1])) fragments.push(match[1]);
    }
  }
  return fragments;
}

function scanSql(file, source) {
  const accesses = new Map();
  const fragments = sqlFragments(source);
  for (const fragment of fragments) {
    const virtualTables = new Set(
      [...fragment.matchAll(/(?:\bWITH|,)\s*([A-Za-z_][A-Za-z0-9_]*)\s+AS\s*\(/gi)].map((match) => match[1].toLowerCase()),
    );
    for (const match of fragment.matchAll(SQL_TABLE_PATTERN)) {
      const operation = match[1].toUpperCase().replace(/\s+/g, " ");
      const table = match[2].toLowerCase();
      if (virtualTables.has(table) || ["set", "on", "of"].includes(table)) continue;
      const accessMode = ["FROM", "JOIN"].includes(operation) ? "read" : "write";
      accesses.set(`${table}:${accessMode}`, { table, accessMode, operation });
    }
  }
  if (!fragments.length) return;

  if (!isAllowedSqlLocation(file)) {
    add("AR-030", file, "SQL", "SQL/database statement exists outside an approved persistence/migration/test location");
  }
  if (isPresentation(file)) {
    add("AR-030", file, "Presentation SQL", "Presentation contains direct SQL");
  }

  const sourceContext = contextFor(file);
  for (const access of accesses.values()) {
    const tableDefinition = tables.tables[access.table];
    sqlAccess.push({ source: file, context: sourceContext, ...access, owner: tableDefinition?.owner || null });
    if (["sqlite_master", "information_schema", "pg_catalog"].includes(access.table)) continue;
    if (!tableDefinition) {
      add("AR-031", file, access.table, "SQL references a table absent from the ownership manifest", { accessMode: access.accessMode });
      continue;
    }
    if (sourceContext && sourceContext !== "migration-infrastructure" && tableDefinition.owner !== sourceContext) {
      add("AR-031", file, access.table, `Module ${sourceContext} accesses table owned by ${tableDefinition.owner}`, {
        accessMode: access.accessMode,
        owner: tableDefinition.owner,
        context: sourceContext,
      });
    }
  }
}

function validateManifests() {
  const ownerIds = new Set(Object.keys(owners.owners || {}));
  for (const [contextId, context] of moduleEntries) {
    if (!ownerIds.has(context.owner)) add("AR-020", "architecture/modules.yaml", contextId, `Unknown owner ${context.owner}`);
  }
  for (const [table, definition] of Object.entries(tables.tables || {})) {
    if (!modules.contexts[definition.owner]) add("AR-031", "architecture/tables.yaml", table, `Unknown table owner ${definition.owner}`);
  }
  for (const exception of exceptions.exceptions || []) {
    if (!exception.fingerprint || !exception.owner || !exception.expiresAt) {
      add("AR-050", "architecture/exceptions.yaml", exception.id || "unknown", "Exception is missing fingerprint, owner, or expiry");
      continue;
    }
    if (Date.parse(exception.expiresAt) <= Date.now()) add("AR-050", "architecture/exceptions.yaml", exception.id, "Exception has expired");
  }
}

function lineCount(source) {
  return source ? source.split(/\r?\n/).length - (source.endsWith("\n") ? 1 : 0) : 0;
}

function countMatches(source, pattern) {
  return [...source.matchAll(pattern)].length;
}

function currentLegacyMetrics(sourceByFile) {
  const appService = sourceByFile.get("src/services/appService.js") || "";
  const appRepository = sourceByFile.get("src/repositories/appRepository.js") || "";
  const api = sourceByFile.get("src/http/api.js") || "";
  const browser = sourceByFile.get("app.js") || "";
  const telegramWorker = sourceByFile.get("src/workers/telegramQueueWorker.js") || "";
  const telegramWorkerEntry = sourceByFile.get("scripts/telegram-worker.js") || "";
  const coreFiles = walk("src/core", (file) => file.endsWith(".js")).map(relative);
  const coreConsumers = edges.filter((edge) => coreFiles.includes(edge.target)).length;
  return {
    "src/services/appService.js": { lines: lineCount(appService), methods: countMatches(appService, /^  (?:async )?[A-Za-z_$][A-Za-z0-9_$]*\([^\n]*\) \{/gm), sha256: hash(appService) },
    "src/repositories/appRepository.js": { lines: lineCount(appRepository), methods: countMatches(appRepository, /^  (?:async )?[A-Za-z_$][A-Za-z0-9_$]*\([^\n]*\) \{/gm), sha256: hash(appRepository) },
    "src/http/api.js": { lines: lineCount(api), routeBranches: countMatches(api, /^\s*if \(method ===/gm), sha256: hash(api) },
    "app.js": { lines: lineCount(browser), topLevelFunctions: countMatches(browser, /^function [A-Za-z_$][A-Za-z0-9_$]*\(/gm), sha256: hash(browser) },
    "src/workers/telegramQueueWorker.js": { lines: lineCount(telegramWorker), sha256: hash(telegramWorker) },
    "scripts/telegram-worker.js": { lines: lineCount(telegramWorkerEntry), sha256: hash(telegramWorkerEntry) },
    "src/core": { files: coreFiles.length, consumers: coreConsumers },
  };
}

function scanLegacyGrowth(metrics) {
  for (const [component, expected] of Object.entries(baseline.legacyMetrics || {})) {
    const actual = metrics[component];
    if (!actual) {
      add("AR-060", component, "missing", "Legacy baseline component cannot be measured");
      continue;
    }
    for (const [metric, expectedValue] of Object.entries(expected)) {
      const actualValue = actual[metric];
      if (metric === "sha256" && actualValue !== expectedValue) {
        add("AR-061", component, metric, "Frozen component content differs from the candidate baseline", { expected: expectedValue, actual: actualValue });
      } else if (typeof expectedValue === "number" && actualValue > expectedValue) {
        add("AR-060", component, metric, `Legacy metric grew from ${expectedValue} to ${actualValue}`, { expected: expectedValue, actual: actualValue });
      }
    }
  }
}

function scanSharedKernel(sourceByFile) {
  const coreFiles = walk("src/core", (file) => file.endsWith(".js")).map(relative);
  for (const file of coreFiles) {
    if (!isApprovedShared(file)) add("AR-070", file, "Shared Kernel", "Shared Kernel file is not admitted by an Accepted ADR");
  }
  for (const edge of edges) {
    if (coreFiles.includes(edge.target) && !isApprovedShared(edge.target)) {
      add("AR-071", edge.source, edge.target, "Consumer depends on an unapproved Shared Kernel item");
    }
  }
  void sourceByFile;
}

validateManifests();

const productionFiles = [
  ...walk("src", (file) => file.endsWith(".js")),
  ...walk("scripts", (file) => file.endsWith(".js")
    && !relative(file).startsWith("scripts/architecture/")
    && !path.basename(file).startsWith("test-")
    && path.basename(file) !== "qa-smoke.js"),
  ...["server.js", "app.js"].map(absolute).filter(fs.existsSync),
];
const sourceByFile = new Map();
for (const fullPath of [...new Set(productionFiles)]) {
  const file = relative(fullPath);
  const source = fs.readFileSync(fullPath, "utf8");
  sourceByFile.set(file, source);
  scanImports(file, source);
  scanSql(file, source);
}

scanSharedKernel(sourceByFile);
const legacyMetrics = currentLegacyMetrics(sourceByFile);
scanLegacyGrowth(legacyMetrics);

const baselineFingerprints = new Set(baseline.fingerprints || []);
const baselineApproved = baseline.status === "approved" && Boolean(baseline.commit) && Boolean(baseline.approvedBy);
const enforcementBaseline = {
  legacyMetrics: baseline.legacyMetrics || {},
  fingerprints: baseline.fingerprints || [],
};
const computedConfigurationHash = hash({
  owners,
  modules,
  tables,
  exceptions,
  baseline: enforcementBaseline,
});
if (baselineApproved && baseline.configurationHash !== computedConfigurationHash) {
  add(
    "AR-021",
    "architecture/baseline.json",
    "configurationHash",
    "Approved baseline configuration hash does not match the executable manifests",
  );
}
const activeExceptions = new Set((exceptions.exceptions || [])
  .filter((item) => item.fingerprint && item.expiresAt && Date.parse(item.expiresAt) > Date.now())
  .map((item) => item.fingerprint));
for (const finding of findings) {
  finding.disposition = activeExceptions.has(finding.fingerprint)
    ? "EXCEPTION"
    : baselineFingerprints.has(finding.fingerprint)
      ? baselineApproved ? "BASELINE" : "CANDIDATE_BASELINE"
      : "UNBASELINED";
}
findings.sort((left, right) => left.fingerprint.localeCompare(right.fingerprint));

const summary = {
  total: findings.length,
  unbaselined: findings.filter((item) => item.disposition === "UNBASELINED").length,
  candidateBaseline: findings.filter((item) => item.disposition === "CANDIDATE_BASELINE").length,
  baseline: findings.filter((item) => item.disposition === "BASELINE").length,
  exceptions: findings.filter((item) => item.disposition === "EXCEPTION").length,
};
const report = {
  schemaVersion: 1,
  mode,
  status: mode === "observe" ? "OBSERVE" : (summary.unbaselined + summary.candidateBaseline) ? "FAIL" : "PASS",
  generatedAt: new Date().toISOString(),
  // Approval metadata and the stored hash are evidence about this
  // configuration, not inputs to it. Excluding them keeps the hash stable
  // when the candidate is signed and avoids a self-referential hash.
  configurationHash: computedConfigurationHash,
  scannedFiles: sourceByFile.size,
  edges: edges.length,
  sqlAccesses: sqlAccess.length,
  summary,
  legacyMetrics,
  findings,
  sqlAccess,
};

const markdown = [
  "# Architecture Scan Report",
  "",
  `- Mode: **${report.mode.toUpperCase()}**`,
  `- Status: **${report.status}**`,
  `- Files: ${report.scannedFiles}`,
  `- Dependency edges: ${report.edges}`,
  `- SQL accesses: ${report.sqlAccesses}`,
  `- Findings: ${summary.total} (${summary.unbaselined} unbaselined, ${summary.candidateBaseline} candidate baseline, ${summary.baseline} approved baseline, ${summary.exceptions} exceptions)`,
  "",
  "| Disposition | Rule | Source | Target | Message |",
  "|---|---|---|---|---|",
  ...findings.map((item) => `| ${item.disposition} | ${item.rule} | \`${item.source}\` | \`${item.target}\` | ${item.message.replace(/\|/g, "\\|")} |`),
  "",
].join("\n");

writeJson(`${outputDirectory}/architecture-report.json`, report);
writeText(`${outputDirectory}/architecture-report.md`, markdown);

for (const finding of findings) {
  console.warn(`WARNING [${finding.rule}] ${finding.source} -> ${finding.target}: ${finding.message} (${finding.disposition})`);
}
console.log(`Architecture ${report.status}: ${summary.total} findings; report=${outputDirectory}/architecture-report.json`);

if (mode === "enforce" && (summary.unbaselined + summary.candidateBaseline) > 0) process.exitCode = 1;
