const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const BASE_URL = process.env.DONO_UI_BASE_URL || "http://127.0.0.1:8081";
const OUTPUT_DIR = path.join(__dirname, "../screenshots/attendance-canary");

async function login(page) {
  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await page.locator("#loginUsername").fill("admin");
  await page.locator("#loginPassword").fill("admin123");
  await Promise.all([
    page.waitForResponse((response) => new URL(response.url()).pathname === "/api/login"),
    page.locator(".login-submit").click(),
  ]);
  await page.locator(".layout").waitFor({ state: "visible" });
}

async function run() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const code = `canary_${Date.now().toString(36)}`;
  const browser = await chromium.launch({ headless: true });
  const report = { code, created: false, disabled: false, enabled: false, profiles: {}, errors: [] };
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.on("pageerror", (error) => report.errors.push(error.message));
    await login(page);
    await page.evaluate(() => setState({ page: "management", managementSection: "attendance" }));
    await page.locator("#attendanceReasonCode").waitFor({ state: "visible" });
    await page.locator("#attendanceReasonCode").fill(code);
    await page.locator("#attendanceReasonName").fill("Canary attendance reason");
    await page.locator("#attendanceReasonStatus").selectOption("excused");
    await page.locator("#attendanceChargePercent").fill("25");
    await page.locator("#attendanceConsumePercent").fill("50");
    const [created] = await Promise.all([
      page.waitForResponse((response) => response.request().method() === "POST"
        && new URL(response.url()).pathname === "/api/attendance-reasons"),
      page.locator(".management-form button[type=submit]").click(),
    ]);
    if (created.status() !== 201) throw new Error(`Create returned ${created.status()}`);
    const createdBody = await created.json();
    report.created = createdBody.code === code && createdBody.version === 1;

    const row = page.locator(".management-row").filter({ hasText: code });
    await row.waitFor({ state: "visible" });
    await page.screenshot({ path: path.join(OUTPUT_DIR, "21-attendance-reason-created.png"), fullPage: true });
    const [disabled] = await Promise.all([
      page.waitForResponse((response) => response.request().method() === "PATCH"
        && new URL(response.url()).pathname === `/api/attendance-reasons/${createdBody.id}`),
      row.locator("button").click(),
    ]);
    const disabledBody = await disabled.json();
    report.disabled = disabled.status() === 200 && disabledBody.isActive === false && disabledBody.version === 2;
    await page.locator(".management-row").filter({ hasText: code }).waitFor({ state: "visible" });
    await page.screenshot({ path: path.join(OUTPUT_DIR, "22-attendance-reason-disabled.png"), fullPage: true });

    const enabledRow = page.locator(".management-row").filter({ hasText: code });
    const [enabled] = await Promise.all([
      page.waitForResponse((response) => response.request().method() === "PATCH"
        && new URL(response.url()).pathname === `/api/attendance-reasons/${createdBody.id}`),
      enabledRow.locator("button").click(),
    ]);
    const enabledBody = await enabled.json();
    report.enabled = enabled.status() === 200 && enabledBody.isActive === true && enabledBody.version === 3;

    report.profiles = await page.evaluate(async () => {
      const students = await fetch("/api/students").then((response) => response.json());
      const groups = await fetch("/api/groups").then((response) => response.json());
      const student = await fetch(`/api/students/${encodeURIComponent(students.students[0].id)}/profile`).then((response) => response.json());
      const group = await fetch(`/api/groups/${encodeURIComponent(groups.groups[0].id)}/profile`).then((response) => response.json());
      return {
        student: Boolean(student.attendance?.summary && Array.isArray(student.attendance?.records)),
        group: Boolean(group.attendance?.summary && Array.isArray(group.attendance?.records)),
      };
    });
    if (!report.created || !report.disabled || !report.enabled || !report.profiles.student || !report.profiles.group || report.errors.length) {
      throw new Error(`Canary assertions failed: ${JSON.stringify(report)}`);
    }
    console.log(JSON.stringify({ ok: true, ...report }, null, 2));
  } finally {
    await browser.close();
  }
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
