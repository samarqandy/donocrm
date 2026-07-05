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

const PUBLIC_FILES = new Set(["index.html", "app.js", "styles.css"]);
const PUBLIC_PREFIXES = ["screeshots/"];

function allowedTarget(target) {
  if (PUBLIC_FILES.has(target)) return true;
  return PUBLIC_PREFIXES.some((prefix) => target.startsWith(prefix));
}

function staticFile(req, res, pathname) {
  const target = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  if (!allowedTarget(target)) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  const filePath = path.resolve(root, target);
  if (!filePath.startsWith(`${root}${path.sep}`) && filePath !== root) {
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
    res.writeHead(200, { "Content-Type": MIME[path.extname(filePath)] || "application/octet-stream" });
    res.end(data);
  });
}

module.exports = { staticFile };
