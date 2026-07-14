const { port } = require("./src/config/app");
const { createServer, startTelegramQueueCron } = require("./src/http/server");

if (process.env.DONO_EMBEDDED_TELEGRAM_WORKER !== "false") {
  try {
    startTelegramQueueCron();
  } catch (error) {
    console.error("[CronJob] Failed to start Telegram Queue Cron Job:", error.message);
  }
}

createServer().listen(port, "0.0.0.0", () => {
  console.log(`Dono running at http://0.0.0.0:${port}`);
});
