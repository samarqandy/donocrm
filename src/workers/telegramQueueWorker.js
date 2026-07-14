const cron = require("node-cron");
const { getDb } = require("../db/client");
const { AppRepository } = require("../repositories/appRepository");

const TELEGRAM_QUEUE_CRON = "* * * * *";
const TELEGRAM_UPDATES_CRON = "*/10 * * * * *";

let telegramQueueCronStarted = false;
let queueRunning = false;
let updatesRunning = false;

async function processTenantQueue(tenantId, db = getDb()) {
  const repository = new AppRepository(db);
  return repository.processMessages(tenantId);
}

async function processAllTenantQueues(db = getDb()) {
  const tenants = db.prepare("SELECT id FROM tenants WHERE status = 'active'").all();
  let processed = 0;
  for (const tenant of tenants) {
    try {
      const repository = new AppRepository(db);
      if (!repository.telegramToken(tenant.id)) continue;
      const result = await processTenantQueue(tenant.id, db);
      processed += Number(result.processed || 0);
    } catch (error) {
      console.error(`[TelegramWorker] Queue processing error for tenant ${tenant.id}:`, error.message);
    }
  }
  return processed;
}

async function processAllTenantUpdates(db = getDb()) {
  const tenants = db.prepare("SELECT id FROM tenants WHERE status = 'active'").all();
  let linked = 0;
  for (const tenant of tenants) {
    try {
      const repository = new AppRepository(db);
      if (!repository.telegramToken(tenant.id)) continue;
      const result = await repository.processTelegramUpdates(tenant.id);
      linked += Number(result.linked || 0);
    } catch (error) {
      console.error(`[TelegramWorker] Update polling error for tenant ${tenant.id}:`, error.message);
    }
  }
  return linked;
}

function startTelegramQueueCron() {
  if (telegramQueueCronStarted) return;
  const db = getDb();
  db.prepare("SELECT 1 AS ok").get();
  cron.schedule(TELEGRAM_QUEUE_CRON, async () => {
    if (queueRunning) return;
    queueRunning = true;
    try {
      await processAllTenantQueues(db);
    } catch (error) {
      console.error("[TelegramWorker] Queue processing error:", error.message);
    } finally {
      queueRunning = false;
    }
  });
  cron.schedule(TELEGRAM_UPDATES_CRON, async () => {
    if (updatesRunning) return;
    updatesRunning = true;
    try {
      await processAllTenantUpdates(db);
    } catch (error) {
      console.error("[TelegramWorker] Update polling error:", error.message);
    } finally {
      updatesRunning = false;
    }
  });
  telegramQueueCronStarted = true;
  console.log("Telegram Queue Worker started (delivery every minute, account linking every 10 seconds)");
}

module.exports = { processAllTenantQueues, processAllTenantUpdates, processTenantQueue, startTelegramQueueCron, TELEGRAM_QUEUE_CRON, TELEGRAM_UPDATES_CRON };
