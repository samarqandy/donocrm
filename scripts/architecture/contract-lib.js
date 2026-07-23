const fs = require("node:fs");
const {
  absolute,
  firstDifferencePaths,
  hash,
  stable,
  stableJson,
} = require("./lib");

const COMMAND_METHODS = [
  "findLesson",
  "findLessonRoster",
  "findByLesson",
  "listReasons",
  "findReason",
  "createReason",
  "updateReason",
  "findClosedFinancePeriod",
  "hasActiveSettlement",
  "replaceForLesson",
  "reopenLesson",
  "findAlertSource",
  "audit",
];

const QUERY_METHODS = [
  "counts",
  "list",
  "listForTeacher",
  "studentStats",
  "groupStats",
  "studentProfile",
  "groupProfile",
];

function implementationMethods(Type, required) {
  const available = new Set(Object.getOwnPropertyNames(Type.prototype).filter((name) => name !== "constructor"));
  return {
    required,
    available: [...available].sort(),
    missing: required.filter((name) => !available.has(name)),
  };
}

function surfaceCase(name, sqliteType, postgresType, required) {
  const sqlite = implementationMethods(sqliteType, required);
  const postgres = implementationMethods(postgresType, required);
  const missing = { sqlite: sqlite.missing, postgres: postgres.missing };
  return {
    suite: name,
    case: "surface",
    status: missing.sqlite.length || missing.postgres.length ? "FAIL" : "PASS",
    sqliteHash: hash(sqlite.available),
    postgresHash: hash(postgres.available),
    differences: [...missing.sqlite.map((method) => `sqlite.missing.${method}`), ...missing.postgres.map((method) => `postgres.missing.${method}`)],
  };
}

