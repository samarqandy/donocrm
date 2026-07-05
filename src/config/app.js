const path = require("node:path");

const ROOT = path.resolve(__dirname, "../..");
const DATA_DIR = path.join(ROOT, "data");

module.exports = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 8081),
  root: ROOT,
  dataDir: DATA_DIR,
  sqliteFile: process.env.SQLITE_FILE || path.join(DATA_DIR, "dono.sqlite"),
  defaultTenantId: process.env.DEFAULT_TENANT_ID || "tenant_main",
  secureCookies: process.env.COOKIE_SECURE === "true" || process.env.NODE_ENV === "production",
};
