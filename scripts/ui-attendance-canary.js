const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const BASE_URL = process.env.DONO_UI_BASE_URL || "http://127.0.0.1:8081";
const OUTPUT_DIR = path.join(__dirname, "../screenshots/attendance-canary");
const FIXTURE_IDS = Array.from({ length: 15 }, (_value, index) => `ui_attendance_canary_${String(index + 1).padStart(2, "0")}`);
const STATUS_INDEX = { present: 0, absent: 1, late: 2, excused: 3 };

async function login(page, username, password) {
  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await page.locator("#loginUsername").fill(username);
  await page.locator("#loginPassword").fill(password);
  await Promise.all([
    page.waitForResponse((response) => new URL(response.url()).pathname === "/api/login"),
    page.locator(".login-submit").click(),
  ]);
  await page.locator(".layout").waitFor({ state: "visible" });
}

async function openAttendance(page, lessonId) {
  await page.evaluate(async (id) => window.openAttendance(id), lessonId);
  await page.locator(".modal .attendance-list").waitFor({ state: "visible" });
  const rows = page.locator(".modal .attendance-row");
  if (await rows.count() !== 2) throw new Error(`${lessonId}: expected two attendance rows`);
  return rows;
}

async function setStatus(row, status) {
  await row.locator("button.segment").nth(STATUS_INDEX[status]).click();
}

async function saveAndWait(page, lessonId) {
  const save = page.locator(".attendance-save-row .primary-button");
  await save.waitFor({ state: "visible" });
  if (await save.isDisabled()) throw new Error(`${lessonId}: save button is disabled`);
  const [response] = await Promise.all([
    page.waitForResponse((candidate) => candidate.request().method() === "POST" && new URL(candidate.url()).pathname === "/api/attendance"),
    save.click(),
  ]);
  const body = await response.json();
  if (response.status() !== 200 || !body.ok) throw new Error(`${lessonId}: attendance API returned ${response.status()}`);
  await page.locator(".modal-backdrop").waitFor({ state: "detached" });
  return body;
}

async function initialAttendanceOperations(page, report) {
  const patterns = ["present", "absent", "late", "excused"];
  for (let index = 0; index < FIXTURE_IDS.length; index += 1) {
    const lessonId = FIXTURE_IDS[index];
    const rows = await openAttendance(page, lessonId);
    await page.locator(".attendance-toolbar .ghost-button").click();
    const firstStatus = patterns[index % patterns.length];
    await setStatus(rows.nth(0), firstStatus);
    await rows.nth(0).locator(".attendance-student-note").fill(`UI canary ${index + 1}: ${firstStatus}`);
    await page.locator(".attendance-lesson-fields input").fill(`UI attendance operation ${String(index + 1).padStart(2, "0")}`);
    await page.locator(".attendance-lesson-fields textarea").nth(1).fill("Automated Playwright canary");
    if (index === 0) {
      await page.screenshot({ path: path.join(OUTPUT_DIR, "01-admin-marked-attendance.png"), fullPage: true });
    }
    if (index === 7) {
      await page.screenshot({ path: path.join(OUTPUT_DIR, "02-admin-mixed-status.png"), fullPage: true });
    }
    await saveAndWait(page, lessonId);
    report.operations.push({ number: index + 1, lessonId, type: "initial", firstStatus, ok: true });
  }
}

async function correctionOperations(page, report) {
  const corrections = [
    { lessonId: FIXTURE_IDS[0], status: "late" },
    { lessonId: FIXTURE_IDS[1], status: "excused" },
  ];
  for (let index = 0; index < corrections.length; index += 1) {
    const correction = corrections[index];
    const rows = await openAttendance(page, correction.lessonId);
    await setStatus(rows.nth(0), correction.status);
    await page.locator("#attendanceCorrectionReason").fill(`Canary correction ${index + 1}`);
    await rows.nth(0).locator(".attendance-student-note").fill(`Corrected to ${correction.status}`);
    if (index === 0) {
      await page.screenshot({ path: path.join(OUTPUT_DIR, "03-admin-correction.png"), fullPage: true });
    }
    await saveAndWait(page, correction.lessonId);
    report.operations.push({ number: FIXTURE_IDS.length + index + 1, lessonId: correction.lessonId, type: "correction", firstStatus: correction.status, ok: true });
  }
}

