import { loadAttendance, saveAttendance } from "./actions.js";
import { attendanceView } from "./view.js";

export const attendancePage = {
  load: loadAttendance,
  render: attendanceView,
  mount(context) {
    const controller = new AbortController();
    context.abortController = controller;
    context.root.querySelector(".attendance-list")?.addEventListener("change", (event) => {
      if (!event.target.matches("[data-status]")) return;
      const reasonSelect = event.target.closest("[data-student-id]").querySelector("[data-reason]");
      reasonSelect.replaceChildren(...context.model.reasons
        .filter((reason) => reason.attendanceStatus === event.target.value && reason.isActive !== false)
        .map((reason) => {
          const option = document.createElement("option");
          option.value = reason.id;
          option.textContent = reason.name;
          return option;
        }));
    }, { signal: controller.signal });
    context.root.querySelector("[data-action='save']")?.addEventListener("click", async () => {
      const feedback = context.root.querySelector("[data-feedback]");
      try { feedback.textContent = "Saqlanmoqda..."; await saveAttendance(context.model, context.root); feedback.textContent = "Saqlandi"; }
      catch (error) { feedback.textContent = error.message; }
    }, { signal: controller.signal });
  },
  unmount(context) { context.abortController?.abort(); },
};
