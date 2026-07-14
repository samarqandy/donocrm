const DAY_MS = 24 * 60 * 60 * 1000;

function parseDateOnly(value) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(date.getTime())) return null;
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date;
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, days) {
  return new Date(date.getTime() + days * DAY_MS);
}

function isoWeekday(value) {
  const date = value instanceof Date ? value : parseDateOnly(value);
  if (!date) return null;
  const day = date.getUTCDay();
  return day === 0 ? 7 : day;
}

function weekRange(value) {
  const date = parseDateOnly(value) || parseDateOnly(new Date().toISOString().slice(0, 10));
  const weekday = isoWeekday(date);
  const start = addDays(date, 1 - weekday);
  const end = addDays(start, 6);
  return { startDate: isoDate(start), endDate: isoDate(end) };
}

function isoWeekKey(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : parseDateOnly(value);
  if (!date) return "";
  const weekday = isoWeekday(date);
  const thursday = addDays(date, 4 - weekday);
  const year = thursday.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil(((thursday.getTime() - yearStart.getTime()) / DAY_MS + 1) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

function dateForWeekday(value, weekday) {
  const range = weekRange(value);
  const target = Number(weekday);
  if (!Number.isInteger(target) || target < 1 || target > 7) return "";
  return isoDate(addDays(parseDateOnly(range.startDate), target - 1));
}

function normalizeTime(value) {
  const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return "";
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return "";
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function timeToMinutes(value) {
  const [hour, minute] = String(value || "").split(":").map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return NaN;
  return hour * 60 + minute;
}

function parseLessonTime(value) {
  const match = String(value || "").match(/^\s*(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})\s*$/);
  if (!match) return null;
  const startTime = normalizeTime(match[1]);
  const endTime = normalizeTime(match[2]);
  if (!startTime || !endTime) return null;
  if (timeToMinutes(endTime) <= timeToMinutes(startTime)) return null;
  return { startTime, endTime };
}

module.exports = {
  addDays,
  dateForWeekday,
  isoDate,
  isoWeekKey,
  isoWeekday,
  normalizeTime,
  parseDateOnly,
  parseLessonTime,
  weekRange,
};
