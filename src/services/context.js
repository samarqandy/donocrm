const { parseCookies } = require("../http/cookies");
const { services } = require("./container");

function requestContext(req) {
  const sessionId = parseCookies(req).dono_session;
  const user = services().auth.userFromSession(sessionId);
  if (!user) {
    const error = new Error("Unauthorized");
    error.status = 401;
    throw error;
  }
  return {
    tenantId: user.tenantId,
    role: user.role,
    userId: user.id,
    user,
    sessionId,
  };
}

function requireAdmin(context) {
  if (context.role === "teacher") {
    const error = new Error("Teacher role is not allowed for this action");
    error.status = 403;
    throw error;
  }
}

module.exports = { requestContext, requireAdmin };
