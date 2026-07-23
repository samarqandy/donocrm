#!/usr/bin/env node

const { parseArguments, writeJson, writeText } = require("./lib");
const { runRepositoryContracts } = require("./contract-lib");

async function main() {
  const args = parseArguments(process.argv.slice(2));
  const mode = String(args.mode || process.env.ARCHITECTURE_MODE || "observe").toLowerCase();
  const output = String(args.output || "artifacts/architecture");
  const report = await runRepositoryContracts();
  report.mode = mode;
  const markdown = [
    "# Repository Contract Report",
    "",
    `- Mode: **${mode.toUpperCase()}**`,
    `- Status: **${report.status}**`,
    `- Live SQLite/PostgreSQL execution: **${report.live ? "yes" : "no"}**`,
    `- PASS: ${report.summary.pass}; FAIL: ${report.summary.fail}; DIFF: ${report.summary.diff}`,
    "",
    "| Suite | Case | Status | Differences |",
    "|---|---|---|---|",
    ...report.cases.map((item) => `| ${item.suite} | ${item.case} | **${item.status}** | ${item.differences.join(", ") || "—"} |`),
    "",
  ].join("\n");
  writeJson(`${output}/contract-report.json`, report);
  writeText(`${output}/contract-report.md`, markdown);
  for (const item of report.cases.filter((entry) => entry.status !== "PASS")) {
    console.warn(`WARNING [${item.status}] ${item.suite}/${item.case}: ${item.differences.join(", ")}`);
  }
  console.log(`Repository contracts ${report.status}: PASS=${report.summary.pass} FAIL=${report.summary.fail} DIFF=${report.summary.diff}`);
  if (mode === "enforce" && report.status !== "PASS") process.exitCode = 1;
}

main().catch((error) => {
  console.error(`Repository contracts FAIL: ${error.stack || error.message}`);
  if (String(process.env.ARCHITECTURE_MODE || "observe").toLowerCase() === "enforce") process.exitCode = 1;
});
