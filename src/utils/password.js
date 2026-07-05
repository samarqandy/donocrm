const crypto = require("node:crypto");

const ALGORITHM = "pbkdf2_sha256";
const ITERATIONS = 210_000;
const KEY_LENGTH = 32;
const DIGEST = "sha256";

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("base64url");
  const hash = crypto.pbkdf2Sync(String(password), salt, ITERATIONS, KEY_LENGTH, DIGEST).toString("base64url");
  return `${ALGORITHM}$${ITERATIONS}$${salt}$${hash}`;
}

function isPasswordHash(value) {
  return String(value || "").startsWith(`${ALGORITHM}$`);
}

function verifyPassword(password, stored) {
  if (!isPasswordHash(stored)) {
    return String(password) === String(stored || "");
  }

  const [, iterations, salt, expected] = String(stored).split("$");
  if (!iterations || !salt || !expected) return false;

  const actual = crypto.pbkdf2Sync(String(password), salt, Number(iterations), KEY_LENGTH, DIGEST).toString("base64url");
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

module.exports = { hashPassword, isPasswordHash, verifyPassword };
