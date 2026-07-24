#!/usr/bin/env node

const { spawnSync } = require("node:child_process");
const path = require("node:path");
const { ROOT } = require("./lib");

const commands = [
  ["architecture", "scripts/architecture/scan.js"],
  ["workforce contract freeze", "scripts/architecture/verify-workforce-contract-freeze.js"],
  ["workforce behavior matrix", "scripts/architecture/verify-workforce-behavior-matrix.js"],
  ["workforce context seams", "scripts/architecture/verify-workforce-context-seams.js"],
  ["workforce table access", "scripts/architecture/verify-workforce-table-access.js"],
  ["workforce application contracts", "scripts/architecture/verify-workforce-application-contracts.js"],
  ["workforce focused ports", "scripts/architecture/verify-workforce-focused-ports.js"],
  ["workforce consistency model", "scripts/architecture/verify-workforce-consistency-model.js"],
  ["workforce event requirements", "scripts/architecture/verify-workforce-event-requirements.js"],
  ["workforce test parity plan", "scripts/architecture/verify-workforce-test-parity-plan.js"],
  ["workforce migration runbook", "scripts/architecture/verify-workforce-migration-runbook.js"],
  ["workforce module readiness", "scripts/architecture/verify-workforce-module-readiness.js"],
  ["workforce extraction structure", "scripts/architecture/verify-workforce-extraction-structure.js"],
];

let failures = 0;
for (const [name, script] of commands) {
  const result = spawnSync(
    process.execPath,
    [path.join(ROOT, script), "--mode", "enforce", "--output", "artifacts/architecture"],
    {
      cwd: ROOT,
      env: { ...process.env, ARCHITECTURE_MODE: "enforce" },
      encoding: "utf8",
    },
  );
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    failures += 1;
    console.error(`Architecture enforcement ${name} failed with exit code ${result.status}`);
  }
}

console.log(`Architecture enforcement completed; failures=${failures}; mergeBlocking=true`);
if (failures) process.exitCode = 1;
