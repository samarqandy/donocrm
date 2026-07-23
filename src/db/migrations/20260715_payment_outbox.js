const fs = require("node:fs");
const path = require("node:path");

const sql = fs.readFileSync(path.join(__dirname, "20260715_payment_outbox.sql"), "utf8");

function up(db) {
  db.exec(sql);
}

module.exports = {
  id: "20260715_payment_outbox",
  name: "Atomic payment notification outbox",
  up,
};
