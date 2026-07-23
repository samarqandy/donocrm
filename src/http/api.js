const { requestContext, requireAdmin, requireSuperAdmin, requireTenantContext } = require("../services/context");
const { services } = require("../services/container");
const { getDb } = require("../db/client");
const { readBody, sendJson } = require("./json");
const { clearSessionCookie, parseCookies, sessionCookie } = require("./cookies");
const { clientIp, loginRateLimiter } = require("../security/loginRateLimiter");
const { stranglerRouter } = require("../bootstrap/stranglerContainer");

const XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function autoFitColumns(worksheet) {
  worksheet.columns.forEach((column) => {
    let width = 8;
    column.eachCell({ includeEmpty: true }, (cell) => {
      const value = cell.value == null ? "" : String(cell.value);
      width = Math.max(width, value.length + 2);
    });
    column.width = Math.min(width, 60);
  });
}

function addWorksheet(workbook, name, headers, rows) {
  const worksheet = workbook.addWorksheet(name);
  worksheet.addRow(headers);
  rows.forEach((row) => worksheet.addRow(row));
  worksheet.getRow(1).font = { bold: true };
  autoFitColumns(worksheet);
}

function requirePermission(context, app, permission) {
  const permissions = app.myPermissions(context).permissions || [];
  if (!permissions.includes(permission)) {
    const error = new Error("Permission is required");
    error.status = 403;
    throw error;
  }
}

async function sendWorkbook(res, workbook, filename) {
  const buffer = await workbook.xlsx.writeBuffer();
  res.writeHead(200, {
    "Content-Type": XLSX_CONTENT_TYPE,
    "Content-Disposition": `attachment; filename=${filename}`,
  });
  res.end(Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer));
}

async function exportStudents(context, res) {
  const ExcelJS = require("exceljs");
  const rows = getDb()
    .prepare("SELECT id, name, phone, status, balance FROM students WHERE tenant_id = ? ORDER BY name")
    .all(context.tenantId);
  const workbook = new ExcelJS.Workbook();
  addWorksheet(
    workbook,
    "Oquvchilar",
    ["ID", "Ism", "Telefon", "Holati", "Balans"],
    rows.map((row) => [row.id, row.name, row.phone || "", row.status, row.balance]),
  );
  return sendWorkbook(res, workbook, "oquvchilar.xlsx");
}

async function exportPayments(context, res) {
  const ExcelJS = require("exceljs");
  const rows = getDb()
    .prepare(
	      `SELECT s.name as student_name, i.amount, i.type, i.description, i.invoice_date
	       FROM invoices_transactions i
	       JOIN students s ON i.student_id = s.id AND s.tenant_id = ?
	       WHERE i.tenant_id = ? AND i.type IN ('payment', 'charge') AND COALESCE(i.status, 'active') = 'active'
	       ORDER BY i.invoice_date DESC`,
	    )
	    .all(context.tenantId, context.tenantId);
  const workbook = new ExcelJS.Workbook();
  addWorksheet(
    workbook,
    "Tolovlar",
    ["O'quvchi", "Summa", "Turi", "Izoh", "Sana"],
    rows.map((row) => [row.student_name, row.amount, row.type, row.description || "", row.invoice_date]),
  );
  return sendWorkbook(res, workbook, "tolovlar.xlsx");
}