async function postExtractionOperation(page, report) {
  const lessonId = FIXTURE_IDS[2];
  const rows = await openAttendance(page, lessonId);
  await setStatus(rows.nth(0), "absent");
  await page.locator("#attendanceCorrectionReason").fill("Post-extraction SQLite repository canary");
  await rows.nth(0).locator(".attendance-student-note").fill("Independent repository UI verification");
  await page.screenshot({ path: path.join(OUTPUT_DIR, "07-post-extraction-correction.png"), fullPage: true });
  await saveAndWait(page, lessonId);
  report.operations.push({ number: 18, lessonId, type: "post-extraction-correction", firstStatus: "absent", ok: true });
  await openAttendance(page, lessonId);
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUTPUT_DIR, "08-post-extraction-saved.png"), fullPage: true });
  await page.evaluate(() => window.closeAppModal());
}

async function capturePostExtraction(page) {
  await openAttendance(page, FIXTURE_IDS[2]);
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUTPUT_DIR, "08-post-extraction-saved.png"), fullPage: true });
  await page.evaluate(() => window.closeAppModal());
}

async function relayParityOperation(page, report) {
  const lessonId = FIXTURE_IDS[3];
  const rows = await openAttendance(page, lessonId);
  await setStatus(rows.nth(0), "present");
  await page.locator("#attendanceCorrectionReason").fill("Relay snapshot parity verification");
  await rows.nth(0).locator(".attendance-student-note").fill("PostgreSQL to SQLite event parity");
  await page.screenshot({ path: path.join(OUTPUT_DIR, "09-relay-parity-correction.png"), fullPage: true });
  await saveAndWait(page, lessonId);
  report.operations.push({ number: 19, lessonId, type: "relay-parity-correction", firstStatus: "present", ok: true });
  await openAttendance(page, lessonId);
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUTPUT_DIR, "10-relay-parity-saved.png"), fullPage: true });
  await page.evaluate(() => window.closeAppModal());
}

async function captureRelayParity(page) {
  await openAttendance(page, FIXTURE_IDS[3]);
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(OUTPUT_DIR, "10-relay-parity-saved.png") });
  await page.evaluate(() => window.closeAppModal());
}

async function reopenAndAlertOperations(page, report) {
  const reopenLessonId = FIXTURE_IDS[14];
  await openAttendance(page, reopenLessonId);
  const reopenButton = page.getByRole("button", { name: /Darsni qayta ochish/ });
  await reopenButton.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(OUTPUT_DIR, "11-reopen-ready.png") });
  page.once("dialog", (dialog) => dialog.accept("Clean Architecture reopen canary"));
  const [reopenResponse] = await Promise.all([
    page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname === `/api/lessons/${reopenLessonId}/reopen`),
    reopenButton.click(),
  ]);
  if (reopenResponse.status() !== 200) throw new Error(`Reopen API returned ${reopenResponse.status()}`);
  await page.locator(".modal-backdrop").waitFor({ state: "detached" });
  report.operations.push({ number: 20, lessonId: reopenLessonId, type: "reopen", ok: true });

  await openAttendance(page, reopenLessonId);
  await page.screenshot({ path: path.join(OUTPUT_DIR, "12-reopened-empty-attendance.png") });
  await page.locator(".attendance-toolbar .ghost-button").click();
  await saveAndWait(page, reopenLessonId);
  report.operations.push({ number: 21, lessonId: reopenLessonId, type: "remark-after-reopen", firstStatus: "present", ok: true });
  await openAttendance(page, reopenLessonId);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUTPUT_DIR, "13-reopen-remarked.png") });
  await page.evaluate(() => window.closeAppModal());

  const alertLessonId = FIXTURE_IDS[13];
  const rows = await openAttendance(page, alertLessonId);
  await setStatus(rows.nth(1), "late");
  await page.locator("#attendanceCorrectionReason").fill("Alert StoreRouter canary");
  await rows.nth(1).locator(".attendance-student-note").fill("Telegram alert routing verification");
  await saveAndWait(page, alertLessonId);
  report.operations.push({ number: 22, lessonId: alertLessonId, type: "prepare-alert-candidate", firstStatus: "late", ok: true });

  await openAttendance(page, alertLessonId);
  await page.locator(".attendance-alert-button").click();
  await page.locator(".attendance-alert-modal").waitFor({ state: "visible" });
  await page.screenshot({ path: path.join(OUTPUT_DIR, "14-alert-confirm.png") });
  const [alertResponse] = await Promise.all([
    page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname === `/api/lessons/${alertLessonId}/send-attendance-alerts`),
    page.locator(".attendance-alert-modal .primary-button").click(),
  ]);
  const alertResult = await alertResponse.json();
  if (alertResponse.status() !== 200 || Number(alertResult.sent_count || 0) < 1) {
    throw new Error(`Attendance alert API returned ${alertResponse.status()}: ${JSON.stringify(alertResult)}`);
  }
  await page.locator(".modal-backdrop").waitFor({ state: "detached" });
  await page.screenshot({ path: path.join(OUTPUT_DIR, "15-alert-queued.png") });
  report.operations.push({ number: 23, lessonId: alertLessonId, type: "send-alert", ...alertResult, ok: true });
}

