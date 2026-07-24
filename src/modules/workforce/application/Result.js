"use strict";

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

function ok(value) {
  return deepFreeze({ ok: true, value });
}

function err(error) {
  return deepFreeze({
    ok: false,
    error: {
      code: error.code,
      message: error.message,
      status: error.status,
      retryable: Boolean(error.retryable),
    },
  });
}

module.exports = { deepFreeze, err, ok };
