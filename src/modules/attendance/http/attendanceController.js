const { readBody, sendJson } = require("../../../http/json");
const { requestContext, requireTenantContext } = require("../../../services/context");

function lessonIdFrom(pathname, action) {
  const match = pathname.match(new RegExp(`^/api/lessons/([^/]+)/${action}$`));
  return match ? decodeURIComponent(match[1]) : "";
}

function reasonIdFrom(pathname) {
  const match = pathname.match(/^\/api\/attendance-reasons\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : "";
}

function createAttendanceController({
  getAttendanceLesson,
  markAttendance,
  reopenAttendance,
  sendAttendanceAlerts,
  listAttendanceReasons,
  createAttendanceReason,
  updateAttendanceReason,
  execute,
}) {
  const mark = markAttendance || execute;
  return {
    async lesson(req, res, pathname) {
      const context = requestContext(req);
      requireTenantContext(context);
      const result = await getAttendanceLesson(context, lessonIdFrom(pathname, "students"));
      sendJson(res, 200, result);
    },
    async mark(req, res) {
      const context = requestContext(req);
      requireTenantContext(context);
      const result = await mark(context, await readBody(req));
      sendJson(res, 200, result);
    },
    async reopen(req, res, pathname) {
      const context = requestContext(req);
      requireTenantContext(context);
      const result = await reopenAttendance(context, lessonIdFrom(pathname, "reopen"), await readBody(req));
      sendJson(res, 200, result);
    },
    async sendAlerts(req, res, pathname) {
      const context = requestContext(req);
      requireTenantContext(context);
      await readBody(req);
      const result = await sendAttendanceAlerts(context, lessonIdFrom(pathname, "send-attendance-alerts"));
      sendJson(res, 200, result);
    },
    async listReasons(req, res) {
      const context = requestContext(req);
      requireTenantContext(context);
      const result = await listAttendanceReasons(context);
      sendJson(res, 200, { attendanceReasons: result });
    },
    async createReason(req, res) {
      const context = requestContext(req);
      requireTenantContext(context);
      const result = await createAttendanceReason(context, await readBody(req));
      sendJson(res, 201, result);
    },
    async updateReason(req, res, pathname) {
      const context = requestContext(req);
      requireTenantContext(context);
      const result = await updateAttendanceReason(context, reasonIdFrom(pathname), await readBody(req));
      sendJson(res, 200, result);
    },
  };
}

module.exports = { createAttendanceController };
