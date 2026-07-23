function registerAttendanceRoutes(router, controller) {
  router.register("GET", /^\/api\/lessons\/[^/]+\/students$/, controller.lesson);
  router.register("POST", /^\/api\/attendance$/, controller.mark);
  router.register("POST", /^\/api\/lessons\/[^/]+\/reopen$/, controller.reopen);
  router.register("POST", /^\/api\/lessons\/[^/]+\/send-attendance-alerts$/, controller.sendAlerts);
  router.register("GET", /^\/api\/attendance-reasons$/, controller.listReasons);
  router.register("POST", /^\/api\/attendance-reasons$/, controller.createReason);
  router.register("PATCH", /^\/api\/attendance-reasons\/[^/]+$/, controller.updateReason);
}

module.exports = { registerAttendanceRoutes };
