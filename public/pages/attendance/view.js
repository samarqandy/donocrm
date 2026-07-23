import { html } from "../../components/html.js";

function reasonOptions(reasons, status, selectedId) {
  return reasons.filter((reason) => reason.attendanceStatus === status || reason.id === selectedId)
    .map((reason) => `<option value="${html(reason.id)}" ${reason.id === selectedId ? "selected" : ""}>${html(reason.name)}</option>`).join("");
}

export function attendanceView(model) {
  return `<section class="attendance-page"><header><h1>${html(model.lesson.groupName || "Davomat")}</h1><p>${html(model.lesson.date)} · ${html(model.lesson.time)}</p></header>
    <div class="attendance-list">${model.students.map((student) => { const status = student.attendanceStatus || "present"; return `<article data-student-id="${html(student.id)}"><strong>${html(student.name)}</strong><select data-status>${["present", "absent", "late", "excused"].map((value) => `<option value="${value}" ${value === status ? "selected" : ""}>${value}</option>`).join("")}</select><select data-reason>${reasonOptions(model.reasons, status, student.attendanceReasonId)}</select><input data-note maxlength="500" value="${html(student.attendanceNote || "")}" placeholder="Izoh" /></article>`; }).join("")}</div>
    <label>Mavzu <input data-topic maxlength="500" value="${html(model.lesson.topic || "")}" /></label>
    <label>Uy vazifasi <textarea data-homework maxlength="2000">${html(model.lesson.homework || "")}</textarea></label>
    <label>Dars izohi <textarea data-lesson-note maxlength="2000">${html(model.lesson.note || "")}</textarea></label>
    ${model.lesson.status === "completed" ? `<label>Tuzatish sababi <textarea data-correction-reason maxlength="500" required></textarea></label>` : ""}
    <button type="button" data-action="save">Saqlash</button><p data-feedback aria-live="polite"></p></section>`;
}
