function normalizePhone(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 9) digits = `998${digits}`;
  else if (digits.length === 10 && (digits.startsWith("0") || digits.startsWith("8"))) digits = `998${digits.slice(1)}`;
  return digits;
}

module.exports = { normalizePhone };
