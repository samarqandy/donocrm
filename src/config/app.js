const path = require("node:path");

const ROOT = path.resolve(__dirname, "../..");
const DATA_DIR = path.join(ROOT, "data");

function secureCookies() {
  if (process.env.COOKIE_SECURE === "true") return true;
  if (process.env.COOKIE_SECURE === "false") return false;
  return process.env.NODE_ENV === "production";
}

function envKeyForTenant(prefix, tenantId) {
  return `${prefix}_${String(tenantId || "").toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;
}

function secret(name, tenantId = "") {
  if (tenantId) {
    const tenantScoped = process.env[envKeyForTenant(name, tenantId)];
    if (tenantScoped) return tenantScoped;
  }
  return process.env[name] || "";
}

module.exports = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 8081),
  root: ROOT,
  dataDir: DATA_DIR,
  sqliteFile: process.env.SQLITE_FILE || path.join(DATA_DIR, "dono.sqlite"),
  defaultTenantId: process.env.DEFAULT_TENANT_ID || "tenant_main",
  secureCookies: secureCookies(),
  secret,
};
