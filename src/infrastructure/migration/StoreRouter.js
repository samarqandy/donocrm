class StoreRouter {
  constructor({ sqliteRepository, postgresRepository = null, postgresTenantIds = [] }) {
    this.sqliteRepository = sqliteRepository;
    this.postgresRepository = postgresRepository;
    this.postgresTenantIds = new Set(postgresTenantIds);
  }

  primaryFor(tenantId) {
    if (this.postgresTenantIds.has(tenantId)) {
      if (!this.postgresRepository) throw new Error("PostgreSQL repository is not configured");
      return this.postgresRepository;
    }
    return this.sqliteRepository;
  }
}

module.exports = { StoreRouter };
