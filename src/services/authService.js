const crypto = require("node:crypto");
const { now } = require("../utils/time");
const { verifyPassword } = require("../utils/password");

class AuthService {
  constructor(repository) {
    this.repository = repository;
  }

  login(username, password) {
    const user = this.repository.userByUsername(String(username || "").trim());
    if (!user || !verifyPassword(password || "", user.password)) {
      const error = new Error("Login yoki parol noto'g'ri");
      error.status = 401;
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

  publicUser(user) {
    return {
      id: user.id,
      tenantId: user.tenant_id,
      username: user.username,
      name: user.name,
      role: user.role,
    };
  }
}

module.exports = { AuthService };
