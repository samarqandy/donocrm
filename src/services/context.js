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
    realRole: user.realRole || user.role,
	    activeTenantId: user.activeTenantId || null,
	    tenantStatus: user.tenantStatus || "",
	    platformMode: Boolean(user.platformMode),
    userId: user.id,
    user,
    sessionId,
  };
}

function requireAdmin(context) {
  if (context.role !== "admin") {
    const error = new Error("Admin role is required");
    error.status = 403;
    throw error;
  }
}

function requireSuperAdmin(context) {
  if (context.realRole !== "superadmin") {
    const error = new Error("SuperAdmin role is required");
    error.status = 403;
    throw error;
  }
}

function requireTenantContext(context) {
  if (!context.tenantId) {
    const error = new Error("Tenant context is required");
    error.status = 403;
    throw error;
  }
  if (context.realRole !== "superadmin" && ["suspended", "blocked"].includes(context.tenantStatus)) {
    const error = new Error("Tenant is suspended");
    error.status = 403;
    throw error;
  }
}

module.exports = { requestContext, requireAdmin, requireSuperAdmin, requireTenantContext };
