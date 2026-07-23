const crypto = require("node:crypto");
const { promisify } = require("node:util");

const ALGORITHM = "pbkdf2_sha256";
const ITERATIONS = 210_000;
const KEY_LENGTH = 32;
const DIGEST = "sha256";
const pbkdf2Async = promisify(crypto.pbkdf2);
const DUMMY_PASSWORD_HASH = "pbkdf2_sha256$210000$donocrm-login-dummy-v1$LHoZJmskQ-kp1bx7a4XXLn3cPTPS2v5IPUHId3D3PMg";
const DEMO_ADMIN_PASSWORD_HASH = "pbkdf2_sha256$210000$donocrm-demo-admin-v1$tyGznpFbl8vSgaC8m9-sULhcDvlwz-QOugWb4E1HV20";
const DEMO_TEACHER_PASSWORD_HASH = "pbkdf2_sha256$210000$donocrm-demo-teacher-v1$UAdCNeJ3GgdV6MSp7xWfbRXk9Z976zGJUvML4L27ZL0";
const DEMO_SUPER_PASSWORD_HASH = "pbkdf2_sha256$210000$donocrm-demo-super-v1$IAsjpmPgYKspW4SstzOaD1F5J7w0bfUnzwTGLmO28Zc";

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("base64url");
  const hash = (await pbkdf2Async(String(password), salt, ITERATIONS, KEY_LENGTH, DIGEST)).toString("base64url");
  return `${ALGORITHM}$${ITERATIONS}$${salt}$${hash}`;
}

function isPasswordHash(value) {
  return String(value || "").startsWith(`${ALGORITHM}$`);
}

async function verifyPassword(password, stored) {
  const encoded = isPasswordHash(stored) ? String(stored) : DUMMY_PASSWORD_HASH;
  const [, iterationsText, salt, expectedText] = encoded.split("$");
  const iterations = Number(iterationsText);
  const parametersValid = Number.isSafeInteger(iterations)
    && iterations >= 100_000
    && iterations <= 1_000_000
    && Boolean(salt)
    && Boolean(expectedText);
  const safeIterations = parametersValid ? iterations : ITERATIONS;
  const safeSalt = parametersValid ? salt : "donocrm-login-dummy-v1";
  const expected = parametersValid ? Buffer.from(expectedText, "base64url") : Buffer.alloc(KEY_LENGTH);
  const actual = await pbkdf2Async(String(password), safeSalt, safeIterations, KEY_LENGTH, DIGEST);
  const matches = expected.length === actual.length && crypto.timingSafeEqual(actual, expected);
  return isPasswordHash(stored) && parametersValid && matches;
}

module.exports = {
  DEMO_ADMIN_PASSWORD_HASH,
  DEMO_SUPER_PASSWORD_HASH,
  DEMO_TEACHER_PASSWORD_HASH,
  DUMMY_PASSWORD_HASH,
  hashPassword,
  isPasswordHash,
  verifyPassword,
};
