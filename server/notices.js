import { db, persist } from "./store.js";

export function telegramTestMode() {
  const value = String(process.env.TELEGRAM_TEST_MODE ?? "").trim().toLowerCase();
  return value !== "0" && value !== "false" && value !== "off" && value !== "no";
}

function allowed(recipient) {
  return new Set(String(process.env.TELEGRAM_TEST_IDS || "").split(",").map((item) => item.trim()).filter(Boolean)).has(recipient);
}

export function bindNoticeRecipient(notice, recipient) {
  if (!notice || notice.sent) return notice;
  const tg = String(recipient || "").trim();
  if (!/^\d+$/.test(tg)) return notice;
  if (notice.recipient !== tg) notice.attempts = 0;
  notice.recipient = tg;
  notice.tgId = tg;
  if (notice.last_error === "NO_RECIPIENT" || notice.last_error === "TEST_RECIPIENT_BLOCKED") notice.last_error = "";
  if (notice.status === "blocked") notice.status = "queued";
  return notice;
}

export function enqueueNotice({ recipient, text, orderId, kind }) {
  const id = `${kind}:${orderId || "none"}:${recipient || "none"}`;
  const existing = db().notices.find((item) => item.id === id);
  if (existing) return existing;
  if (kind === "courier" && orderId) {
    const prior = db().notices.find((item) => !item.sent && item.order_id === orderId && (item.kind === "courier" || String(item.id || "").startsWith(`courier:${orderId}:`)));
    if (prior) {
      bindNoticeRecipient(prior, recipient);
      persist();
      return prior;
    }
  }
  const notice = {
    id,
    notification_id: id,
    order_id: orderId || "",
    kind: String(kind || ""),
    recipient: String(recipient || ""),
    tgId: String(recipient || ""),
    text,
    status: "queued",
    attempts: 0,
    last_error: "",
    sent: false,
    at: new Date().toISOString(),
  };
  db().notices.push(notice);
  persist();
  return notice;
}

export async function trySendNotice(notice, send) {
  if (!notice || notice.status === "sent" || notice.sent) return notice;
  if (notice.attempts >= 5) return notice;
  const token = String(process.env.TELEGRAM_BOT_TOKEN || "");
  if (!token) {
    notice.last_error = "NO_TOKEN";
    notice.sent = false;
    persist();
    return notice;
  }
  if (!notice.recipient) {
    notice.last_error = "NO_RECIPIENT";
    notice.sent = false;
    persist();
    return notice;
  }
  if (telegramTestMode() && !allowed(notice.recipient)) {
    notice.last_error = "TEST_RECIPIENT_BLOCKED";
    notice.status = "blocked";
    notice.sent = false;
    persist();
    return notice;
  }
  notice.attempts += 1;
  try {
    const result = await send(notice);
    const ok = result === true || result?.ok === true;
    const code = /^[A-Z0-9_]{1,40}$/.test(String(result?.code || "")) ? String(result.code) : "";
    const messageId = Number(result?.messageId);
    if (Number.isInteger(messageId) && messageId > 0) notice.telegram_message_id = messageId;
    if (ok) {
      notice.status = "sent";
      notice.sent = true;
      notice.sent_at = new Date().toISOString();
      notice.last_error = "";
    } else {
      notice.status = "queued";
      notice.sent = false;
      notice.last_error = code || "TELEGRAM_REJECTED";
    }
  } catch (error) {
    notice.status = "queued";
    notice.sent = false;
    notice.last_error = error?.name === "TimeoutError" || error?.name === "AbortError" ? "TIMEOUT" : "TELEGRAM_ERROR";
  }
  persist();
  return notice;
}
