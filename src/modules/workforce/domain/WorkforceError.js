"use strict";

const ERROR_STATUS = Object.freeze({
  ADMIN_REQUIRED: 403,
  OWN_PROFILE_ONLY: 403,
  PERMISSION_REQUIRED: 403,
  SERVICE_CALLER_FORBIDDEN: null,
  TEACHER_NOT_FOUND: 404,
  PORTAL_ACCESS_NOT_CONFIGURED: 404,
  WORKING_HOUR_NOT_FOUND: 404,
  USERNAME_CONFLICT: 409,
  ARCHIVE_BLOCKED: 409,
  WORKING_HOUR_OVERLAP: 409,
  NAME_REQUIRED: 422,
  USERNAME_INVALID: 422,
  PASSWORD_TOO_SHORT: 422,
  MAX_WEEKLY_MINUTES_OUT_OF_RANGE: 422,
  EMAIL_INVALID: 422,
  EMPLOYMENT_TYPE_INVALID: 422,
  HIRED_AT_INVALID: 422,
  BRANCH_INVALID: 422,
  RESTORE_BEFORE_ACCESS: 422,
  NEW_PASSWORD_REQUIRED: 422,
  TEACHER_ID_REQUIRED: 422,
  TEACHER_INACTIVE: 422,
  START_TIME_REQUIRED: 422,
  START_TIME_INVALID: 422,
  END_TIME_REQUIRED: 422,
  END_TIME_INVALID: 422,
  END_NOT_AFTER_START: 422,
  WEEKDAY_INVALID: 422,
  WORKFORCE_UNAVAILABLE: 500,
  WORKFORCE_FAILURE: 500,
});

class WorkforceError extends Error {
  constructor(code, message, options = {}) {
    super(message || code, options);
    if (!Object.prototype.hasOwnProperty.call(ERROR_STATUS, code)) {
      throw new TypeError(`Unknown Workforce error code: ${code}`);
    }
    this.name = "WorkforceError";
    this.code = code;
    this.status = ERROR_STATUS[code];
    this.retryable = code === "WORKFORCE_UNAVAILABLE";
  }
}

function fail(code, message) {
  throw new WorkforceError(code, message);
}

module.exports = { ERROR_STATUS, WorkforceError, fail };
