function required(value, field) {
  if (value === undefined || value === null || String(value).trim() === "") {
    const error = new Error(`${field} is required`);
    error.status = 422;
    throw error;
  }
  return String(value).trim();
}

function positiveAmount(value, field = "amount") {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    const error = new Error(`${field} must be greater than 0`);
    error.status = 422;
    throw error;
  }
  return Math.round(amount);
}

function enumValue(value, values, field) {
  if (!values.includes(value)) {
    const error = new Error(`${field} is invalid`);
    error.status = 422;
    throw error;
  }
  return value;
}

module.exports = { required, positiveAmount, enumValue };
