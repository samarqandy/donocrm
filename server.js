const { port } = require("./src/config/app");
const { createServer, startTelegramQueueCron } = require("./src/http/server");
const { getDb } = require("./src/db/client");

function start() {
  try {
    // Fail before opening a socket when schema/bootstrap requirements are not met.
    getDb().prepare("SELECT 1 AS ok").get();
  } catch (error) {
    console.error("[Startup] Database initialization failed:", error.message);
    process.exitCode = 1;
    return;
  }

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
}

start();
