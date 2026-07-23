const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 5;
const MAX_KEYS = 10_000;

class SlidingWindowRateLimiter {
  constructor({ limit = MAX_ATTEMPTS, windowMs = WINDOW_MS, maxKeys = MAX_KEYS } = {}) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.maxKeys = maxKeys;
    this.attempts = new Map();
  }

  consume(key, timestamp = Date.now()) {
    const normalizedKey = String(key || "unknown");
    const cutoff = timestamp - this.windowMs;
    const recent = (this.attempts.get(normalizedKey) || []).filter((attempt) => attempt > cutoff);
    if (recent.length >= this.limit) {
      this.attempts.set(normalizedKey, recent);
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil((recent[0] + this.windowMs - timestamp) / 1000)),
      };
    }
    recent.push(timestamp);
    this.attempts.set(normalizedKey, recent);
    if (this.attempts.size > this.maxKeys) this.prune(timestamp);
    return { allowed: true, remaining: this.limit - recent.length, retryAfterSeconds: 0 };
  }

  reset(key) {
    this.attempts.delete(String(key || "unknown"));
  }

  clear() {
    this.attempts.clear();
  }

  prune(timestamp = Date.now()) {
    const cutoff = timestamp - this.windowMs;
    for (const [key, attempts] of this.attempts) {
      const recent = attempts.filter((attempt) => attempt > cutoff);
      if (recent.length) this.attempts.set(key, recent);
      else this.attempts.delete(key);
    }
    while (this.attempts.size > this.maxKeys) {
      this.attempts.delete(this.attempts.keys().next().value);
    }
  }
}

function isLoopback(address) {
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

function clientIp(req) {
  const socketAddress = String(req.socket?.remoteAddress || "unknown");
  const trustProxy = process.env.TRUST_PROXY === "true" || isLoopback(socketAddress);
  if (trustProxy) {
    const forwarded = String(req.headers?.["x-forwarded-for"] || "").split(",")[0].trim();
    if (forwarded) return forwarded.slice(0, 128);
  }
  return socketAddress.slice(0, 128);
}

const loginRateLimiter = new SlidingWindowRateLimiter();

module.exports = { clientIp, loginRateLimiter, SlidingWindowRateLimiter, MAX_ATTEMPTS, WINDOW_MS };
