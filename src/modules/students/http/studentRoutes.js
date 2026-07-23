function registerStudentRoutes(router, controller) {
  router.register("GET", /^\/api\/students$/, controller.list);
}

module.exports = { registerStudentRoutes };
