#!/usr/bin/env node

const { processAllTenantQueues, processAllTenantUpdates, startTelegramQueueCron } = require("../src/workers/telegramQueueWorker");

async function runOnce() {
  const processed = await processAllTenantQueues();
  const linked = await processAllTenantUpdates();
  console.log(`Telegram queue processed: ${processed}; accounts linked: ${linked}`);
}

if (process.argv.includes("--once")) {
  runOnce().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
} else {
  startTelegramQueueCron();
}