function staticSemanticCases() {
  const sqliteSource = fs.readFileSync(absolute("src/modules/attendance/infrastructure/SQLiteAttendanceRepository.js"), "utf8");
  const postgresSource = fs.readFileSync(absolute("src/modules/attendance/infrastructure/PostgresAttendanceRepository.js"), "utf8");
  const sqliteChecksSettlement = /hasActiveSettlement[\s\S]*?lesson_financial_settlements/.test(sqliteSource);
  const postgresReturnsConstant = /hasActiveSettlement\s*\([^)]*\)\s*\{[\s\S]*?return\s+false\s*;[\s\S]*?\}/.test(postgresSource);
  const postgresDelegatesSettlement = /hasActiveSettlement\s*\(\s*tenantId\s*,\s*lessonId\s*\)[\s\S]*?financeGuard\.hasActiveSettlement\(tenantId, lessonId\)/.test(postgresSource);
  const settlementSemanticsMatch = sqliteChecksSettlement && postgresDelegatesSettlement && !postgresReturnsConstant;
  const sqliteResolvesTeacher = /findLesson[\s\S]*?COALESCE\(lesson\.teacher_id, schedule\.teacher_id, group_row\.teacher_id\)/.test(sqliteSource);
  const postgresReturnsCalendarDate = /lesson\.date::text AS calendar_date/.test(postgresSource);
  const postgresReturnsVersion = /version:\s*Number\(row\.version \|\| 1\)/.test(postgresSource);
  const postgresResolvesTeacher = /lessonReferenceReader\.resolveEffectiveTeacher/.test(postgresSource);
  const lessonSemanticsMatch = sqliteResolvesTeacher && postgresReturnsCalendarDate
    && postgresReturnsVersion && postgresResolvesTeacher;
  const postgresReplaceUsesCanonicalSnapshot = /replaceForLesson\(command\)[\s\S]*?attendanceSnapshot\(command\.records\)/.test(postgresSource);
  const postgresReplaceUsesFinanceAuthority = /replaceForLesson\(command\)[\s\S]*?financeGuard\.hasActiveSettlement[\s\S]*?financeGuard\.findClosedFinancePeriod/.test(postgresSource);
  const postgresReplaceClearsReversal = /replaceForLesson\(command\)[\s\S]*?financial_reversed_at = NULL[\s\S]*?financial_reversal_reason = NULL/.test(postgresSource);
  const postgresReplaceChecksVersionedUpdate = /replaceForLesson\(command\)[\s\S]*?attendance_version = \$9[\s\S]*?update\.rowCount !== 1/.test(postgresSource);
  const postgresReplaceCanonicalEvents = /replaceForLesson\(command\)[\s\S]*?lessonSnapshot\(lockedLesson\)[\s\S]*?lessonSnapshot\(afterLesson\)/.test(postgresSource);
  const replaceSemanticsMatch = postgresReplaceUsesCanonicalSnapshot
    && postgresReplaceUsesFinanceAuthority
    && postgresReplaceClearsReversal
    && postgresReplaceChecksVersionedUpdate
    && postgresReplaceCanonicalEvents;
  const postgresReopenUsesFinanceAuthority = /reopenLesson\(command\)[\s\S]*?financeGuard\.hasActiveSettlement[\s\S]*?financeGuard\.findClosedFinancePeriod/.test(postgresSource);
  const postgresReopenCanonicalEvents = /reopenLesson\(command\)[\s\S]*?lessonSnapshot\(lockedLesson\)[\s\S]*?lessonSnapshot\(afterLesson\)/.test(postgresSource);
  const postgresReopenPreservesFinancialTransition = /reopenLesson\(command\)[\s\S]*?financial_status = CASE WHEN financial_status = 'reversed' THEN 'reversed' ELSE 'unposted' END/.test(postgresSource);
  const postgresReopenChecksVersionedUpdate = /reopenLesson\(command\)[\s\S]*?status = 'completed' AND attendance_version = \$6[\s\S]*?updatedResult\.rowCount !== 1/.test(postgresSource);
  const postgresReopenActorDefaults = /reopenLesson\(command\)[\s\S]*?command\.actorUserId \|\| "system"[\s\S]*?command\.actorRole \|\| "system"/.test(postgresSource);
  const reopenSemanticsMatch = postgresReopenUsesFinanceAuthority
    && postgresReopenCanonicalEvents
    && postgresReopenPreservesFinancialTransition
    && postgresReopenChecksVersionedUpdate
    && postgresReopenActorDefaults;
  return [{
    suite: "attendance-command",
    case: "hasActiveSettlement.static-semantics",
    status: settlementSemanticsMatch ? "PASS" : "DIFF",
    sqliteHash: hash({ checksSettlement: sqliteChecksSettlement }),
    postgresHash: hash({ delegatesSettlement: postgresDelegatesSettlement, returnsConstant: postgresReturnsConstant }),
    differences: [
      !sqliteChecksSettlement ? "sqlite.hasActiveSettlement.persisted-state-check-missing" : null,
      postgresReturnsConstant ? "postgres.hasActiveSettlement.constant-false" : null,
      !postgresDelegatesSettlement ? "postgres.hasActiveSettlement.finance-guard-delegation-missing" : null,
    ].filter(Boolean),
  }, {
    suite: "attendance-command",
    case: "findLesson.static-semantics",
    status: lessonSemanticsMatch ? "PASS" : "DIFF",
    sqliteHash: hash({ resolvesTeacher: sqliteResolvesTeacher }),
    postgresHash: hash({
      returnsCalendarDate: postgresReturnsCalendarDate,
      returnsVersion: postgresReturnsVersion,
      resolvesTeacher: postgresResolvesTeacher,
    }),
    differences: [
      !sqliteResolvesTeacher ? "sqlite.findLesson.teacher-precedence-missing" : null,
      !postgresReturnsCalendarDate ? "postgres.findLesson.calendar-date-missing" : null,
      !postgresReturnsVersion ? "postgres.findLesson.version-missing" : null,
      !postgresResolvesTeacher ? "postgres.findLesson.reference-reader-missing" : null,
    ].filter(Boolean),
  }, {
    suite: "attendance-command",
    case: "replaceForLesson.static-semantics",
    status: replaceSemanticsMatch ? "PASS" : "DIFF",
    sqliteHash: hash({ canonicalAuthority: true }),
    postgresHash: hash({
      canonicalSnapshot: postgresReplaceUsesCanonicalSnapshot,
      financeAuthority: postgresReplaceUsesFinanceAuthority,
      clearsReversal: postgresReplaceClearsReversal,
      versionedUpdate: postgresReplaceChecksVersionedUpdate,
      canonicalEvents: postgresReplaceCanonicalEvents,
    }),
    differences: [
      !postgresReplaceUsesCanonicalSnapshot ? "postgres.replaceForLesson.canonical-snapshot-missing" : null,
      !postgresReplaceUsesFinanceAuthority ? "postgres.replaceForLesson.finance-authority-missing" : null,
      !postgresReplaceClearsReversal ? "postgres.replaceForLesson.reversal-cleanup-missing" : null,
      !postgresReplaceChecksVersionedUpdate ? "postgres.replaceForLesson.optimistic-update-missing" : null,
      !postgresReplaceCanonicalEvents ? "postgres.replaceForLesson.canonical-events-missing" : null,
    ].filter(Boolean),
  }, {
    suite: "attendance-command",
    case: "reopenLesson.static-semantics",
    status: reopenSemanticsMatch ? "PASS" : "DIFF",
    sqliteHash: hash({ canonicalAuthority: true }),
    postgresHash: hash({
      financeAuthority: postgresReopenUsesFinanceAuthority,
      canonicalEvents: postgresReopenCanonicalEvents,
      financialTransition: postgresReopenPreservesFinancialTransition,
      versionedUpdate: postgresReopenChecksVersionedUpdate,
      actorDefaults: postgresReopenActorDefaults,
    }),
    differences: [
      !postgresReopenUsesFinanceAuthority ? "postgres.reopenLesson.finance-authority-missing" : null,
      !postgresReopenCanonicalEvents ? "postgres.reopenLesson.canonical-events-missing" : null,
      !postgresReopenPreservesFinancialTransition ? "postgres.reopenLesson.financial-transition-missing" : null,
      !postgresReopenChecksVersionedUpdate ? "postgres.reopenLesson.optimistic-update-missing" : null,
      !postgresReopenActorDefaults ? "postgres.reopenLesson.actor-defaults-missing" : null,
    ].filter(Boolean),
  }];
}

