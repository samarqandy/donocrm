#!/usr/bin/env node

const { parseArguments, writeJson, writeText } = require("./lib");
const { runRepositoryContracts } = require("./contract-lib");

async function main() {
  const args = parseArguments(process.argv.slice(2));
  const mode = String(args.mode || process.env.ARCHITECTURE_MODE || "observe").toLowerCase();
  const output = String(args.output || "artifacts/architecture");
  const contracts = await runRepositoryContracts();
  const differences = contracts.cases.filter((item) => item.status !== "PASS");
  const report = {
    schemaVersion: 1,
    mode,
    status: contracts.status,
    live: contracts.live,
    generatedAt: new Date().toISOString(),
    comparison: "SQLiteAttendanceRepository/QueryRepository vs PostgreSQL equivalents",
    summary: contracts.summary,
    differences,
    evidenceHash: contracts.evidenceHash,
  };
  const markdown = [
    "# SQLite/PostgreSQL Semantic Parity Report",
    "",
    `- Mode: **${mode.toUpperCase()}**`,
    `- Status: **${report.status}**`,
    `- Live comparison: **${report.live ? "yes" : "no"}**`,
    `- Semantic differences/failures: ${differences.length}`,
    "",
    "| Suite | Case | Result | Difference paths | SQLite hash | PostgreSQL hash |",
    "|---|---|---|---|---|---|",
    ...differences.map((item) => `| ${item.suite} | ${item.case} | **${item.status}** | ${item.differences.join("<br>") || "—"} | ${item.sqliteHash || "—"} | ${item.postgresHash || "—"} |`),
    "",
    "No automatic correction is performed. Every DIFF requires contract-owner review.",
    "",
  ].join("\n");
  writeJson(`${output}/parity-report.json`, report);
  writeText(`${output}/parity-report.md`, markdown);
  for (const item of differences) console.warn(`WARNING [${item.status}] ${item.suite}/${item.case}: ${item.differences.join(", ")}`);
  console.log(`Parity ${report.status}: ${differences.length} semantic differences/failures`);
  if (mode === "enforce" && report.status !== "PASS") process.exitCode = 1;
}

main().catch((error) => {
  console.error(`Parity FAIL: ${error.stack || error.message}`);
  if (String(process.env.ARCHITECTURE_MODE || "observe").toLowerCase() === "enforce") process.exitCode = 1;
});
