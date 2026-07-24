"use strict";

const { fail } = require("../domain/WorkforceError");

const SERVICE_CALLERS = Object.freeze([
  "workforce-compatibility-coordinator",
  "academic-groups",
  "scheduling",
  "lesson-delivery",
  "attendance",
  "lesson-finance-payroll",
  "reporting-export",
]);

function actorContext(context) {
  if (
    !context ||
    !context.tenantId ||
    !context.actorUserId ||
    !["admin", "teacher"].includes(context.role) ||
    !context.correlationId ||
    !Array.isArray(context.permissions)
  ) {
    throw new TypeError("Verified WorkforceActorContextV1 is required");
  }
  return Object.freeze({
    tenantId: context.tenantId,
    actorUserId: context.actorUserId,
    role: context.role,
    permissions: Object.freeze([...new Set(context.permissions)]),
    correlationId: context.correlationId,
  });
}

function serviceContext(context) {
  if (!context?.tenantId || !context?.correlationId || !SERVICE_CALLERS.includes(context.caller)) {
    fail("SERVICE_CALLER_FORBIDDEN", "Service caller is forbidden");
  }
  return Object.freeze({
    tenantId: context.tenantId,
    caller: context.caller,
    correlationId: context.correlationId,
  });
}

function persistenceContext(context) {
  return Object.freeze({ tenantId: context.tenantId, correlationId: context.correlationId });
}

function portContext(context) {
  return Object.freeze({
    tenantId: context.tenantId,
    caller: "workforce-compatibility-coordinator",
    correlationId: context.correlationId,
  });
}

function requireAdmin(context) {
  if (context.role !== "admin") fail("ADMIN_REQUIRED", "Admin role is required");
}

function requirePermission(context, permission) {
  if (!context.permissions.includes(permission)) fail("PERMISSION_REQUIRED", "Permission is required");
}

module.exports = {
  SERVICE_CALLERS,
  actorContext,
  persistenceContext,
  portContext,
  requireAdmin,
  requirePermission,
  serviceContext,
};
