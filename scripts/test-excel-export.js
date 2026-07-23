const assert = require("node:assert/strict");
const path = require("node:path");
const ExcelJS = require("exceljs");

async function run() {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Attendance");
  worksheet.addRow(["Student", "Status", "Rate"]);
  worksheet.addRow(["Canary Student", "present", 100]);
  const excelRoot = path.dirname(require.resolve("exceljs/package.json"));
  const overriddenUuid = require(require.resolve("uuid", { paths: [excelRoot] }));
  assert.match(overriddenUuid.v4(), /^[0-9a-f-]{36}$/i, "ExcelJS uuid override lost its CommonJS v4 contract");
  const buffer = await workbook.xlsx.writeBuffer();
  assert.ok(buffer.byteLength > 1000, "ExcelJS produced an invalid workbook buffer");
  const loaded = new ExcelJS.Workbook();
  await loaded.xlsx.load(buffer);
  assert.equal(loaded.getWorksheet("Attendance").getCell("A2").value, "Canary Student");
  console.log("PASS ExcelJS export/import with overridden uuid 11.1.1");
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
