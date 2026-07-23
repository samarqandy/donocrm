import { PageRouter } from "./core/router.js";
import { attendancePage } from "./pages/attendance/index.js";

const root = document.getElementById("app");
const router = new PageRouter(root).register("attendance", attendancePage);

// Parallel Strangler entry point. Legacy index.html remains unchanged until
// browser parity tests approve each extracted page.
window.donoNext = { router };
