"use strict";

class OwnedRecordConflictError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = "OwnedRecordConflictError";
    this.code = "OWNED_RECORD_CONFLICT";
  }
}

function persistenceContext(context) {
  if (!context?.tenantId || !context?.correlationId) {
    throw new TypeError("WorkforcePersistenceContextV1 is required");
  }
  return context;
}

function isConstraint(error) {
  return String(error?.code || "").startsWith("ERR_SQLITE_ERROR") &&
    /constraint|unique|primary key|foreign key/i.test(String(error?.message || ""));
}

function conflict(error, message) {
  if (error instanceof OwnedRecordConflictError) return error;
  if (isConstraint(error)) return new OwnedRecordConflictError(message, { cause: error });
  return error;
}

function immediateTransaction(db, work) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = work();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch (_rollbackError) {}
    throw error;
  }
}

module.exports = {
  OwnedRecordConflictError,
  conflict,
  immediateTransaction,
  persistenceContext,
};
