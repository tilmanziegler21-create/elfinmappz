import { db, persist } from "./store.js";

function testMode() {
  return process.env.TELEGRAM_TEST_MODE !== "0";
}

function allowed(recipient) {
  return new Set(String(process.env.TELEGRAM_TEST_IDS || "").split(",").map((item) => item.trim()).filter(Boolean)).has(recipient);
}

export function enqueueNotice({ recipient, text, orderId, kind }) {
  const id = `${kind}:${orderId || "none"}:${recipient || "none"}`;
  const existing = db().notices.find((item) => item.id === id);
  if (existing) return existing;
  const notice = {
    id,
    notification_id: id,
    order_id: orderId || "",
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
  if (testMode() && !allowed(notice.recipient)) {
    notice.last_error = "TEST_RECIPIENT_BLOCKED";
    notice.status = "blocked";
    notice.sent = false;
    persist();
    return notice;
  }
  notice.attempts += 1;
  try {
    const ok = await send(notice);
    if (ok) {
      notice.status = "sent";
      notice.sent = true;
      notice.last_error = "";
    } else {
      notice.status = "queued";
      notice.sent = false;
      notice.last_error = "TELEGRAM_REJECTED";
    }
  } catch (error) {
    notice.status = "queued";
    notice.sent = false;
    notice.last_error = error?.name === "TimeoutError" || error?.name === "AbortError" ? "TIMEOUT" : "TELEGRAM_ERROR";
  }
  persist();
  return notice;
}
