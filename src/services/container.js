const { getDb } = require("../db/client");
const { AppRepository } = require("../repositories/appRepository");
const { AppService } = require("./appService");
const { AuthService } = require("./authService");
const { SQLiteAttendanceQueryRepository } = require("../modules/attendance/infrastructure/SQLiteAttendanceQueryRepository");
const { PostgresAttendanceQueryRepository } = require("../modules/attendance/infrastructure/PostgresAttendanceQueryRepository");
const { StoreRouter } = require("../infrastructure/migration/StoreRouter");
const { getPostgresPool } = require("../infrastructure/database/postgres/pool");

function tenantIds(value) {
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
}

function services() {
  const repository = new AppRepository(getDb());
  const postgres = getPostgresPool();
  const attendanceQueryRouter = new StoreRouter({
    sqliteRepository: new SQLiteAttendanceQueryRepository(getDb()),
    postgresRepository: postgres ? new PostgresAttendanceQueryRepository(postgres) : null,
    postgresTenantIds: tenantIds(process.env.DONO_ATTENDANCE_POSTGRES_TENANTS),
  });
  return {
    app: new AppService(repository, { attendanceQueryRouter }),
    auth: new AuthService(repository),
  };
}

module.exports = { services };
