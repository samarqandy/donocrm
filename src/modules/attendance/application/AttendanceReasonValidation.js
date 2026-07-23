const { DomainError } = require("../../../core/errors/DomainError");

const STATUSES = new Set(["present", "absent", "late", "excused"]);

function tenant(context) {
  const tenantId = String(context?.tenantId || "").trim();
  if (!tenantId) throw new DomainError("Tenant context is required", 403);
  return tenantId;
}

function admin(context) {
  if (context?.role !== "admin") throw new DomainError("Admin role is required", 403);
}

function requiredText(value, field, max) {
  const result = String(value ?? "").trim();
  if (!result) throw new DomainError(`${field} is required`);
  if (result.length > max) throw new DomainError(`${field} is too long`);
  return result;
}

function percent(value, field) {
  if (value === undefined || value === null || value === "") throw new DomainError(`${field} is required`);
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0 || result > 100) {
    throw new DomainError(`${field} must be between 0 and 100`);
  }
  return result;
}

module.exports = { STATUSES, tenant, admin, requiredText, percent };
