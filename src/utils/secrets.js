const crypto = require("node:crypto");
const { nodeEnv } = require("../config/app");

function key() {
  const raw = String(process.env.DONO_SECRET_ENCRYPTION_KEY || "").trim();
  if (/^[a-f0-9]{64}$/i.test(raw)) return Buffer.from(raw, "hex");
  if (raw) {
    const decoded = Buffer.from(raw, "base64");
    if (decoded.length === 32) return decoded;
  }
  if (nodeEnv !== "production") return crypto.createHash("sha256").update("donocrm-development-secret-only").digest();
  return null;
}

function encryptSecret(value) {
  const secretKey = key();
  if (!secretKey) {
    const error = new Error("DONO_SECRET_ENCRYPTION_KEY is required");
    error.status = 503;
    throw error;
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", secretKey, iv);
  const encrypted = Buffer.concat([cipher.update(String(value), "utf8"), cipher.final()]);
  return `v1.${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${encrypted.toString("base64url")}`;
}

function decryptSecret(value) {
  if (!value) return "";
  const secretKey = key();
  if (!secretKey) return "";
  const [version, iv, tag, encrypted] = String(value).split(".");
  if (version !== "v1" || !iv || !tag || !encrypted) return "";
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", secretKey, Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
  } catch (_error) {
    return "";
  }
}

module.exports = { decryptSecret, encryptSecret };