async function api(req, res, pathname) {
  const allServices = services();
  const app = allServices.app;
  const auth = allServices.auth;
  const method = req.method;

  try {
    if (method === "POST" && pathname === "/api/login") {
      const limiterKey = clientIp(req);
      const limit = loginRateLimiter.consume(limiterKey);
      res.setHeader("X-RateLimit-Limit", "5");
      res.setHeader("X-RateLimit-Remaining", String(limit.remaining));
      if (!limit.allowed) {
        res.setHeader("Retry-After", String(limit.retryAfterSeconds));
        req.resume?.();
        return sendJson(res, 429, { error: "Too many login attempts. Try again later." });
      }
      const body = await readBody(req);
      const result = await auth.login(body.username, body.password);
      loginRateLimiter.reset(limiterKey);
      res.setHeader("Set-Cookie", sessionCookie(result.sessionId));
      return sendJson(res, 200, { user: result.user });
    }

    if (method === "POST" && pathname === "/api/logout") {
      const sessionId = parseCookies(req).dono_session;
      auth.logout(sessionId);
      res.setHeader("Set-Cookie", clearSessionCookie());
      return sendJson(res, 200, { ok: true });
    }

    if (method === "GET" && pathname === "/api/me") {
      const user = auth.userFromSession(parseCookies(req).dono_session);
      if (!user) return sendJson(res, 401, { error: "Unauthorized" });
      return sendJson(res, 200, { user });
    }

    const context = requestContext(req);

	    if (method === "GET" && pathname === "/api/platform/tenants") {
	      requireSuperAdmin(context);
	      return sendJson(res, 200, { tenants: app.platformTenants(context) });
	    }

    if (method === "GET" && pathname === "/api/platform/audit-logs") {
      requireSuperAdmin(context);
      return sendJson(res, 200, { auditLogs: app.platformAuditLogs(context) });
    }

    if (method === "POST" && pathname === "/api/platform/tenants") {
      requireSuperAdmin(context);
      return sendJson(res, 201, app.createPlatformTenant(context, await readBody(req)));
    }

	    const platformTenantUserMatch = pathname.match(/^\/api\/platform\/tenants\/([^/]+)\/users$/);
    if (method === "POST" && platformTenantUserMatch) {
      requireSuperAdmin(context);
	      return sendJson(res, 201, await app.createPlatformTenantAdmin(context, decodeURIComponent(platformTenantUserMatch[1]), await readBody(req)));
	    }

    const platformTenantMatch = pathname.match(/^\/api\/platform\/tenants\/([^/]+)$/);
    if (method === "PATCH" && platformTenantMatch) {
      requireSuperAdmin(context);
      return sendJson(res, 200, app.updatePlatformTenant(context, decodeURIComponent(platformTenantMatch[1]), await readBody(req)));
    }

    if (method === "POST" && pathname === "/api/platform/switch-tenant") {
      requireSuperAdmin(context);
	      const body = await readBody(req);
	      const user = auth.switchTenant(context.sessionId, body.tenantId || body.tenant_id || "");
      app.recordPlatformAudit(context, "switched", "tenant", body.tenantId || body.tenant_id || "", body.tenantId || body.tenant_id || "");
	      return sendJson(res, 200, { user });
	    }

    if (method === "POST" && pathname === "/api/platform/exit-tenant") {
      requireSuperAdmin(context);
	      await readBody(req);
	      const user = auth.exitTenant(context.sessionId);
      app.recordPlatformAudit(context, "exited", "tenant_mode", context.activeTenantId || "", context.activeTenantId || null);
	      return sendJson(res, 200, { user });
	    }

    if (method === "GET" && pathname === "/api/bootstrap") {
      return sendJson(res, 200, await app.bootstrap(context));
    }

	    requireTenantContext(context);

    if (method === "PUT" && pathname === "/api/settings/center") {
      requireAdmin(context);
      return sendJson(res, 200, app.updateCenterSettings(context, await readBody(req)));
    }

    if (method === "POST" && pathname === "/api/settings/password") {
      return sendJson(res, 200, await app.changePassword(context, await readBody(req)));
    }

    if (method === "GET" && pathname === "/api/permissions/me") {
      return sendJson(res, 200, app.myPermissions(context));
    }

    if (method === "GET" && pathname === "/api/roles") {
      requireAdmin(context);
      return sendJson(res, 200, { roles: app.listRoles(context) });
    }

    if (method === "GET" && pathname === "/api/branches") {
      requirePermission(context, app, "branches.manage");
      return sendJson(res, 200, { branches: app.listBranches(context) });
    }

    if (method === "POST" && pathname === "/api/branches") {
      requirePermission(context, app, "branches.manage");
      return sendJson(res, 201, app.createBranch(context, await readBody(req)));
    }

    if (method === "GET" && pathname === "/api/subscriptions") {
      requirePermission(context, app, "subscriptions.manage");
      return sendJson(res, 200, { subscriptions: app.listSubscriptions(context) });
    }

    if (method === "POST" && pathname === "/api/subscriptions") {
      requirePermission(context, app, "subscriptions.manage");
      return sendJson(res, 201, app.createSubscription(context, await readBody(req)));
    }

    if (method === "GET" && pathname === "/api/attendance-reasons") {
      await stranglerRouter().dispatch(req, res, pathname);
      return;
    }

    if (method === "POST" && pathname === "/api/attendance-reasons") {
      await stranglerRouter().dispatch(req, res, pathname);
      return;
    }

    const attendanceReasonMatch = pathname.match(/^\/api\/attendance-reasons\/([^/]+)$/);
    if (method === "PATCH" && attendanceReasonMatch) {
      await stranglerRouter().dispatch(req, res, pathname);
      return;
    }

    if (method === "GET" && pathname === "/api/finance/lesson-billing-policies") {
      requireAdmin(context);
      requirePermission(context, app, "lesson_finance.read");
      return sendJson(res, 200, { billingPolicies: app.listLessonBillingPolicies(context) });
    }

    if (method === "POST" && pathname === "/api/finance/lesson-billing-policies") {
      requireAdmin(context);
      requirePermission(context, app, "lesson_finance.confirm");
      return sendJson(res, 201, app.createLessonBillingPolicy(context, await readBody(req)));
    }

    if (method === "GET" && pathname === "/api/finance/teacher-rate-rules") {
      requireAdmin(context);
      requirePermission(context, app, "payroll.manage");
      return sendJson(res, 200, { teacherRateRules: app.listTeacherRateRules(context) });
    }

    if (method === "POST" && pathname === "/api/finance/teacher-rate-rules") {
      requireAdmin(context);
      requirePermission(context, app, "payroll.manage");
      return sendJson(res, 201, app.createTeacherRateRule(context, await readBody(req)));
    }

    const teacherRateRuleArchiveMatch = pathname.match(/^\/api\/finance\/teacher-rate-rules\/([^/]+)\/archive$/);
    if (method === "POST" && teacherRateRuleArchiveMatch) {
      requireAdmin(context);
      requirePermission(context, app, "payroll.manage");
      return sendJson(res, 200, app.archiveTeacherRateRule(context, decodeURIComponent(teacherRateRuleArchiveMatch[1]), await readBody(req)));
    }

    if (method === "GET" && pathname === "/api/finance/periods") {
      requireAdmin(context);
      requirePermission(context, app, "finance_periods.manage");
      return sendJson(res, 200, { financePeriods: app.listFinancePeriods(context) });
    }

    if (method === "POST" && pathname === "/api/finance/periods") {
      requireAdmin(context);
      requirePermission(context, app, "finance_periods.manage");
      return sendJson(res, 201, app.createFinancePeriod(context, await readBody(req)));
    }

    const financePeriodCloseMatch = pathname.match(/^\/api\/finance\/periods\/([^/]+)\/close$/);
    if (method === "POST" && financePeriodCloseMatch) {
      requireAdmin(context);
      requirePermission(context, app, "finance_periods.manage");
      return sendJson(res, 200, app.closeFinancePeriod(context, decodeURIComponent(financePeriodCloseMatch[1]), await readBody(req)));
    }

    const financePeriodReopenMatch = pathname.match(/^\/api\/finance\/periods\/([^/]+)\/reopen$/);
    if (method === "POST" && financePeriodReopenMatch) {
      requireAdmin(context);
      requirePermission(context, app, "finance_periods.manage");
      return sendJson(res, 200, app.reopenFinancePeriod(context, decodeURIComponent(financePeriodReopenMatch[1]), await readBody(req)));
    }

    if (method === "GET" && pathname === "/api/teacher-working-hours") {
      return sendJson(res, 200, { workingHours: app.listTeacherWorkingHours(context) });
    }

    if (method === "POST" && pathname === "/api/teacher-working-hours") {
      requirePermission(context, app, "lessons.manage");
      return sendJson(res, 201, app.createTeacherWorkingHour(context, await readBody(req)));
    }

    const teacherWorkingHourMatch = pathname.match(/^\/api\/teacher-working-hours\/([^/]+)$/);
    if (method === "DELETE" && teacherWorkingHourMatch) {
      requireAdmin(context);
      await readBody(req);
      return sendJson(res, 200, app.deleteTeacherWorkingHour(context, decodeURIComponent(teacherWorkingHourMatch[1])));
    }

    if (method === "GET" && pathname === "/api/finance/accounts") {
      requirePermission(context, app, "finance.manage");
      return sendJson(res, 200, { accounts: app.listFinanceAccounts(context) });
    }

    if (method === "POST" && pathname === "/api/finance/accounts") {
      requirePermission(context, app, "finance.manage");
      return sendJson(res, 201, app.createFinanceAccount(context, await readBody(req)));
    }

    if (method === "GET" && pathname === "/api/finance/categories") {
      requirePermission(context, app, "finance.manage");
      return sendJson(res, 200, { categories: app.listFinanceCategories(context) });
    }

    if (method === "POST" && pathname === "/api/finance/categories") {
      requirePermission(context, app, "finance.manage");
      return sendJson(res, 201, app.createFinanceCategory(context, await readBody(req)));
    }

    if (method === "GET" && pathname === "/api/tasks") {
      return sendJson(res, 200, { tasks: app.listTasks(context) });
    }

    if (method === "POST" && pathname === "/api/tasks") {
      requirePermission(context, app, "tasks.manage");
      return sendJson(res, 201, app.createTask(context, await readBody(req)));
    }

    const taskMatch = pathname.match(/^\/api\/tasks\/([^/]+)$/);
    if (method === "PATCH" && taskMatch) {
      return sendJson(res, 200, app.updateTask(context, decodeURIComponent(taskMatch[1]), await readBody(req)));
    }

    if (method === "GET" && pathname === "/api/schedules/week") {
      const parsed = new URL(req.url, `http://${req.headers.host || "localhost"}`);
      return sendJson(res, 200, app.weeklySchedule(context, parsed.searchParams.get("date")));
    }

    if (method === "GET" && pathname === "/api/export/students") {
      requireAdmin(context);
      return await exportStudents(context, res);
    }

    if (method === "GET" && pathname === "/api/export/payments") {
      requireAdmin(context);
      return await exportPayments(context, res);
    }

    const studentLedgerMatch = pathname.match(/^\/api\/students\/([^/]+)\/ledger$/);
    if (method === "GET" && studentLedgerMatch) {
      requireAdmin(context);
      return sendJson(res, 200, app.getStudentLedger(context, decodeURIComponent(studentLedgerMatch[1])));
    }

    const studentTransactionMatch = pathname.match(/^\/api\/students\/([^/]+)\/transactions$/);
    if (method === "POST" && studentTransactionMatch) {
      requireAdmin(context);
      return sendJson(res, 201, app.addTransaction(context, decodeURIComponent(studentTransactionMatch[1]), await readBody(req)));
    }

    const studentChatIdMatch = pathname.match(/^\/api\/students\/([^/]+)\/chat-id$/);
    if (method === "POST" && studentChatIdMatch) {
      requireAdmin(context);
      return sendJson(res, 200, app.updateStudentChatId(context, decodeURIComponent(studentChatIdMatch[1]), await readBody(req)));
    }

    const studentTelegramLinkMatch = pathname.match(/^\/api\/students\/([^/]+)\/telegram-link$/);
    if (method === "POST" && studentTelegramLinkMatch) {
      requireAdmin(context);
      await readBody(req);
      return sendJson(res, 201, app.createStudentTelegramLink(context, decodeURIComponent(studentTelegramLinkMatch[1])));
    }

    if (method === "GET" && pathname === "/api/students") {
      const parsed = new URL(req.url, `http://${req.headers.host || "localhost"}`);
      const includeArchived = ["1", "true"].includes(String(parsed.searchParams.get("includeArchived") || "").toLowerCase());
      return sendJson(res, 200, { students: await app.listStudents(context, parsed.searchParams.get("search") || "", includeArchived) });
    }

    if (method === "GET" && pathname === "/api/groups") {
      const parsed = new URL(req.url, `http://${req.headers.host || "localhost"}`);
      const includeArchived = ["1", "true"].includes(String(parsed.searchParams.get("includeArchived") || "").toLowerCase());
      return sendJson(res, 200, { groups: await app.listGroups(context, includeArchived) });
    }

    if (method === "GET" && pathname === "/api/teachers") {
      return sendJson(res, 200, { teachers: app.listTeachers(context) });
    }

    if (method === "POST" && pathname === "/api/teachers") {
      requireAdmin(context);
      return sendJson(res, 201, await app.createTeacher(context, await readBody(req)));
    }

    const teacherPasswordMatch = pathname.match(/^\/api\/teachers\/([^/]+)\/reset-password$/);
    if (method === "POST" && teacherPasswordMatch) {
      requireAdmin(context);
      return sendJson(res, 200, await app.resetTeacherPassword(context, decodeURIComponent(teacherPasswordMatch[1]), await readBody(req)));
    }

    const teacherRestoreMatch = pathname.match(/^\/api\/teachers\/([^/]+)\/restore$/);
    if (method === "POST" && teacherRestoreMatch) {
      requireAdmin(context);
      await readBody(req);
      return sendJson(res, 200, app.restoreTeacher(context, decodeURIComponent(teacherRestoreMatch[1])));
    }

    const teacherMatch = pathname.match(/^\/api\/teachers\/([^/]+)$/);
    if (method === "GET" && teacherMatch) {
      return sendJson(res, 200, app.getTeacher(context, decodeURIComponent(teacherMatch[1])));
    }
    if (method === "PUT" && teacherMatch) {
      requireAdmin(context);
      return sendJson(res, 200, await app.updateTeacher(context, decodeURIComponent(teacherMatch[1]), await readBody(req)));
    }
    if (method === "DELETE" && teacherMatch) {
      requireAdmin(context);
      await readBody(req);
      return sendJson(res, 200, app.archiveTeacher(context, decodeURIComponent(teacherMatch[1])));
    }

    const lessonStudentsMatch = pathname.match(/^\/api\/lessons\/([^/]+)\/students$/);
    if (method === "GET" && lessonStudentsMatch) {
      await stranglerRouter().dispatch(req, res, pathname);
      return;
    }

    if (method === "GET" && pathname === "/api/lessons") {
      return sendJson(res, 200, { lessons: app.listLessons(context) });
    }

    const lessonMatch = pathname.match(/^\/api\/lessons\/([^/]+)$/);
    if (method === "GET" && lessonMatch) {
      return sendJson(res, 200, app.getLesson(context, decodeURIComponent(lessonMatch[1])));
    }

    if (method === "GET" && pathname === "/api/attendance-records") {
      return sendJson(res, 200, { attendanceRecords: await app.listAttendanceRecords(context) });
    }

    if (method === "GET" && pathname === "/api/payments") {
      requireAdmin(context);
      return sendJson(res, 200, { payments: app.listPayments(context) });
    }

    if (method === "GET" && pathname === "/api/messages") {
      requireAdmin(context);
      return sendJson(res, 200, { messages: app.listMessages(context) });
    }

    if (method === "POST" && pathname === "/api/students") {
      requireAdmin(context);
      return sendJson(res, 201, app.createStudent(context, await readBody(req)));
    }

    const studentProfileMatch = pathname.match(/^\/api\/students\/([^/]+)\/profile$/);
    if (method === "GET" && studentProfileMatch) {
      return sendJson(res, 200, await app.getStudentProfile(context, decodeURIComponent(studentProfileMatch[1])));
    }

    const studentRestoreMatch = pathname.match(/^\/api\/students\/([^/]+)\/restore$/);
    if (method === "POST" && studentRestoreMatch) {
      requireAdmin(context);
      await readBody(req);
      return sendJson(res, 200, app.restoreStudent(context, decodeURIComponent(studentRestoreMatch[1])));
    }

    const studentMatch = pathname.match(/^\/api\/students\/([^/]+)$/);
    if (method === "PUT" && studentMatch) {
      requireAdmin(context);
      return sendJson(res, 200, app.updateStudent(context, decodeURIComponent(studentMatch[1]), await readBody(req)));
    }

    if (method === "DELETE" && studentMatch) {
      requireAdmin(context);
      return sendJson(res, 200, app.deleteStudent(context, decodeURIComponent(studentMatch[1]), await readBody(req)));
    }

    if (method === "POST" && pathname === "/api/groups") {
      requireAdmin(context);
      return sendJson(res, 201, app.createGroup(context, await readBody(req)));
    }

    const groupProfileMatch = pathname.match(/^\/api\/groups\/([^/]+)\/profile$/);
    if (method === "GET" && groupProfileMatch) {
      return sendJson(res, 200, await app.getGroupProfile(context, decodeURIComponent(groupProfileMatch[1])));
    }

    const groupRestoreMatch = pathname.match(/^\/api\/groups\/([^/]+)\/restore$/);
    if (method === "POST" && groupRestoreMatch) {
      requireAdmin(context);
      await readBody(req);
      return sendJson(res, 200, app.restoreGroup(context, decodeURIComponent(groupRestoreMatch[1])));
    }

    const groupSchedulesMatch = pathname.match(/^\/api\/groups\/([^/]+)\/schedules$/);
    if (method === "GET" && groupSchedulesMatch) {
      const parsed = new URL(req.url, `http://${req.headers.host || "localhost"}`);
      const includeInactive = !["0", "false"].includes(String(parsed.searchParams.get("includeInactive") || "true").toLowerCase());
      return sendJson(res, 200, {
        schedules: app.listGroupSchedules(context, decodeURIComponent(groupSchedulesMatch[1]), includeInactive),
      });
    }
    if (method === "POST" && groupSchedulesMatch) {
      requireAdmin(context);
      return sendJson(res, 201, app.createGroupSchedule(context, decodeURIComponent(groupSchedulesMatch[1]), await readBody(req)));
    }

    const groupScheduleMatch = pathname.match(/^\/api\/group-schedules\/([^/]+)$/);
    const groupScheduleChangePreviewMatch = pathname.match(/^\/api\/group-schedules\/([^/]+)\/changes\/preview$/);
    if (method === "POST" && groupScheduleChangePreviewMatch) {
      requireAdmin(context);
      return sendJson(
        res,
        200,
        app.previewGroupScheduleChange(
          context,
          decodeURIComponent(groupScheduleChangePreviewMatch[1]),
          await readBody(req),
        ),
      );
    }
    const groupScheduleChangesMatch = pathname.match(/^\/api\/group-schedules\/([^/]+)\/changes$/);
    if (method === "POST" && groupScheduleChangesMatch) {
      requireAdmin(context);
      return sendJson(
        res,
        200,
        app.applyGroupScheduleChange(
          context,
          decodeURIComponent(groupScheduleChangesMatch[1]),
          await readBody(req),
        ),
      );
    }
    if (method === "PUT" && groupScheduleMatch) {
      requireAdmin(context);
      return sendJson(res, 200, app.updateGroupSchedule(context, decodeURIComponent(groupScheduleMatch[1]), await readBody(req)));
    }
    if (method === "DELETE" && groupScheduleMatch) {
      requireAdmin(context);
      await readBody(req);
      return sendJson(res, 200, app.disableGroupSchedule(context, decodeURIComponent(groupScheduleMatch[1])));
    }

    const groupMatch = pathname.match(/^\/api\/groups\/([^/]+)$/);
    if (method === "PUT" && groupMatch) {
      requireAdmin(context);
      return sendJson(res, 200, app.updateGroup(context, decodeURIComponent(groupMatch[1]), await readBody(req)));
    }

    if (method === "DELETE" && groupMatch) {
      requireAdmin(context);
      return sendJson(res, 200, app.archiveGroup(context, decodeURIComponent(groupMatch[1]), await readBody(req)));
    }

    if (method === "POST" && pathname === "/api/lessons") {
      requireAdmin(context);
      return sendJson(res, 201, app.createLesson(context, await readBody(req)));
    }

    if (method === "POST" && pathname === "/api/lesson-occurrences") {
      return sendJson(res, 201, app.materializeLesson(context, await readBody(req)));
    }

    if (method === "PUT" && lessonMatch) {
      requireAdmin(context);
      return sendJson(res, 200, app.updateLesson(context, decodeURIComponent(lessonMatch[1]), await readBody(req)));
    }

    const lessonCancelMatch = pathname.match(/^\/api\/lessons\/([^/]+)\/cancel$/);
    if (method === "POST" && lessonCancelMatch) {
      requireAdmin(context);
      return sendJson(res, 200, app.cancelLesson(context, decodeURIComponent(lessonCancelMatch[1]), await readBody(req)));
    }

    const lessonRestoreMatch = pathname.match(/^\/api\/lessons\/([^/]+)\/restore$/);
    if (method === "POST" && lessonRestoreMatch) {
      requireAdmin(context);
      return sendJson(res, 200, app.restoreLesson(context, decodeURIComponent(lessonRestoreMatch[1]), await readBody(req)));
    }

    const lessonReopenMatch = pathname.match(/^\/api\/lessons\/([^/]+)\/reopen$/);
    if (method === "POST" && lessonReopenMatch) {
      await stranglerRouter().dispatch(req, res, pathname);
      return;
    }

    const lessonFinancePreviewMatch = pathname.match(/^\/api\/lessons\/([^/]+)\/finance-preview$/);
    if (method === "GET" && lessonFinancePreviewMatch) {
      requireAdmin(context);
      requirePermission(context, app, "lesson_finance.read");
      return sendJson(res, 200, app.lessonFinancialPreview(context, decodeURIComponent(lessonFinancePreviewMatch[1])));
    }

    const lessonFinanceConfirmMatch = pathname.match(/^\/api\/lessons\/([^/]+)\/confirm-finance$/);
    if (method === "POST" && lessonFinanceConfirmMatch) {
      requireAdmin(context);
      requirePermission(context, app, "lesson_finance.confirm");
      return sendJson(res, 200, app.confirmLessonFinance(context, decodeURIComponent(lessonFinanceConfirmMatch[1]), await readBody(req)));
    }

    const lessonFinanceReverseMatch = pathname.match(/^\/api\/lessons\/([^/]+)\/reverse-finance$/);
    if (method === "POST" && lessonFinanceReverseMatch) {
      requireAdmin(context);
      requirePermission(context, app, "lesson_finance.reverse");
      return sendJson(res, 200, app.reverseLessonFinance(context, decodeURIComponent(lessonFinanceReverseMatch[1]), await readBody(req)));
    }

    const attendanceAlertsMatch = pathname.match(/^\/api\/lessons\/([^/]+)\/send-attendance-alerts$/);
    if (method === "POST" && attendanceAlertsMatch) {
      await stranglerRouter().dispatch(req, res, pathname);
      return;
    }

    // Compatibility for direct API harnesses; the HTTP server dispatches this route first.
    if (method === "POST" && pathname === "/api/attendance") {
      await stranglerRouter().dispatch(req, res, pathname);
      return;
    }

    if (method === "POST" && pathname === "/api/payments") {
      requireAdmin(context);
      return sendJson(res, 201, app.createPayment(context, await readBody(req)));
    }

    const paymentMatch = pathname.match(/^\/api\/payments\/([^/]+)$/);
    if (method === "PUT" && paymentMatch) {
      requireAdmin(context);
      return sendJson(res, 200, app.updatePayment(context, decodeURIComponent(paymentMatch[1]), await readBody(req)));
    }

    if (method === "DELETE" && paymentMatch) {
      requireAdmin(context);
      await readBody(req);
      return sendJson(res, 200, app.deletePayment(context, decodeURIComponent(paymentMatch[1])));
    }

    if (method === "POST" && pathname === "/api/messages") {
      requireAdmin(context);
      return sendJson(res, 201, app.createMessage(context, await readBody(req)));
    }

    if (method === "POST" && pathname === "/api/settings/telegram") {
      requireAdmin(context);
      return sendJson(res, 200, await app.updateTelegramSettings(context, await readBody(req)));
    }

    if (method === "POST" && pathname === "/api/telegram/test") {
      requireAdmin(context);
      return sendJson(res, 200, await app.testTelegram(context, await readBody(req)));
    }

    if (method === "POST" && pathname === "/api/messages/process") {
      requireAdmin(context);
      await readBody(req);
      return sendJson(res, 200, await app.processMessages(context));
    }

    if (method === "POST" && pathname === "/api/messages/retry-failed") {
      requireAdmin(context);
      await readBody(req);
      return sendJson(res, 200, app.retryFailedMessages(context));
    }

    if (method === "GET" && pathname === "/api/pipeline-stages") {
      requireAdmin(context);
      return sendJson(res, 200, { stages: app.listPipelineStages(context) });
    }

    if (method === "POST" && pathname === "/api/pipeline-stages") {
      requireAdmin(context);
      return sendJson(res, 201, app.createPipelineStage(context, await readBody(req)));
    }

    const pipelineStageMatch = pathname.match(/^\/api\/pipeline-stages\/([^/]+)$/);
    if (method === "PUT" && pipelineStageMatch) {
      requireAdmin(context);
      return sendJson(res, 200, app.updatePipelineStage(context, decodeURIComponent(pipelineStageMatch[1]), await readBody(req)));
    }

    if (method === "DELETE" && pipelineStageMatch) {
      requireAdmin(context);
      await readBody(req);
      return sendJson(res, 200, app.deletePipelineStage(context, decodeURIComponent(pipelineStageMatch[1])));
    }

    if (method === "GET" && pathname === "/api/leads") {
      requireAdmin(context);
      return sendJson(res, 200, { leads: app.listLeads(context) });
    }

	    const leadStageMatch = pathname.match(/^\/api\/leads\/([^/]+)\/stage$/);
	    if (method === "PATCH" && leadStageMatch) {
	      requireAdmin(context);
	      return sendJson(res, 200, app.updateLeadStage(context, decodeURIComponent(leadStageMatch[1]), await readBody(req)));
	    }

    const leadConvertMatch = pathname.match(/^\/api\/leads\/([^/]+)\/convert$/);
    if (method === "POST" && leadConvertMatch) {
      requireAdmin(context);
      return sendJson(res, 201, app.convertLeadToStudent(context, decodeURIComponent(leadConvertMatch[1]), await readBody(req)));
    }

    if (method === "POST" && pathname === "/api/leads") {
      requireAdmin(context);
      return sendJson(res, 201, app.createLead(context, await readBody(req)));
    }

    if (method === "POST" && pathname === "/api/import/students") {
      requireAdmin(context);
      return sendJson(res, 201, app.importStudents(context, await readBody(req)));
    }

    return sendJson(res, 404, { error: "API endpoint not found" });
  } catch (error) {
    return sendJson(res, error.status || 500, {
      error: error.message || "Server error",
      ...(error.details === undefined ? {} : { details: error.details }),
    });
  }
}

module.exports = { api };
