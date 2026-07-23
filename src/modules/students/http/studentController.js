const { sendJson } = require("../../../http/json");
const { requestContext, requireTenantContext } = require("../../../services/context");

function createStudentController({ listStudents }) {
  return {
    async list(req, res) {
      const context = requestContext(req);
      requireTenantContext(context);
      const parsed = new URL(req.url, `http://${req.headers.host || "localhost"}`);
      const includeArchived = ["1", "true"].includes(
        String(parsed.searchParams.get("includeArchived") || "").toLowerCase(),
      );
      const students = await listStudents(context, {
        search: parsed.searchParams.get("search") || "",
        includeArchived,
      });
      sendJson(res, 200, { students });
    },
  };
}

module.exports = { createStudentController };
