#!/usr/bin/env node

const readline = require("node:readline/promises");
const { stdin, stdout } = require("node:process");
const { defaultTenantId, nodeEnv } = require("../src/config/app");
const { initializeDB } = require("../src/db/client");
const { AppRepository } = require("../src/repositories/appRepository");
const { now } = require("../src/utils/time");
const { hashPassword } = require("../src/utils/password");

function hiddenQuestion(label) {
  if (!stdin.isTTY || !stdout.isTTY) {
    return Promise.reject(new Error("Interactive password input requires a TTY. Set DONO_ADMIN_PASSWORD for non-interactive use."));
  }
  return new Promise((resolve, reject) => {
    let value = "";
    const previousRaw = stdin.isRaw;
    const cleanup = () => {
      stdin.off("data", onData);
      stdin.setRawMode(Boolean(previousRaw));
      stdin.pause();
    };
    const onData = (chunk) => {
      for (const character of String(chunk)) {
        if (character === "\u0003") {
          cleanup();
          stdout.write("\n");
          reject(new Error("Cancelled"));
          return;
        }
        if (character === "\r" || character === "\n") {
          cleanup();
          stdout.write("\n");
          resolve(value);
          return;
        }
        if (character === "\u007f" || character === "\b") {
          if (value.length) {
            value = value.slice(0, -1);
            stdout.write("\b \b");
          }
          continue;
        }
        if (character >= " ") {
          value += character;
          stdout.write("*");
        }
      }
    };
    stdout.write(label);
    stdin.setEncoding("utf8");
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on("data", onData);
  });
}

async function visibleQuestion(label, fallback = "") {
  if (!stdin.isTTY) return fallback;
  const prompt = readline.createInterface({ input: stdin, output: stdout });
  try {
    return String(await prompt.question(label)).trim() || fallback;
  } finally {
    prompt.close();
  }
}

async function credentials() {
  const username = String(process.env.DONO_ADMIN_USERNAME || await visibleQuestion("Admin username: ")).trim();
  const name = String(process.env.DONO_ADMIN_NAME || await visibleQuestion("Admin display name [Administrator]: ", "Administrator")).trim();
  const tenantName = String(process.env.DONO_INITIAL_TENANT_NAME || await visibleQuestion("Center name [DonoCRM]: ", "DonoCRM")).trim();
  const password = process.env.DONO_ADMIN_PASSWORD || await hiddenQuestion("Admin password: ");
  const confirmation = process.env.DONO_ADMIN_PASSWORD || await hiddenQuestion("Confirm password: ");

  if (!/^[A-Za-z0-9._@+-]{3,80}$/.test(username)) {
    throw new Error("Username must be 3-80 characters and contain only letters, numbers, . _ @ + -");
  }
  if (password.length < 12) throw new Error("Password must contain at least 12 characters");
  if (password !== confirmation) throw new Error("Passwords do not match");
  if (!name || !tenantName) throw new Error("Admin and center names are required");
  return { username, password, name, tenantName };
}

async function main() {
  const input = await credentials();
  const db = initializeDB({ allowEmptyProduction: true });
  const repository = new AppRepository(db);
  if (db.prepare("SELECT id FROM users WHERE username = ? LIMIT 1").get(input.username)) {
    throw new Error("Username already exists");
  }

  const passwordHash = await hashPassword(input.password);
  db.exec("BEGIN IMMEDIATE");
  try {
    const timestamp = now();
    const tenant = db.prepare("SELECT id, name FROM tenants WHERE id = ? LIMIT 1").get(defaultTenantId);
    if (!tenant) {
      db.prepare(
        `INSERT INTO tenants
         (id, name, domain, type, status, plan, language, telegram_bot, telegram_bot_token, created_at)
         VALUES (?, ?, ?, 'learning_center', 'active', 'standard', 'uz', '', '', ?)`,
      ).run(defaultTenantId, input.tenantName, defaultTenantId, timestamp);
    }
    repository.ensureTenantFoundation(defaultTenantId, tenant?.name || input.tenantName, timestamp);
    const admin = await repository.createPlatformTenantAdmin(defaultTenantId, { ...input, passwordHash });
    db.exec("COMMIT");
    stdout.write(`Admin created: ${admin.username} (${admin.id}) for tenant ${defaultTenantId}\n`);
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

main().catch((error) => {
  console.error(`[create-admin] ${error.message}`);
  if (nodeEnv !== "production" && error.stack) console.error(error.stack);
  process.exitCode = 1;
});
