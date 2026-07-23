const http = require("node:http");
const { getDb } = require("../db/client");
const { api } = require("./api");
const { sendJson } = require("./json");
const { staticFile } = require("./static");
const { processTenantQueue, startTelegramQueueCron } = require("../workers/telegramQueueWorker");
const { nodeEnv } = require("../config/app");
const { stranglerRouter } = require("../bootstrap/stranglerContainer");
const { getPostgresPool } = require("../infrastructure/database/postgres/pool");

function attendancePostgresCanaryEnabled() {
  return String(process.env.DONO_ATTENDANCE_POSTGRES_TENANTS || "")
    .split(",")
    .some((tenantId) => tenantId.trim());
}

async function postgresReadiness(pool) {
  const timeoutMs = Math.max(250, Number(process.env.PG_READINESS_TIMEOUT_MS || 2_000));
  let timer;
  try {
    await Promise.race([
      pool.query({ text: "SELECT 1 AS ok", query_timeout: timeoutMs }),
      new Promise((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("PostgreSQL readiness timeout")), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function securityHeaders(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  if (nodeEnv === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
}

function createServer() {
  return http.createServer(async (req, res) => {
    try {
      securityHeaders(res);

      const parsed = new URL(req.url, `http://${req.headers.host || "localhost"}`);
      let pathname;
      try {
        pathname = decodeURIComponent(parsed.pathname);
      } catch (_error) {
        sendJson(res, 400, { error: "Malformed URL" });
        return;
      }

      if (req.method === "GET" && pathname === "/healthz") {
        sendJson(res, 200, { ok: true });
        return;
      }
      if (req.method === "GET" && pathname === "/readyz") {
        try {
          getDb().prepare("SELECT 1 AS ok").get();
          if (attendancePostgresCanaryEnabled()) {
            const postgres = getPostgresPool();
            if (!postgres) throw new Error("PostgreSQL canary is configured without DATABASE_URL");
            await postgresReadiness(postgres);
          }
          sendJson(res, 200, {
            ok: true,
            database: "ready",
            postgresCanary: attendancePostgresCanaryEnabled() ? "ready" : "disabled",
          });
        } catch (error) {
          console.error("[HTTP] Readiness check failed:", error.stack || error.message);
          sendJson(res, 503, { ok: false, error: "Database unavailable" });
        }
        return;
      }
      if (pathname.startsWith("/api/")) {
        if (await stranglerRouter().dispatch(req, res, pathname)) return;
        await api(req, res, pathname);
        return;
      }
      staticFile(req, res, pathname);
    } catch (error) {
      console.error(`[HTTP] Unhandled request error ${req.method || "UNKNOWN"} ${req.url || ""}:`, error.stack || error.message);
      if (res.headersSent || res.writableEnded) {
        if (!res.writableEnded) res.destroy();
        return;
      }
      sendJson(res, 500, { error: "Internal server error" });
    }
  });
}

module.exports = { createServer, processTenantQueue, startTelegramQueueCron };