function canonical(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return stable(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, canonical(item)])));
  }
  return value === undefined ? null : value;
}

async function execute(adapter, contractCase, fixture) {
  try {
    const value = await Promise.resolve(contractCase.execute(adapter, fixture));
    return { ok: true, value: canonical(value) };
  } catch (error) {
    return {
      ok: false,
      error: {
        name: error.name || "Error",
        code: error.code || "",
        status: Number(error.status || 0),
        message: error.message || "",
      },
    };
  }
}

async function compareCase(suite, contractCase, sqlite, postgres, fixture) {
  const [sqliteResult, postgresResult] = await Promise.all([
    execute(sqlite, contractCase, fixture),
    execute(postgres, contractCase, fixture),
  ]);
  const sqliteHash = hash(sqliteResult);
  const postgresHash = hash(postgresResult);
  const differences = firstDifferencePaths(sqliteResult, postgresResult);
  return {
    suite,
    case: contractCase.name,
    status: !sqliteResult.ok || !postgresResult.ok ? "FAIL" : differences.length ? "DIFF" : "PASS",
    sqliteHash,
    postgresHash,
    differences,
  };
}

function queryCases() {
  return [
    { name: "counts", execute: (adapter, f) => adapter.counts(f.tenantId) },
    { name: "list", execute: (adapter, f) => adapter.list(f.tenantId) },
    { name: "listForTeacher", execute: (adapter, f) => adapter.listForTeacher(f.tenantId, f.teacherId) },
    { name: "studentStats", execute: (adapter, f) => adapter.studentStats(f.tenantId, f.studentIds) },
    { name: "groupStats", execute: (adapter, f) => adapter.groupStats(f.tenantId, f.groupIds) },
    { name: "studentProfile", execute: (adapter, f) => adapter.studentProfile(f.tenantId, f.studentId) },
    { name: "groupProfile", execute: (adapter, f) => adapter.groupProfile(f.tenantId, f.groupId) },
  ];
}

function commandReadCases() {
  return [
    { name: "findLesson", execute: (adapter, f) => adapter.findLesson(f.tenantId, f.lessonId) },
    { name: "findLessonRoster", execute: (adapter, f) => adapter.findLessonRoster(f.tenantId, f.lessonId) },
    { name: "findByLesson", execute: (adapter, f) => adapter.findByLesson(f.tenantId, f.lessonId) },
    { name: "listReasons", execute: (adapter, f) => adapter.listReasons(f.tenantId, false) },
    { name: "findReason", execute: (adapter, f) => adapter.findReason(f.tenantId, f.reasonId) },
    { name: "findClosedFinancePeriod", execute: (adapter, f) => adapter.findClosedFinancePeriod(f.tenantId, f.branchId, f.lessonDate) },
    { name: "hasActiveSettlement", execute: (adapter, f) => adapter.hasActiveSettlement(f.tenantId, f.lessonId) },
    { name: "findAlertSource", execute: (adapter, f) => adapter.findAlertSource(f.tenantId, f.lessonId) },
  ];
}

