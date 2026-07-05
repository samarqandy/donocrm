const fs = require("node:fs");
const { DatabaseSync } = require("node:sqlite");
const { dataDir, sqliteFile } = require("../config/app");
const { schema } = require("./schema");
const { seed } = require("./seed");
const { hashPassword, isPasswordHash } = require("../utils/password");

let db;

function getDb() {
  if (db) return db;
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  db = new DatabaseSync(sqliteFile);
  db.exec(schema);
  migrate(db);
  seed(db);
  return db;
}

function migrate(db) {
  const columns = db.prepare("PRAGMA table_info(tenants)").all().map((column) => column.name);
  if (!columns.includes("telegram_bot_token")) {
    db.exec("ALTER TABLE tenants ADD COLUMN telegram_bot_token TEXT");
  }
  const userColumns = db.prepare("PRAGMA table_info(users)").all().map((column) => column.name);
  if (!userColumns.includes("username")) {
    db.exec("ALTER TABLE users ADD COLUMN username TEXT");
    db.prepare("UPDATE users SET username = ? WHERE id = ?").run("admin", "user_admin");
    db.prepare("UPDATE users SET username = ? WHERE id = ?").run("teacher", "user_teacher");
  }
  if (!userColumns.includes("password")) {
    db.exec("ALTER TABLE users ADD COLUMN password TEXT");
    db.prepare("UPDATE users SET password = ? WHERE id = ?").run(hashPassword("admin123"), "user_admin");
    db.prepare("UPDATE users SET password = ? WHERE id = ?").run(hashPassword("teacher123"), "user_teacher");
  }
  db.prepare("SELECT id, password FROM users")
    .all()
    .filter((user) => user.password && !isPasswordHash(user.password))
    .forEach((user) => {
      db.prepare("UPDATE users SET password = ? WHERE id = ?").run(hashPassword(user.password), user.id);
    });
}

module.exports = { getDb };
