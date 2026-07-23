#!/usr/bin/env node

const { spawnSync } = require("node:child_process");
const path = require("node:path");
const { ROOT } = require("./lib");

const commands = [
  ["architecture", "scripts/architecture/scan.js"],
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
