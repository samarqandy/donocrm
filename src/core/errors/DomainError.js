class DomainError extends Error {
  constructor(message, status = 422, code = "DOMAIN_ERROR") {
    super(message);
    this.name = "DomainError";
    this.status = status;
    this.code = code;
  }
}

module.exports = { DomainError };
