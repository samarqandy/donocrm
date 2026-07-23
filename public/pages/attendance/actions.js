import { api } from "../../core/api.js";

export async function loadAttendance({ lessonId }) {
  if (!lessonId) throw new Error("lessonId is required");
  const [profile, reasons] = await Promise.all([
    api(`/api/lessons/${encodeURIComponent(lessonId)}`),
    api("/api/attendance-reasons"),
  ]);
  return { lesson: profile.lesson, students: profile.students || [], reasons: reasons.attendanceReasons || [] };
}

export async function saveAttendance(model, root) {
  const records = [...root.querySelectorAll("[data-student-id]")].map((row) => ({
    studentId: row.dataset.studentId,
    status: row.querySelector("[data-status]").value,
    reasonId: row.querySelector("[data-reason]").value,
    note: row.querySelector("[data-note]").value,
  }));
  return api("/api/attendance", {
    method: "POST",
    body: JSON.stringify({
      lessonId: model.lesson.id,
      topic: root.querySelector("[data-topic]").value,
      homework: root.querySelector("[data-homework]").value,
      lessonNote: root.querySelector("[data-lesson-note]").value,
      correctionReason: root.querySelector("[data-correction-reason]")?.value || "",
      records,
    }),
  });
}
