const crypto = require("node:crypto");
const { now } = require("../utils/time");
const { DUMMY_PASSWORD_HASH, verifyPassword } = require("../utils/password");

class AuthService {
  constructor(repository) {
    this.repository = repository;
  }

  async login(username, password) {
    const user = this.repository.userByUsername(String(username || "").trim());
    const passwordValid = await verifyPassword(password || "", user?.password || DUMMY_PASSWORD_HASH);
    if (!user || !passwordValid) {
      const error = new Error("Login yoki parol noto'g'ri");
      error.status = 401;
      throw error;
    }
    if (user.user_status && user.user_status !== "active") {
      const error = new Error("Foydalanuvchi kirishi bloklangan");
      error.status = 403;
      throw error;
    }
    if (user.role !== "superadmin" && ["suspended", "blocked"].includes(user.tenant_status)) {
      const error = new Error("Markaz vaqtincha bloklangan");
      error.status = 403;
      throw error;
    }

    const sessionId = crypto.randomBytes(32).toString("hex");
    const createdAt = now();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    this.repository.createSession(user, sessionId, createdAt, expiresAt);

    return {
      sessionId,
      user: this.publicUser(user),
    };
  }

  userFromSession(sessionId) {
    if (!sessionId) return null;
    const user = this.repository.userBySession(sessionId, now());
    return user ? this.publicUser(user) : null;
  }

  logout(sessionId) {
    if (sessionId) this.repository.deleteSession(sessionId);
  }

  switchTenant(sessionId, tenantId) {
    if (!sessionId) {
      const error = new Error("Unauthorized");
      error.status = 401;
      throw error;
    }
    const tenant = this.repository.platformTenant(tenantId);
    if (!tenant) {
      const error = new Error("Tenant not found");
      error.status = 404;
      throw error;
    }
    this.repository.setSessionActiveTenant(sessionId, tenant.id);
    return this.userFromSession(sessionId);
  }

  exitTenant(sessionId) {
    if (!sessionId) {
      const error = new Error("Unauthorized");
      error.status = 401;
      throw error;
    }
    this.repository.setSessionActiveTenant(sessionId, null);
    return this.userFromSession(sessionId);
  }

  publicUser(user) {
    const realRole = user.role;
    const activeTenantId = user.active_tenant_id || null;
    const effectiveRole = realRole === "superadmin" && activeTenantId ? "admin" : realRole;
    return {
      id: user.id,
      tenantId: realRole === "superadmin" ? activeTenantId : user.tenant_id,
      homeTenantId: user.tenant_id || null,
      activeTenantId,
      username: user.username,
      name: user.name,
	      role: effectiveRole,
	      realRole,
	      tenantStatus: user.tenant_status || "",
	      userStatus: user.user_status || "active",
	      platformMode: realRole === "superadmin" && !activeTenantId,
	    };
  }
}

module.exports = { AuthService };
