class TelegramApiError extends Error {
  constructor(message, options = {}) {
    super(message || "Telegram API error");
    this.name = "TelegramApiError";
    this.code = options.code || "TELEGRAM_API_ERROR";
    this.httpStatus = options.httpStatus || 0;
    this.retryAfter = Number(options.retryAfter || 0);
    this.retryable = Boolean(options.retryable);
  }
}

async function telegramRequest(token, method, body = {}, timeoutMs = 12_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) {
      const retryAfter = Number(payload.parameters?.retry_after || 0);
      const code = String(payload.error_code || response.status || "TELEGRAM_API_ERROR");
      throw new TelegramApiError(payload.description || "Telegram API request failed", {
        code,
        httpStatus: response.status,
        retryAfter,
        retryable: response.status === 429 || response.status >= 500 || retryAfter > 0,
      });
    }
    return payload.result;
  } catch (error) {
    if (error instanceof TelegramApiError) throw error;
    throw new TelegramApiError(error.name === "AbortError" ? "Telegram request timed out" : error.message, {
      code: error.name === "AbortError" ? "TIMEOUT" : "NETWORK_ERROR",
      retryable: true,
    });
  } finally {
    clearTimeout(timeout);
  }
}

const getMe = (token) => telegramRequest(token, "getMe");
const sendMessage = (token, chatId, text, options = {}) =>
  telegramRequest(token, "sendMessage", { chat_id: chatId, text, link_preview_options: { is_disabled: true }, ...options });
const getUpdates = (token, offset) => telegramRequest(token, "getUpdates", { offset, limit: 100, timeout: 0, allowed_updates: ["message"] });

module.exports = { TelegramApiError, getMe, getUpdates, sendMessage, telegramRequest };
