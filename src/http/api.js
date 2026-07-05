const { requestContext, requireAdmin } = require("../services/context");
const { services } = require("../services/container");
const { readBody, sendJson } = require("./json");
const { clearSessionCookie, parseCookies, sessionCookie } = require("./cookies");

async function api(req, res, pathname) {
  const allServices = services();
  const app = allServices.app;
  const auth = allServices.auth;
  const method = req.method;

  try {
    if (method === "POST" && pathname === "/api/login") {
      const body = await readBody(req);
      const result = auth.login(body.username, body.password);
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

    if (method === "GET" && pathname === "/api/bootstrap") {
      return sendJson(res, 200, app.bootstrap(context));
    }

    if (method === "POST" && pathname === "/api/students") {
      requireAdmin(context);
      return sendJson(res, 201, app.createStudent(context, await readBody(req)));
    }

    if (method === "POST" && pathname === "/api/groups") {
      requireAdmin(context);
      return sendJson(res, 201, app.createGroup(context, await readBody(req)));
    }

    if (method === "POST" && pathname === "/api/lessons") {
      requireAdmin(context);
      return sendJson(res, 201, app.createLesson(context, await readBody(req)));
    }

    if (method === "POST" && pathname === "/api/attendance") {
      return sendJson(res, 200, app.saveAttendance(context, await readBody(req)));
    }

    if (method === "POST" && pathname === "/api/payments") {
      requireAdmin(context);
      return sendJson(res, 201, app.createPayment(context, await readBody(req)));
    }

    if (method === "POST" && pathname === "/api/messages") {
      requireAdmin(context);
      return sendJson(res, 201, app.createMessage(context, await readBody(req)));
    }

    if (method === "POST" && pathname === "/api/settings/telegram") {
      requireAdmin(context);
      return sendJson(res, 200, app.updateTelegramSettings(context, await readBody(req)));
    }

    if (method === "POST" && pathname === "/api/messages/process") {
      requireAdmin(context);
      await readBody(req);
      return sendJson(res, 200, app.processMessages(context));
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
    return sendJson(res, error.status || 500, { error: error.message || "Server error" });
  }
}

module.exports = { api };