async function reopenRelayRetry(page, report) {
  const lessonId = FIXTURE_IDS[14];
  await openAttendance(page, lessonId);
  const reopenButton = page.getByRole("button", { name: /Darsni qayta ochish/ });
  await reopenButton.scrollIntoViewIfNeeded();
  page.once("dialog", (dialog) => dialog.accept("Relay history ordering verification"));
  const [response] = await Promise.all([
    page.waitForResponse((candidate) => candidate.request().method() === "POST" && new URL(candidate.url()).pathname === `/api/lessons/${lessonId}/reopen`),
    reopenButton.click(),
  ]);
  const reopened = await response.json();
  if (response.status() !== 200 || reopened.status !== "planned") {
    throw new Error(`Relay retry reopen returned ${response.status()}: ${JSON.stringify(reopened)}`);
  }
  report.operations.push({ number: 24, lessonId, type: "reopen-relay-retry", ok: true });
  await openAttendance(page, lessonId);
  await page.screenshot({ path: path.join(OUTPUT_DIR, "16-reopen-relay-waiting.png") });
  await page.locator(".attendance-toolbar .ghost-button").click();
  await saveAndWait(page, lessonId);
  report.operations.push({ number: 25, lessonId, type: "remark-relay-retry", firstStatus: "present", ok: true });
  await openAttendance(page, lessonId);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUTPUT_DIR, "17-reopen-relay-restored.png") });
  await page.evaluate(() => window.closeAppModal());
}

async function readYourWriteOperation(page, report) {
  const lessonId = FIXTURE_IDS[14];
  await openAttendance(page, lessonId);
  const reopenButton = page.getByRole("button", { name: /Darsni qayta ochish/ });
  await reopenButton.scrollIntoViewIfNeeded();
  page.once("dialog", (dialog) => dialog.accept("Read-your-write primary-store verification"));
  const [response] = await Promise.all([
    page.waitForResponse((candidate) => candidate.request().method() === "POST" && new URL(candidate.url()).pathname === `/api/lessons/${lessonId}/reopen`),
    reopenButton.click(),
  ]);
  if (response.status() !== 200) throw new Error(`Read-your-write reopen returned ${response.status()}`);
  report.operations.push({ number: 26, lessonId, type: "reopen-read-your-write", ok: true });
  await openAttendance(page, lessonId);
  const correctionFieldCount = await page.locator("#attendanceCorrectionReason").count();
  const selectedStatuses = await page.locator(".attendance-row button.segment.active").count();
  if (correctionFieldCount !== 0 || selectedStatuses !== 0) {
    throw new Error(`Primary-store read is stale: correctionFields=${correctionFieldCount}, selectedStatuses=${selectedStatuses}`);
  }
  await page.screenshot({ path: path.join(OUTPUT_DIR, "18-read-your-write-reopened.png") });
  await page.locator(".attendance-toolbar .ghost-button").click();
  await saveAndWait(page, lessonId);
  report.operations.push({ number: 27, lessonId, type: "remark-read-your-write", firstStatus: "present", ok: true });
  await openAttendance(page, lessonId);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUTPUT_DIR, "19-read-your-write-restored.png") });
  await page.evaluate(() => window.closeAppModal());
}

async function rollbackDrillWrite(page, report) {
  const lessonId = FIXTURE_IDS[12];
  const rows = await openAttendance(page, lessonId);
  await setStatus(rows.nth(0), "absent");
  await page.locator("#attendanceCorrectionReason").fill("Formal reverse relay rollback drill");
  await rows.nth(0).locator(".attendance-student-note").fill("Pending PostgreSQL event for rollback drill");
  await page.screenshot({ path: path.join(OUTPUT_DIR, "20-rollback-drill-write.png") });
  await saveAndWait(page, lessonId);
  report.operations.push({ number: 28, lessonId, type: "rollback-drill-write", firstStatus: "absent", ok: true });
}

async function teacherReadOnlyCheck(browser, report) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  await login(page, "teacher", "teacher123");
  await openAttendance(page, FIXTURE_IDS[0]);
  const disabledSegments = await page.locator(".attendance-row button.segment:disabled").count();
  const saveDisabled = await page.locator(".attendance-save-row .primary-button").isDisabled();
  const lockVisible = await page.locator(".attendance-lock-notice").isVisible();
  if (disabledSegments !== 8 || !saveDisabled || !lockVisible) {
    throw new Error("Teacher completed-attendance read-only gate failed");
  }
  await page.screenshot({ path: path.join(OUTPUT_DIR, "04-teacher-readonly.png"), fullPage: true });
  report.teacherReadOnly = { disabledSegments, saveDisabled, lockVisible, ok: true };
  await context.close();
}

