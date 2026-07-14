const crypto = require("node:crypto");
const { secret } = require("../../config/app");
const { getMe, getUpdates, sendMessage } = require("../../integrations/telegramClient");
const { decryptSecret } = require("../../utils/secrets");
const { normalizePhone } = require("../../utils/phone");
const { now } = require("../../utils/time");

const MAX_ATTEMPTS = 5;

function linkTokenHash(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

function retryDate(attempts, retryAfter = 0) {
  const delaySeconds = retryAfter || [60, 300, 900, 3600, 10800][Math.min(Math.max(attempts - 1, 0), 4)];
  return new Date(Date.now() + delaySeconds * 1000).toISOString();
}

class TelegramQueueRepository {
  constructor(db) {
    this.db = db;
  }

  telegramToken(tenantId) {
    const envToken = secret("DONO_TELEGRAM_BOT_TOKEN", tenantId);
    if (envToken) return envToken;
    const row = this.db.prepare("SELECT telegram_bot_token_encrypted, telegram_bot_token FROM tenants WHERE id = ?").get(tenantId);
    return decryptSecret(row?.telegram_bot_token_encrypted) || row?.telegram_bot_token || "";
  }

  async botIdentity(tenantId) {
    const token = this.telegramToken(tenantId);
    if (!token) return null;
    return getMe(token);
  }

  async processMessages(tenantId) {
    const token = this.telegramToken(tenantId);
    const staleProcessingCutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    this.db.prepare(
      `UPDATE messages SET status = 'queued', sent_at = NULL, processing_started_at = NULL,
         next_attempt_at = COALESCE(next_attempt_at, ?), last_error_code = 'STALE_RECOVERED'
       WHERE tenant_id = ? AND channel = 'telegram' AND status = 'processing'
         AND (processing_started_at IS NULL OR processing_started_at < ?) AND attempts < ?`,
    ).run(now(), tenantId, staleProcessingCutoff, MAX_ATTEMPTS);
    this.db.prepare(
      `UPDATE messages SET status = 'failed', sent_at = ?, processing_started_at = NULL,
         last_error_code = 'MAX_ATTEMPTS', last_error_message = 'Maximum delivery attempts reached'
       WHERE tenant_id = ? AND channel = 'telegram' AND status = 'processing'
         AND (processing_started_at IS NULL OR processing_started_at < ?) AND attempts >= ?`,
    ).run(now(), tenantId, staleProcessingCutoff, MAX_ATTEMPTS);

    if (!token) return { processed: 0, sent: 0, failed: 0, retrying: 0, skippedNoToken: true };

    const claimId = `processing:${now()}:${crypto.randomBytes(6).toString("hex")}`;
    const processingStartedAt = now();
    this.db.prepare(
      `UPDATE messages SET status = 'processing', sent_at = ?, processing_started_at = ?
       WHERE tenant_id = ? AND id IN (
         SELECT id FROM messages
         WHERE tenant_id = ? AND channel = 'telegram' AND status = 'queued'
           AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
         ORDER BY created_at ASC LIMIT 50
       )`,
    ).run(claimId, processingStartedAt, tenantId, tenantId, processingStartedAt);

    const claimed = this.db.prepare(
      "SELECT * FROM messages WHERE tenant_id = ? AND channel = 'telegram' AND status = 'processing' AND sent_at = ? ORDER BY created_at ASC",
    ).all(tenantId, claimId);
    const studentChat = this.db.prepare(
      `SELECT COALESCE(NULLIF(g.telegram_chat_id, ''), NULLIF(s.telegram_chat_id, '')) AS telegram_chat_id
       FROM students s
       LEFT JOIN student_guardians sg ON sg.tenant_id = s.tenant_id AND sg.student_id = s.id AND sg.is_primary = 1
       LEFT JOIN guardians g ON g.id = sg.guardian_id AND g.tenant_id = sg.tenant_id
       WHERE s.id = ? AND s.tenant_id = ?
         AND COALESCE(NULLIF(g.telegram_chat_id, ''), NULLIF(s.telegram_chat_id, '')) IS NOT NULL
       LIMIT 1`,
    );
    const legacyChat = this.db.prepare(
      `SELECT COALESCE(NULLIF(g.telegram_chat_id, ''), NULLIF(s.telegram_chat_id, '')) AS telegram_chat_id
       FROM students s
       LEFT JOIN student_guardians sg ON sg.tenant_id = s.tenant_id AND sg.student_id = s.id AND sg.is_primary = 1
       LEFT JOIN guardians g ON g.id = sg.guardian_id AND g.tenant_id = sg.tenant_id
       WHERE (s.name = ? OR s.phone = ?) AND s.tenant_id = ?
         AND COALESCE(NULLIF(g.telegram_chat_id, ''), NULLIF(s.telegram_chat_id, '')) IS NOT NULL
       LIMIT 1`,
    );
    const success = this.db.prepare(
      `UPDATE messages SET attempts = ?, status = 'sent', sent_at = ?, processing_started_at = NULL,
       next_attempt_at = NULL, last_error_code = NULL, last_error_message = NULL, telegram_message_id = ?
       WHERE tenant_id = ? AND id = ?`,
    );
    const failure = this.db.prepare(
      `UPDATE messages SET attempts = ?, status = ?, sent_at = ?, processing_started_at = NULL,
       next_attempt_at = ?, last_error_code = ?, last_error_message = ? WHERE tenant_id = ? AND id = ?`,
    );

    let sent = 0;
    let failed = 0;
    let retrying = 0;
    for (const message of claimed) {
      const attempts = Number(message.attempts || 0) + 1;
      const chatId = message.student_id
        ? studentChat.get(message.student_id, tenantId)?.telegram_chat_id || ""
        : legacyChat.get(message.recipient, message.recipient, tenantId)?.telegram_chat_id || "";
      if (!chatId) {
        failure.run(attempts, "failed", now(), null, "CHAT_ID_MISSING", "Student Telegram account is not linked", tenantId, message.id);
        failed += 1;
        continue;
      }
      try {
        const result = await sendMessage(token, chatId, message.text);
        success.run(attempts, now(), String(result.message_id || ""), tenantId, message.id);
        sent += 1;
      } catch (error) {
        const shouldRetry = error.retryable && attempts < MAX_ATTEMPTS;
        failure.run(
          attempts,
          shouldRetry ? "queued" : "failed",
          shouldRetry ? null : now(),
          shouldRetry ? retryDate(attempts, error.retryAfter) : null,
          String(error.code || "TELEGRAM_ERROR"),
          String(error.message || "Telegram delivery failed").slice(0, 500),
          tenantId,
          message.id,
        );
        if (shouldRetry) retrying += 1;
        else failed += 1;
      }
    }
    return { processed: claimed.length, sent, failed, retrying };
  }

  retryFailed(tenantId) {
    const result = this.db.prepare(
      `UPDATE messages SET status = 'queued', attempts = 0, sent_at = NULL, processing_started_at = NULL,
       next_attempt_at = ?, last_error_code = NULL, last_error_message = NULL
       WHERE tenant_id = ? AND channel = 'telegram' AND status = 'failed'`,
    ).run(now(), tenantId);
    return Number(result.changes || 0);
  }

  createStudentLink(tenantId, studentId, userId, botUsername) {
    const token = crypto.randomBytes(24).toString("base64url");
    const tokenHash = linkTokenHash(token);
    const createdAt = now();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    this.db.prepare("DELETE FROM telegram_link_tokens WHERE tenant_id = ? AND student_id = ? AND used_at IS NULL").run(tenantId, studentId);
    this.db.prepare(
      "INSERT INTO telegram_link_tokens (token, tenant_id, student_id, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(tokenHash, tenantId, studentId, userId, createdAt, expiresAt);
    const username = String(botUsername || "").replace(/^@/, "");
    return { token, expiresAt, url: username ? `https://t.me/${username}?start=${token}` : "" };
  }

  consumeStudentLink(tenantId, token, chatId) {
    const tokenHash = linkTokenHash(token);
    const link = this.db.prepare(
      `SELECT lt.student_id, s.name, sg.guardian_id FROM telegram_link_tokens lt
       JOIN students s ON s.id = lt.student_id AND s.tenant_id = lt.tenant_id
       LEFT JOIN student_guardians sg ON sg.tenant_id = s.tenant_id AND sg.student_id = s.id AND sg.is_primary = 1
       WHERE lt.tenant_id = ? AND lt.token = ? AND lt.used_at IS NULL AND lt.expires_at > ? LIMIT 1`,
    ).get(tenantId, tokenHash, now());
    if (!link) return null;
    const timestamp = now();
    this.db.exec("BEGIN");
    try {
      const normalizedChatId = String(chatId);
      if (link.guardian_id) {
        this.db.prepare("UPDATE guardians SET telegram_chat_id = ?, updated_at = ? WHERE tenant_id = ? AND id = ?")
          .run(normalizedChatId, timestamp, tenantId, link.guardian_id);
        this.db.prepare(
          `UPDATE students SET telegram_chat_id = ?, updated_at = ?
           WHERE tenant_id = ? AND id IN (
             SELECT student_id FROM student_guardians WHERE tenant_id = ? AND guardian_id = ?
           )`,
        ).run(normalizedChatId, timestamp, tenantId, tenantId, link.guardian_id);
      } else {
        this.db.prepare("UPDATE students SET telegram_chat_id = ?, updated_at = ? WHERE tenant_id = ? AND id = ?")
          .run(normalizedChatId, timestamp, tenantId, link.student_id);
      }
      this.db.prepare("UPDATE telegram_link_tokens SET used_at = ?, telegram_chat_id = ? WHERE tenant_id = ? AND token = ?").run(timestamp, String(chatId), tenantId, tokenHash);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return link;
  }

  studentsByParentPhone(tenantId, phone) {
    const normalized = normalizePhone(phone);
    if (!normalized) return [];
    const guardianStudents = this.db.prepare(
      `SELECT s.id, s.name,
              COALESCE(MAX(CASE WHEN sg.is_primary = 1 THEN g.name END), MIN(g.name), s.parent_name) AS parent_name,
              GROUP_CONCAT(DISTINCT g.id) AS guardian_ids
       FROM guardians g
       JOIN student_guardians sg ON sg.guardian_id = g.id AND sg.tenant_id = g.tenant_id
       JOIN students s ON s.id = sg.student_id AND s.tenant_id = sg.tenant_id
       WHERE g.tenant_id = ? AND g.phone_normalized = ? AND g.status = 'active' AND s.status != 'left'
       GROUP BY s.id, s.name, s.parent_name
       ORDER BY s.name`,
    ).all(tenantId, normalized);
    if (guardianStudents.length) return guardianStudents;

    // Compatibility for tenants imported before guardian normalization or for
    // records whose legacy phone has not been promoted yet.
    return this.db.prepare(
      `SELECT id, name, parent_name FROM students
       WHERE tenant_id = ? AND phone_normalized = ? AND status != 'left'
       ORDER BY name`,
    ).all(tenantId, normalized);
  }

  connectStudentsToTelegram(tenantId, students, chatId) {
    if (!students.length) return 0;
    const normalizedChatId = String(chatId);
    const updateStudent = this.db.prepare("UPDATE students SET telegram_chat_id = ? WHERE tenant_id = ? AND id = ?");
    const updateGuardian = this.db.prepare("UPDATE guardians SET telegram_chat_id = ?, updated_at = ? WHERE tenant_id = ? AND id = ?");
    const guardianIds = new Set(
      students.flatMap((student) => String(student.guardian_ids || "").split(",").map((value) => value.trim()).filter(Boolean)),
    );
    this.db.exec("BEGIN");
    try {
      const timestamp = now();
      guardianIds.forEach((guardianId) => updateGuardian.run(normalizedChatId, timestamp, tenantId, guardianId));
      students.forEach((student) => updateStudent.run(normalizedChatId, tenantId, student.id));
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return students.length;
  }

  contactPrompt(language = "uz") {
    const russian = language === "ru";
    return {
      text: russian
        ? "Здравствуйте! Чтобы подключить данные вашего ребёнка, отправьте свой номер телефона кнопкой ниже."
        : "Assalomu alaykum! Farzandingiz ma'lumotlarini ulash uchun quyidagi tugma orqali telefon raqamingizni yuboring.",
      replyMarkup: {
        keyboard: [[{ text: russian ? "📱 Отправить номер телефона" : "📱 Telefon raqamni yuborish", request_contact: true }]],
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    };
  }

  async sendContactPrompt(token, chatId, language) {
    const prompt = this.contactPrompt(language);
    return sendMessage(token, chatId, prompt.text, { reply_markup: prompt.replyMarkup });
  }

  async processUpdates(tenantId) {
    const token = this.telegramToken(tenantId);
    if (!token) return { updates: 0, linked: 0 };
    const tenant = this.db.prepare("SELECT telegram_update_offset, language FROM tenants WHERE id = ?").get(tenantId);
    const updates = await getUpdates(token, Number(tenant?.telegram_update_offset || 0));
    let linked = 0;
    let nextOffset = Number(tenant?.telegram_update_offset || 0);
    for (const update of updates) {
      nextOffset = Math.max(nextOffset, Number(update.update_id || 0) + 1);
      const message = update.message;
      if (!message || message.chat?.type !== "private") continue;
      const language = tenant?.language || "uz";
      const text = String(message.text || "").trim();
      const contact = message.contact;

      if (contact) {
        const isOwnContact = contact.user_id !== undefined && String(contact.user_id) === String(message.from?.id || "");
        if (!isOwnContact) {
          const warning = language === "ru"
            ? "В целях безопасности отправьте свой номер только кнопкой ниже."
            : "Xavfsizlik uchun faqat o'zingizning telefon raqamingizni quyidagi tugma orqali yuboring.";
          const prompt = this.contactPrompt(language);
          await sendMessage(token, message.chat.id, warning, { reply_markup: prompt.replyMarkup }).catch(() => {});
          continue;
        }
        const students = this.studentsByParentPhone(tenantId, contact.phone_number);
        if (!students.length) {
          const notFound = language === "ru"
            ? "Извините, ученик с этим номером телефона не найден. Обратитесь к администратору учебного центра."
            : "Uzr, bu telefon raqam bilan o'quvchi topilmadi. Iltimos, o'quv markazi administratoriga murojaat qiling.";
          await sendMessage(token, message.chat.id, notFound, { reply_markup: { remove_keyboard: true } }).catch(() => {});
          continue;
        }
        linked += this.connectStudentsToTelegram(tenantId, students, message.chat.id);
        const names = students.map((student) => student.name).join(", ");
        const parentName = students[0].parent_name || "";
        const successText = language === "ru"
          ? `Здравствуйте${parentName ? `, ${parentName}` : ""}! Вы успешно подключены как родитель: ${names}.`
          : `Assalomu alaykum${parentName ? `, ${parentName}` : ""}! Siz ${names}ning ota-onasi sifatida DonoCRM tizimiga muvaffaqiyatli ulandingiz.`;
        await sendMessage(token, message.chat.id, successText, { reply_markup: { remove_keyboard: true } }).catch(() => {});
        continue;
      }

      const linkMatch = text.match(/^\/start(?:@\w+)?\s+([A-Za-z0-9_-]{10,64})$/);
      if (linkMatch) {
        const student = this.consumeStudentLink(tenantId, linkMatch[1], message.chat.id);
        if (!student) {
          const expired = language === "ru"
            ? "Ссылка устарела или уже использована. Вы можете подключиться по номеру телефона."
            : "Ulash havolasi eskirgan yoki ishlatilgan. Telefon raqamingiz orqali ulanishingiz mumkin.";
          const prompt = this.contactPrompt(language);
          await sendMessage(token, message.chat.id, expired, { reply_markup: prompt.replyMarkup }).catch(() => {});
          continue;
        }
        linked += 1;
        const success = language === "ru"
          ? `${student.name}: Telegram-аккаунт успешно подключён к DonoCRM.`
          : `${student.name} Telegram akkaunti DonoCRM bilan muvaffaqiyatli ulandi.`;
        await sendMessage(token, message.chat.id, success, { reply_markup: { remove_keyboard: true } }).catch(() => {});
        continue;
      }

      if (/^\/start(?:@\w+)?(?:\s.*)?$/i.test(text)) {
        await this.sendContactPrompt(token, message.chat.id, language).catch(() => {});
      }
    }
    if (nextOffset !== Number(tenant?.telegram_update_offset || 0)) {
      this.db.prepare("UPDATE tenants SET telegram_update_offset = ? WHERE id = ?").run(nextOffset, tenantId);
    }
    return { updates: updates.length, linked };
  }

  async sendTelegramTestMessage(tenantId, chatId) {
    const token = this.telegramToken(tenantId);
    if (!token) return { success: false, error: "Telegram bot token is not configured" };
    try {
      await sendMessage(token, chatId, "DonoCRM Telegram boti muvaffaqiyatli ulandi!");
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message, code: error.code };
    }
  }
}

module.exports = { MAX_ATTEMPTS, TelegramQueueRepository };
