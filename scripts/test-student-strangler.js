const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { ListStudents } = require("../src/modules/students/application/ListStudents");
const { registerStudentRoutes } = require("../src/modules/students/http/studentRoutes");

async function run() {
  let checks = 0;
  {
    const calls = [];
    const useCase = new ListStudents({
      repository: {
        async list(query) {
          calls.push(query);
          return [{ id: "student-1", name: "Student", debt: 50, balance: -50, telegramChatId: "secret" }];
        },
      },
      attendanceQueries() {
        return { async studentStats() { return { "student-1": { attendanceTotal: 4, attendancePresent: 3, attendanceRate: 75 } }; } };
      },
    });
    const rows = await useCase.execute(
      { tenantId: "tenant-1", userId: "admin-1", role: "admin" },
      { search: "Stu", includeArchived: true },
    );
    assert.deepEqual(calls[0], {
      tenantId: "tenant-1", teacherId: null, search: "Stu", includeArchived: true,
    });
    assert.equal(rows[0].attendanceRate, 75);
    assert.equal(rows[0].debt, 50);
    checks += 1;
  }
  {
    let received;
    const useCase = new ListStudents({
      repository: { async list(query) { received = query; return [{ id: "student-1", debt: 10, balance: -10, telegramChatId: "secret" }]; } },
      attendanceQueries: () => ({ async studentStats() { return {}; } }),
    });
    const rows = await useCase.execute(
      { tenantId: "tenant-1", userId: "teacher-1", role: "teacher" },
      { includeArchived: true },
    );
    assert.equal(received.teacherId, "teacher-1");
    assert.equal(received.includeArchived, false);
    assert.ok(!Object.prototype.hasOwnProperty.call(rows[0], "debt"));
    assert.ok(!Object.prototype.hasOwnProperty.call(rows[0], "balance"));
    assert.ok(!Object.prototype.hasOwnProperty.call(rows[0], "telegramChatId"));
    checks += 1;
  }
  {
    const useCase = new ListStudents({ repository: {}, attendanceQueries() {} });
    await assert.rejects(() => useCase.execute({ role: "admin" }), (error) => error.status === 403);
    const routes = [];
    registerStudentRoutes({ register(...args) { routes.push(args); } }, { list() {} });
    assert.equal(routes.length, 1);
    assert.equal(routes[0][0], "GET");
    assert.ok(routes[0][1].test("/api/students"));
    assert.ok(!routes[0][1].test("/api/students/student-1/profile"));
    checks += 1;
  }
  {
    const legacy = fs.readFileSync(path.join(__dirname, "../src/repositories/appRepository.js"), "utf8");
    for (const forbidden of ["SQLiteAttendanceQueryRepository", "attendanceQueryRepository", "withStudentAttendance", "withGroupAttendance"]) {
      assert.ok(!legacy.includes(forbidden), `legacy projection boundary still contains ${forbidden}`);
    }
    checks += 1;
  }
  console.log(`PASS Student strangler module ${checks}/4`);
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
