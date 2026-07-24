const { getDb } = require("../db/client");
const { SQLiteAttendanceRepository } = require("../modules/attendance/infrastructure/SQLiteAttendanceRepository");
const { PostgresAttendanceRepository } = require("../modules/attendance/infrastructure/PostgresAttendanceRepository");
const { SQLiteAttendanceNotificationRepository } = require("../modules/attendance/infrastructure/SQLiteAttendanceNotificationRepository");
const { SQLiteAttendanceQueryRepository } = require("../modules/attendance/infrastructure/SQLiteAttendanceQueryRepository");
const { PostgresAttendanceQueryRepository } = require("../modules/attendance/infrastructure/PostgresAttendanceQueryRepository");
const { MarkAttendance } = require("../modules/attendance/application/MarkAttendance");
const { ReopenAttendance } = require("../modules/attendance/application/ReopenAttendance");
const { SendAttendanceAlerts } = require("../modules/attendance/application/SendAttendanceAlerts");
const { GetAttendanceLesson } = require("../modules/attendance/application/GetAttendanceLesson");
const { ListAttendanceReasons } = require("../modules/attendance/application/ListAttendanceReasons");
const { CreateAttendanceReason } = require("../modules/attendance/application/CreateAttendanceReason");
const { UpdateAttendanceReason } = require("../modules/attendance/application/UpdateAttendanceReason");
const { createAttendanceController } = require("../modules/attendance/http/attendanceController");
const { registerAttendanceRoutes } = require("../modules/attendance/http/attendanceRoutes");
const { ListStudents } = require("../modules/students/application/ListStudents");
const { SQLiteStudentRepository } = require("../modules/students/infrastructure/SQLiteStudentRepository");
const { createStudentController } = require("../modules/students/http/studentController");
const { registerStudentRoutes } = require("../modules/students/http/studentRoutes");
const { StoreRouter } = require("../infrastructure/migration/StoreRouter");
const { StranglerRouter } = require("../infrastructure/http/StranglerRouter");
const { getPostgresPool } = require("../infrastructure/database/postgres/pool");
const { now, today } = require("../utils/time");
const { workforceRegistration } = require("./workforceRegistration");

let router;
const registrations = Object.freeze({
  workforce: workforceRegistration(),
});

function parseTenantList(value) {
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
}

function stranglerRouter() {
  if (router) return router;
  const sqlite = getDb();
  const sqliteRepository = new SQLiteAttendanceRepository(sqlite);
  const postgresPool = getPostgresPool();
  const postgresRepository = postgresPool
    ? new PostgresAttendanceRepository(postgresPool, {
      financeGuard: sqliteRepository,
      lessonReferenceReader: sqliteRepository,
    })
    : null;
  const postgresTenantIds = parseTenantList(process.env.DONO_ATTENDANCE_POSTGRES_TENANTS);
  if (postgresTenantIds.length && process.env.DONO_ATTENDANCE_REVERSE_RELAY_READY !== "true") {
    throw new Error("Attendance PostgreSQL canary requires a tested PostgreSQL-to-SQLite reverse relay");
  }
  const storeRouter = new StoreRouter({
    sqliteRepository,
    postgresRepository,
    postgresTenantIds,
  });
  const attendanceQueryRouter = new StoreRouter({
    sqliteRepository: new SQLiteAttendanceQueryRepository(sqlite),
    postgresRepository: postgresPool ? new PostgresAttendanceQueryRepository(postgresPool) : null,
    postgresTenantIds,
  });
  const notificationRepository = new SQLiteAttendanceNotificationRepository(sqlite);
  const controller = createAttendanceController({
    getAttendanceLesson: async (context, lessonId) => {
      const useCase = new GetAttendanceLesson({ repository: storeRouter.primaryFor(context.tenantId) });
      return useCase.execute(context, lessonId);
    },
    markAttendance: async (context, body) => {
      const useCase = new MarkAttendance({ repository: storeRouter.primaryFor(context.tenantId), clock: { now, today } });
      return useCase.execute(context, body);
    },
    reopenAttendance: async (context, lessonId, body) => {
      const useCase = new ReopenAttendance({ repository: storeRouter.primaryFor(context.tenantId), clock: { now, today } });
      return useCase.execute(context, lessonId, body);
    },
    sendAttendanceAlerts: async (context, lessonId) => {
      const useCase = new SendAttendanceAlerts({
        repository: storeRouter.primaryFor(context.tenantId),
        notificationRepository,
        clock: { now, today },
      });
      return useCase.execute(context, lessonId);
    },
    listAttendanceReasons: async (context) => {
      const useCase = new ListAttendanceReasons({ repository: storeRouter.primaryFor(context.tenantId) });
      return useCase.execute(context);
    },
    createAttendanceReason: async (context, body) => {
      const useCase = new CreateAttendanceReason({ repository: storeRouter.primaryFor(context.tenantId), clock: { now } });
      return useCase.execute(context, body);
    },
    updateAttendanceReason: async (context, reasonId, body) => {
      const useCase = new UpdateAttendanceReason({ repository: storeRouter.primaryFor(context.tenantId), clock: { now } });
      return useCase.execute(context, reasonId, body);
    },
  });
  const studentRepository = new SQLiteStudentRepository(sqlite);
  const listStudents = new ListStudents({
    repository: studentRepository,
    attendanceQueries: (tenantId) => attendanceQueryRouter.primaryFor(tenantId),
  });
  const studentController = createStudentController({
    listStudents: (context, query) => listStudents.execute(context, query),
  });
  router = new StranglerRouter();
  registerAttendanceRoutes(router, controller);
  registerStudentRoutes(router, studentController);
  return router;
}

function moduleRegistrations() {
  return registrations;
}

module.exports = { stranglerRouter, moduleRegistrations };