function sqliteFixture(db, tenantId) {
  const lesson = db.prepare("SELECT id, branch_id, date FROM lessons WHERE tenant_id = ? ORDER BY id LIMIT 1").get(tenantId) || {};
  const reason = db.prepare("SELECT id FROM attendance_reasons WHERE tenant_id = ? ORDER BY id LIMIT 1").get(tenantId) || {};
  return {
    tenantId,
    lessonId: lesson.id || "__contract_missing_lesson__",
    lessonDate: lesson.date || "1970-01-01",
    branchId: lesson.branch_id || "",
    reasonId: reason.id || "__contract_missing_reason__",
    teacherId: db.prepare("SELECT id FROM teachers WHERE tenant_id = ? ORDER BY id LIMIT 1").get(tenantId)?.id || "__contract_missing_teacher__",
    studentId: db.prepare("SELECT id FROM students WHERE tenant_id = ? ORDER BY id LIMIT 1").get(tenantId)?.id || "__contract_missing_student__",
    groupId: db.prepare("SELECT id FROM groups WHERE tenant_id = ? ORDER BY id LIMIT 1").get(tenantId)?.id || "__contract_missing_group__",
    studentIds: db.prepare("SELECT id FROM students WHERE tenant_id = ? ORDER BY id").all(tenantId).map((row) => row.id),
    groupIds: db.prepare("SELECT id FROM groups WHERE tenant_id = ? ORDER BY id").all(tenantId).map((row) => row.id),
  };
}

async function runRepositoryContracts() {
  const { SQLiteAttendanceRepository } = require("../../src/modules/attendance/infrastructure/SQLiteAttendanceRepository");
  const { PostgresAttendanceRepository } = require("../../src/modules/attendance/infrastructure/PostgresAttendanceRepository");
  const { SQLiteAttendanceQueryRepository } = require("../../src/modules/attendance/infrastructure/SQLiteAttendanceQueryRepository");
  const { PostgresAttendanceQueryRepository } = require("../../src/modules/attendance/infrastructure/PostgresAttendanceQueryRepository");

  const cases = [
    surfaceCase("attendance-command", SQLiteAttendanceRepository, PostgresAttendanceRepository, COMMAND_METHODS),
    surfaceCase("attendance-query", SQLiteAttendanceQueryRepository, PostgresAttendanceQueryRepository, QUERY_METHODS),
    ...staticSemanticCases(),
  ];
  const tenantId = String(process.env.ARCHITECTURE_CONTRACT_TENANT || "").trim();
  const databaseUrl = String(process.env.DATABASE_URL || "").trim();

  if (!tenantId || !databaseUrl) {
    cases.push({
      suite: "live-adapter-parity",
      case: "configuration",
      status: "DIFF",
      sqliteHash: null,
      postgresHash: null,
      differences: [
        !tenantId ? "ARCHITECTURE_CONTRACT_TENANT.missing" : null,
        !databaseUrl ? "DATABASE_URL.missing" : null,
      ].filter(Boolean),
    });
    return finalize(cases, false);
  }

  const { getDb } = require("../../src/db/client");
  const { getPostgresPool } = require("../../src/infrastructure/database/postgres/pool");
  const sqliteDb = getDb();
  const postgresPool = getPostgresPool();
  const fixture = sqliteFixture(sqliteDb, tenantId);
  try {
    const sqliteCommand = new SQLiteAttendanceRepository(sqliteDb);
    const postgresCommand = new PostgresAttendanceRepository(postgresPool, {
      financeGuard: sqliteCommand,
      lessonReferenceReader: sqliteCommand,
    });
    const sqliteQuery = new SQLiteAttendanceQueryRepository(sqliteDb);
    const postgresQuery = new PostgresAttendanceQueryRepository(postgresPool);
    for (const contractCase of queryCases()) {
      cases.push(await compareCase("attendance-query", contractCase, sqliteQuery, postgresQuery, fixture));
    }
    for (const contractCase of commandReadCases()) {
      cases.push(await compareCase("attendance-command", contractCase, sqliteCommand, postgresCommand, fixture));
    }
  } finally {
    await postgresPool.end();
  }
  return finalize(cases, true);
}

function finalize(cases, live) {
  const status = cases.some((item) => item.status === "FAIL")
    ? "FAIL"
    : cases.some((item) => item.status === "DIFF")
      ? "DIFF"
      : "PASS";
  return {
    schemaVersion: 1,
    status,
    live,
    generatedAt: new Date().toISOString(),
    summary: {
      pass: cases.filter((item) => item.status === "PASS").length,
      fail: cases.filter((item) => item.status === "FAIL").length,
      diff: cases.filter((item) => item.status === "DIFF").length,
    },
    cases,
    evidenceHash: hash(cases.map(({ sqliteHash, postgresHash, ...item }) => ({ ...item, sqliteHash, postgresHash }))),
  };
}

module.exports = { COMMAND_METHODS, QUERY_METHODS, runRepositoryContracts };
