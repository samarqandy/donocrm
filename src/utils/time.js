function now() {
  return new Date().toISOString();
}

function today() {
  const timeZone = process.env.APP_TIME_ZONE || "Asia/Tashkent";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

module.exports = { now, today };
