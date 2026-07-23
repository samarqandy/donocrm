const fs = require("node:fs");
const path = require("node:path");
const { root } = require("../config/app");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

const PUBLIC_FILES = new Set(["index.html", "app.config.js", "app.js", "styles.css", "docs/openapi.yaml"]);
const PUBLIC_ASSETS = new Set(["screenshots/donocrmlogo.png", "screenshots/favicon.svg"]);

function normalizeTarget(target) {
  return target.replace(/^screeshots\//, "screenshots/");
}

function allowedTarget(target) {
  if (PUBLIC_FILES.has(target)) return true;
  if (target.startsWith("public/") && [".js", ".css"].includes(path.extname(target))) return true;
  return PUBLIC_ASSETS.has(target);
}

function staticFile(req, res, pathname) {
  const requested = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const target = normalizeTarget(requested.startsWith("next/") ? `public/${requested.slice(5)}` : requested);
  if (!allowedTarget(target)) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  const filePath = path.resolve(root, target);
  const allowedRoot = target.startsWith("public/") ? path.resolve(root, "public") : root;
  if (!filePath.startsWith(`${allowedRoot}${path.sep}`) && filePath !== allowedRoot) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(data);
  });
}

module.exports = { staticFile };
