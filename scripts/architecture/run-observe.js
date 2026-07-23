#!/usr/bin/env node

const { spawnSync } = require("node:child_process");
const path = require("node:path");
const { ROOT } = require("./lib");

const commands = [
  ["architecture", "scripts/architecture/scan.js"],
  ["contract", "scripts/architecture/contract-runner.js"],
  ["parity", "scripts/architecture/parity-report.js"],
];

let infrastructureFailures = 0;
for (const [name, script] of commands) {
  const result = spawnSync(process.execPath, [path.join(ROOT, script), "--mode", "observe", "--output", "artifacts/architecture"], {
    cwd: ROOT,
    env: { ...process.env, ARCHITECTURE_MODE: "observe" },
    encoding: "utf8",
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    infrastructureFailures += 1;
    console.warn(`WARNING architecture observe job ${name} exited ${result.status}; enforcement remains non-blocking`);
  }
}

console.log(`Architecture observe pipeline completed; infrastructureFailures=${infrastructureFailures}; mergeBlocking=false`);
