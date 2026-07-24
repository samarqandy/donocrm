"use strict";

const { parentPort, workerData } = require("node:worker_threads");
const { DatabaseSync } = require("node:sqlite");
const {
  SQLiteTeacherWorkingHourRepository,
} = require("../../../src/modules/workforce/infrastructure/SQLiteTeacherWorkingHourRepository");

const barrier = new Int32Array(workerData.barrier);
Atomics.add(barrier, 0, 1);
Atomics.notify(barrier, 0);
Atomics.wait(barrier, 1, 0);

const db = new DatabaseSync(workerData.databaseFile);
db.exec("PRAGMA busy_timeout = 5000");
const repository = new SQLiteTeacherWorkingHourRepository(db);
try {
  const value = repository.insert(workerData.context, workerData.record);
  parentPort.postMessage({ ok: true, id: value.id });
} catch (error) {
  parentPort.postMessage({ ok: false, code: error.code, message: error.message });
} finally {
  db.close();
}
