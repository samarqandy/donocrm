const { sendJson } = require("../../http/json");

class StranglerRouter {
  constructor() {
    this.routes = [];
  }

  register(method, pattern, handler, options = {}) {
    this.routes.push({ method, pattern, handler, enabled: options.enabled || (() => true) });
  }

  async dispatch(req, res, pathname) {
    const route = this.routes.find((candidate) =>
      candidate.method === req.method && candidate.pattern.test(pathname) && candidate.enabled(req));
    if (!route) return false;
    try {
      await route.handler(req, res, pathname);
    } catch (error) {
      if (Number(error.status || 500) >= 500) {
        console.error(`[StranglerHTTP] ${req.method} ${pathname}:`, error.stack || error.message);
      }
      if (!res.headersSent && !res.writableEnded) {
        sendJson(res, Number(error.status || 500), { error: Number(error.status || 500) >= 500 ? "Internal server error" : error.message });
      }
    }
    return true;
  }
}

module.exports = { StranglerRouter };
