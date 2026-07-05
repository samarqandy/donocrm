const http = require("node:http");
const { getDb } = require("../db/client");
const { api } = require("./api");
const { sendJson } = require("./json");
const { staticFile } = require("./static");

function securityHeaders(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
}

function createServer() {
  return http.createServer((req, res) => {
    securityHeaders(res);
    const parsed = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const pathname = decodeURIComponent(parsed.pathname);
    if (req.method === "GET" && pathname === "/healthz") {
      sendJson(res, 200, { ok: true });
      return;
    }
    if (req.method === "GET" && pathname === "/readyz") {
      try {
        getDb().prepare("SELECT 1 AS ok").get();
        sendJson(res, 200, { ok: true, database: "ready" });
      } catch (error) {
        sendJson(res, 503, { ok: false, error: error.message || "Database unavailable" });
      }
      return;
    }
    if (pathname.startsWith("/api/")) {
      api(req, res, pathname);
      return;
    }
    staticFile(req, res, pathname);
  });
}

module.exports = { createServer };
