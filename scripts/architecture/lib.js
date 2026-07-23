const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../..");

function relative(file) {
  return path.relative(ROOT, file).split(path.sep).join("/");
}

function absolute(file) {
  return path.resolve(ROOT, file);
}

function loadManifest(file) {
  const fullPath = absolute(file);
  try {
    return JSON.parse(fs.readFileSync(fullPath, "utf8"));
  } catch (error) {
    throw new Error(`Cannot parse ${file} as JSON-compatible YAML: ${error.message}`);
  }
}

function walk(directory, predicate = () => true) {
  const root = absolute(directory);
  if (!fs.existsSync(root)) return [];
  const result = [];
  const visit = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if ([".git", "node_modules", "data", "artifacts", "coverage"].includes(entry.name)) continue;
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) visit(target);
      else if (predicate(target)) result.push(target);
    }
  };
  visit(root);
  return result.sort();
}

function ensureDirectory(directory) {
  fs.mkdirSync(absolute(directory), { recursive: true });
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function stableJson(value) {
  return JSON.stringify(stable(value));
}

function hash(value) {
  return crypto.createHash("sha256").update(typeof value === "string" ? value : stableJson(value)).digest("hex");
}

function writeJson(file, value) {
  const target = absolute(file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
}

function writeText(file, value) {
  const target = absolute(file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, value.endsWith("\n") ? value : `${value}\n`);
}

function parseArguments(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      result[key] = next;
      index += 1;
    } else {
      result[key] = true;
    }
  }
  return result;
}

function resolveLocalImport(sourceFile, request) {
  if (!request.startsWith(".")) return null;
  const base = path.resolve(path.dirname(sourceFile), request);
  const candidates = [base, `${base}.js`, path.join(base, "index.js")];
  return candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) || null;
}

function internalImports(file, source) {
  const imports = [];
  const patterns = [
    /require\(\s*["']([^"']+)["']\s*\)/g,
    /\bimport(?:[\s\S]*?\bfrom\s*)?["']([^"']+)["']/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const request = match[1];
      imports.push({
        request,
        target: request.startsWith(".") ? resolveLocalImport(file, request) : null,
        external: !request.startsWith("."),
      });
    }
  }
  return imports;
}

function fingerprint(rule, source, target = "", mode = "") {
  return `${rule}|${source}|${target}|${mode}`;
}

function firstDifferencePaths(left, right, limit = 25) {
  const result = [];
  const visit = (a, b, pointer) => {
    if (result.length >= limit) return;
    if (Object.is(a, b)) return;
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) result.push(`${pointer}.length`);
      const length = Math.min(a.length, b.length);
      for (let index = 0; index < length; index += 1) visit(a[index], b[index], `${pointer}[${index}]`);
      return;
    }
    if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) {
      const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
      for (const key of keys) {
        if (!(key in a) || !(key in b)) result.push(`${pointer}.${key}`);
        else visit(a[key], b[key], `${pointer}.${key}`);
        if (result.length >= limit) return;
      }
      return;
    }
    result.push(pointer || "$ ");
  };
  visit(left, right, "$");
  return result;
}

module.exports = {
  ROOT,
  absolute,
  ensureDirectory,
  fingerprint,
  firstDifferencePaths,
  hash,
  internalImports,
  loadManifest,
  parseArguments,
  relative,
  stable,
  stableJson,
  walk,
  writeJson,
  writeText,
};