async function mobileScreenshot(browser, report) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await login(page, "admin", "admin123");
  await openAttendance(page, FIXTURE_IDS[14]);
  await page.screenshot({ path: path.join(OUTPUT_DIR, "05-mobile-completed-attendance.png"), fullPage: true });
  report.mobile = { width: 390, height: 844, ok: true };
  await context.close();
}

async function run() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const verifyExisting = process.argv.includes("--verify-existing");
  const postExtractionSmoke = process.argv.includes("--post-extraction-smoke");
  const capturePostExtractionOnly = process.argv.includes("--capture-post-extraction");
  const relayParitySmoke = process.argv.includes("--relay-parity-smoke");
  const captureRelayParityOnly = process.argv.includes("--capture-relay-parity");
  const reopenAlertSmoke = process.argv.includes("--reopen-alert-smoke");
  const reopenRelayRetrySmoke = process.argv.includes("--reopen-relay-retry");
  const readYourWriteSmoke = process.argv.includes("--read-your-write-smoke");
  const rollbackDrillWriteSmoke = process.argv.includes("--rollback-drill-write");
  const existingReportPath = path.join(OUTPUT_DIR, "ui-report.json");
  const previous = (verifyExisting || postExtractionSmoke || capturePostExtractionOnly || relayParitySmoke || captureRelayParityOnly || reopenAlertSmoke || reopenRelayRetrySmoke || readYourWriteSmoke || rollbackDrillWriteSmoke) && fs.existsSync(existingReportPath)
    ? JSON.parse(fs.readFileSync(existingReportPath, "utf8"))
    : null;
  const report = {
    startedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    operations: previous?.operations || [],
    consoleErrors: [],
    expectedConsoleMessages: [],
    pageErrors: [],
  };
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    page.on("console", (message) => {
      if (message.type() !== "error") return;
      if (/status of 401 \(Unauthorized\)/.test(message.text())) {
        report.expectedConsoleMessages.push(message.text());
      } else {
        report.consoleErrors.push(message.text());
      }
    });
    page.on("pageerror", (error) => report.pageErrors.push(error.message));
    await login(page, "admin", "admin123");
    if (rollbackDrillWriteSmoke) {
      await rollbackDrillWrite(page, report);
    } else if (readYourWriteSmoke) {
      await readYourWriteOperation(page, report);
    } else if (reopenRelayRetrySmoke) {
      await reopenRelayRetry(page, report);
    } else if (reopenAlertSmoke) {
      await reopenAndAlertOperations(page, report);
    } else if (captureRelayParityOnly) {
      await captureRelayParity(page);
    } else if (relayParitySmoke) {
      await relayParityOperation(page, report);
    } else if (capturePostExtractionOnly) {
      await capturePostExtraction(page);
    } else if (postExtractionSmoke) {
      await postExtractionOperation(page, report);
    } else if (verifyExisting) {
      await openAttendance(page, FIXTURE_IDS[0]);
      const status = await page.locator(".attendance-context .status").textContent();
      if (!String(status || "").trim()) throw new Error("Existing completed attendance status is missing");
      await page.screenshot({ path: path.join(OUTPUT_DIR, "06-admin-verified-completed.png"), fullPage: true });
      await page.evaluate(() => window.closeAppModal());
    } else {
      await initialAttendanceOperations(page, report);
      await correctionOperations(page, report);
    }
    await context.close();
    await teacherReadOnlyCheck(browser, report);
    await mobileScreenshot(browser, report);
  } finally {
    await browser.close();
  }
  report.completedAt = new Date().toISOString();
  const expectedOperations = rollbackDrillWriteSmoke ? 28 : readYourWriteSmoke ? 27 : reopenRelayRetrySmoke ? 25 : reopenAlertSmoke ? 23 : (relayParitySmoke || captureRelayParityOnly) ? 19 : (postExtractionSmoke || capturePostExtractionOnly) ? 18 : 17;
  report.ok = report.operations.length === expectedOperations && report.operations.every((operation) => operation.ok)
    && report.consoleErrors.length === 0 && report.pageErrors.length === 0
    && report.teacherReadOnly?.ok && report.mobile?.ok;
  fs.writeFileSync(path.join(OUTPUT_DIR, "ui-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 2;
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
