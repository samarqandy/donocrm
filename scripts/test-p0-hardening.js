#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const projectRoot = path.resolve(__dirname, "..");
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dono-p0-"));

function child(code, env) {
  return spawnSync(process.execPath, ["-e", code], {
    cwd: projectRoot,
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
}

function pass(message) {
  console.log(`PASS ${message}`);
}

async function request(baseUrl, pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: options.method || "GET",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  return { status: response.status, json: text ? JSON.parse(text) : {}, headers: response.headers };
}

async function malformedRequest(port) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, method: "GET", path: "/%E0%A4%A" }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", reject);
    req.end();
  });
}

async function main() {
  const productionDb = path.join(tempDir, "production.sqlite");
  const productionEnv = {
    NODE_ENV: "production",
    SQLITE_FILE: productionDb,
    DONO_SEED_DEMO: "false",
  };
  const refused = child("require('./src/db/client').getDb()", productionEnv);
  assert.notEqual(refused.status, 0);
  assert.match(`${refused.stderr}${refused.stdout}`, /No admin exists\. Run: npm run create-admin/);
  pass("fresh production database refuses startup without an administrator");

  const createAdmin = spawnSync(process.execPath, ["scripts/create-admin.js"], {
    cwd: projectRoot,
    env: {
      ...process.env,
      ...productionEnv,
      DONO_ADMIN_USERNAME: "production_admin",
      DONO_ADMIN_PASSWORD: "ProductionPass123!",
      DONO_ADMIN_NAME: "Production Administrator",
      DONO_INITIAL_TENANT_NAME: "Production Test Center",
    },
    encoding: "utf8",
  });
  assert.equal(createAdmin.status, 0, createAdmin.stderr);
  const accepted = child(
    "const db=require('./src/db/client').getDb(); const user=db.prepare(\"SELECT role FROM users WHERE username='production_admin'\").get(); if(user?.role!=='admin') process.exit(2)",
    productionEnv,
  );
  assert.equal(accepted.status, 0, accepted.stderr);
  pass("create-admin bootstraps a PBKDF2 administrator and production then starts");

  const runtimeDb = path.join(tempDir, "runtime.sqlite");
  process.env.NODE_ENV = "test";
  process.env.DONO_SEED_DEMO = "true";
  process.env.DONO_TELEGRAM_SKIP_REMOTE_VALIDATION = "true";
  process.env.SQLITE_FILE = runtimeDb;
  process.env.PORT = "0";

  const { createServer } = require("../src/http/server");
  const { getDb } = require("../src/db/client");
  const { AppRepository } = require("../src/repositories/appRepository");
  const { loginRateLimiter } = require("../src/security/loginRateLimiter");

  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    const malformed = await malformedRequest(port);
    assert.equal(malformed.status, 400);
    assert.equal(JSON.parse(malformed.body).error, "Malformed URL");
    assert.equal((await request(baseUrl, "/healthz")).status, 200);
    pass("malformed URL returns 400 and the same server process remains healthy");

    loginRateLimiter.clear();
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const response = await request(baseUrl, "/api/login", { method: "POST", body: { username: "missing", password: "wrong" } });
      assert.equal(response.status, 401);
    }
    const sixth = await request(baseUrl, "/api/login", { method: "POST", body: { username: "missing", password: "wrong" } });
    assert.equal(sixth.status, 429);
    assert.ok(Number(sixth.headers.get("retry-after")) >= 1);
    pass("sixth failed login inside one minute returns 429");

    loginRateLimiter.clear();
    const startedAt = Date.now();
    const attempts = Array.from({ length: 100 }, () => request(baseUrl, "/api/login", {
      method: "POST",
      body: { username: "missing", password: "wrong" },
    }));
    await new Promise((resolve) => setImmediate(resolve));
    const health = await request(baseUrl, "/healthz");
    const healthLatency = Date.now() - startedAt;
    assert.equal(health.status, 200);
    assert.ok(healthLatency < 1_000, `health endpoint was blocked for ${healthLatency}ms`);
    const results = await Promise.all(attempts);
    assert.equal(results.filter((result) => result.status === 401).length, 5);
    assert.equal(results.filter((result) => result.status === 429).length, 95);
    pass(`100 concurrent login requests are bounded; health responded in ${healthLatency}ms`);

    const db = getDb();
    const repository = new AppRepository(db);
    const student = repository.students("tenant_main")[0];
    const context = { tenantId: "tenant_main", userId: "user_admin", role: "admin" };
    const count = (table) => Number(db.prepare(`SELECT COUNT(*) count FROM ${table}`).get().count);
    const before = {
      payments: count("payments"),
      ledger: count("invoices_transactions"),
      outbox: count("outbox"),
      audit: count("audit_logs"),
    };
    const originalInsertOutbox = repository.insertOutbox.bind(repository);
    repository.insertOutbox = () => {
      throw new Error("simulated outbox failure");
    };
    assert.throws(() => repository.createPayment(context, student, {
      amount: 12345,
      type: "cash",
      idempotencyKey: `p0-rollback-${Date.now()}`,
      notification: { studentId: student.id, to: student.name, text: "test" },
    }), /simulated outbox failure/);
    repository.insertOutbox = originalInsertOutbox;
    assert.deepEqual({
      payments: count("payments"),
      ledger: count("invoices_transactions"),
      outbox: count("outbox"),
      audit: count("audit_logs"),
    }, before);
    pass("payment, ledger, outbox, and audit all roll back when outbox insertion fails");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
