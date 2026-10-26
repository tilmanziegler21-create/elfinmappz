import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import path from "path";

process.env.NODE_ENV = "test";
process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "elfin-bot-"));
process.env.TELEGRAM_TEST_MODE = "1";
delete process.env.TELEGRAM_BOT_TOKEN;
delete process.env.TELEGRAM_TEST_IDS;

const { copyKeys, t } = await import("./botCopy.js");
const { handleUpdate, parseUpdate } = await import("./bot.js");
const { enqueueNotice, trySendNotice } = await import("./notices.js");

const checks = [];
function record(id, ok, detail) {
  checks.push({ id, ok: Boolean(ok), detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${id} ${detail || ""}`);
}

const users = new Map();
const orders = [
  { id: "ORD-1", user_id: "111", status: "pending", total_amount: 42.9, final_amount: 42.9, created_at: "2026-10-20T10:00:00.000Z", delivery_method: "courier", delivery_date: "2026-10-21", delivery_time: "13:00", delivery_address: "Ледяная 4", comment: "у двери", username: "client", user_phone: "", courier_id: "courier-north", lines: [{ name: "Арбуз", quantity: 1 }] },
  { id: "ORD-2", user_id: "222", status: "pending", total_amount: 9, final_amount: 9, created_at: "2026-10-20T11:00:00.000Z", delivery_method: "pickup", delivery_address: "", comment: "", username: "other", courier_id: "courier-frost", lines: [] },
];
let tickets = [];
let delivers = 0;
const closed = new Set();

function ctx(url = "") {
  return {
    miniAppUrl: url,
    managerId: "",
    ensureUser(from) {
      const id = String(from.id);
      if (!users.has(id)) {
        users.set(id, { tg_id: id, username: from.username || "", first_name: from.first_name || "", status: id === "100000001" ? "courier" : id === "100000009" ? "admin" : "user", lang: "ru" });
      }
      return users.get(id);
    },
    ordersFor(tgId) {
      return orders.filter((order) => order.user_id === String(tgId));
    },
    orderFor(tgId, orderId) {
      return orders.find((order) => order.id === orderId && order.user_id === String(tgId)) || null;
    },
    items(orderId) {
      return (orders.find((order) => order.id === orderId)?.lines || []);
    },
    profile(user) {
      return { delivered: user.tg_id === "111" ? 1 : 0, last: user.tg_id === "111" ? "2026-10-19T12:00:00.000Z" : "", level: user.tg_id === "111" ? 2 : 1 };
    },
    async saveTicket(user, orderId, text) {
      const ticket = { id: `SUP-${tickets.length + 1}`, user_id: user.tg_id, order_id: orderId || "", text };
      tickets.push(ticket);
      return ticket;
    },
    courierOrders(user) {
      if (user.status !== "courier") return [];
      return orders.filter((order) => order.courier_id === "courier-north").map((order) => ({ id: order.id, status: order.status }));
    },
    courierOrder(user, orderId) {
      if (user.status !== "courier") return null;
      const order = orders.find((item) => item.id === orderId && item.courier_id === "courier-north");
      return order ? { ...order, contact: "" } : null;
    },
    async deliver(_user, orderId) {
      if (closed.has(orderId)) return { closed: true };
      delivers += 1;
      closed.add(orderId);
      return { ok: true };
    },
    async cancel(user, orderId, reason) {
      const order = orders.find((item) => item.id === orderId && item.courier_id === "courier-north");
      if (!reason || user.status !== "courier" || !order) return { ok: false };
      if (closed.has(orderId)) return { closed: true };
      closed.add(orderId);
      return { ok: true };
    },
    summaryText() {
      return "📊 Сводка\nСоздано: 2\nВыдано: 0\nНезакрытые заказы не считаются выручкой.";
    },
    adminOrdersText() {
      return "📦 Заказы\nORD-1 · pending";
    },
    adminCouriersText() {
      return "🚚 Курьеры\nСевер · активен";
    },
    async healthText() {
      return "📋 Интеграции\nЗапись в таблицу: выключена\nБот: токен не задан";
    },
    ticketsText() {
      return tickets.length ? tickets.map((ticket) => ticket.id).join("\n") : "Пусто.";
    },
  };
}

function start(id, chat = id) {
  return { message: { message_id: 1, chat: { id: chat }, from: { id, first_name: "Имя", username: "elf", language_code: "ru" }, text: "/start" } };
}

const first = await handleUpdate(start("555"), ctx());
const second = await handleUpdate(start("555"), ctx());
record("start-once", users.size === 1 && users.get("555").tg_id === "555", `users ${users.size}`);
record("start-menu", first.send.text.includes("ELFIN MARKET") && first.send.rows[0][0].callback_data === "m:nourl" && !first.send.rows[0][0].web_app, "без https нет web_app");
record("start-again", second.send.text.includes("Добро пожаловать") && users.size === 1, "повтор не создаёт клиента");

const shop = await handleUpdate(start("555"), ctx("https://elfin.example/app"));
record("shop-url", shop.send.rows[0][0].web_app?.url === "https://elfin.example/app", shop.send.rows[0][0].web_app?.url || "");

const httpUrl = await handleUpdate({ message: { message_id: 2, chat: { id: 555 }, from: { id: "555", language_code: "ru" }, text: "/shop" } }, ctx("http://127.0.0.1:5173"));
record("shop-local", httpUrl.send.text.includes("HTTPS") && !httpUrl.send.rows.some((row) => row.some((button) => button.web_app)), "локальный URL отклонён");

const list = await handleUpdate({ message: { message_id: 3, chat: { id: 111 }, from: { id: "111", language_code: "ru" }, text: "/orders" } }, ctx());
record("orders", list.send.text.includes("ORD-1") && !list.send.text.includes("ORD-2"), list.send.text);

const foreign = await handleUpdate({ callback_query: { id: "cb1", data: "m:od:ORD-2", from: { id: "111", language_code: "ru" }, message: { message_id: 4, chat: { id: 111 } } } }, ctx());
record("foreign-order", foreign.answer.id === "cb1" && foreign.edit.text.includes("не найден") && !foreign.edit.text.includes("other"), foreign.edit.text);

const profile = await handleUpdate({ message: { message_id: 5, chat: { id: 111 }, from: { id: "111", language_code: "ru" }, text: "/profile" } }, ctx());
record("profile", profile.send.text.includes("Hamburg") && profile.send.text.includes("2 / 10") && !profile.send.text.includes("9,90"), profile.send.text);

const support = await handleUpdate({ callback_query: { id: "cb2", data: "m:support", from: { id: "111", language_code: "ru" }, message: { message_id: 6, chat: { id: 111 } } } }, ctx());
record("support-no-manager", support.edit.text.includes("не настроен") && !support.edit.text.includes("@"), support.edit.text);
const ask = await handleUpdate({ callback_query: { id: "cb3", data: "m:sup:ORD-1", from: { id: "111", language_code: "ru" }, message: { message_id: 6, chat: { id: 111 } } } }, ctx());
const saved = await handleUpdate({ message: { message_id: 7, chat: { id: 111 }, from: { id: "111", language_code: "ru" }, text: "Где заказ?" } }, ctx());
record("support-save", ask.edit.text.includes("одним сообщением") && saved.send.text.includes("SUP-1") && tickets[0].order_id === "ORD-1" && tickets[0].text === "Где заказ?", saved.send.text);

const stranger = await handleUpdate({ callback_query: { id: "cb4", data: "c:od:ORD-1", from: { id: "111", language_code: "ru" }, message: { message_id: 8, chat: { id: 111 } } } }, ctx());
record("not-courier", stranger.edit.text.includes("не найден") || stranger.edit.text.includes("недоступен"), stranger.edit.text);

const courier = await handleUpdate(start("100000001", "100000001"), ctx());
record("courier-home", courier.send.text.includes("Панель курьера"), courier.send.text);
const card = await handleUpdate({ callback_query: { id: "cb5", data: "c:od:ORD-1", from: { id: "100000001", language_code: "ru" }, message: { message_id: 9, chat: { id: "100000001" } } } }, ctx());
const otherCard = await handleUpdate({ callback_query: { id: "cb6", data: "c:od:ORD-2", from: { id: "100000001", language_code: "ru" }, message: { message_id: 9, chat: { id: "100000001" } } } }, ctx());
record("courier-own", card.edit.text.includes("ORD-1") && card.edit.text.includes("Ледяная 4") && otherCard.edit.text.includes("не найден"), otherCard.edit.text);
const go = await handleUpdate({ callback_query: { id: "cb7", data: "c:go:ORD-1", from: { id: "100000001", language_code: "ru" }, message: { message_id: 9, chat: { id: "100000001" } } } }, ctx());
const goAgain = await handleUpdate({ callback_query: { id: "cb8", data: "c:go:ORD-1", from: { id: "100000001", language_code: "ru" }, message: { message_id: 9, chat: { id: "100000001" } } } }, ctx());
record("deliver-once", go.edit.text.includes("выданным") && goAgain.edit.text.includes("закрыт") && delivers === 1, `calls ${delivers}`);

const why = await handleUpdate({ callback_query: { id: "cb9", data: "c:why:ORD-2", from: { id: "100000001", language_code: "ru" }, message: { message_id: 10, chat: { id: "77" } } } }, ctx());
const reason = await handleUpdate({ message: { message_id: 11, chat: { id: "77" }, from: { id: "100000001", language_code: "ru" }, text: "не вышел" } }, ctx());
record("cancel-own-only", why.edit.text.includes("причину") && (reason.send.text.includes("недоступен") || reason.send.text.includes("закрыт")), reason.send.text);

const adminDenied = await handleUpdate({ message: { message_id: 12, chat: { id: 111 }, from: { id: "111", language_code: "ru" }, text: "/admin" } }, ctx());
record("admin-denied", adminDenied.send.text.includes("недоступен"), adminDenied.send.text);
const admin = await handleUpdate({ message: { message_id: 13, chat: { id: "100000009" }, from: { id: "100000009", language_code: "ru" }, text: "/admin" } }, ctx());
const summary = await handleUpdate({ callback_query: { id: "cb10", data: "a:sum", from: { id: "100000009", language_code: "ru" }, message: { message_id: 13, chat: { id: "100000009" } } } }, ctx());
record("admin-summary", admin.send.text.includes("Админ") && summary.edit.text.includes("не считаются выручкой") && !summary.edit.text.includes("private_key") && !/bot\d{6,}:/.test(summary.edit.text), summary.edit.text);

const big = parseUpdate('{"message":{"from":{"id":12345678901234567890},"chat":{"id":12345678901234567890},"text":"/start"}}');
record("big-id", big.message.from.id === "12345678901234567890", String(big.message.from.id));

let rate = null;
for (let i = 0; i < 26; i += 1) {
  rate = await handleUpdate({ callback_query: { id: `r${i}`, data: "m:home", from: { id: "900", language_code: "ru" }, message: { message_id: 20, chat: { id: "900" } } } }, ctx());
}
record("rate-limit", rate.answer.text.includes("часто") && !rate.edit, rate.answer.text);

for (const key of copyKeys) {
  if (!t("de", key) || !t("en", key)) record(`copy-${key}`, false, key);
}
record("copy", copyKeys.every((key) => t("de", key) && t("en", key)), `${copyKeys.length}`);

const notice = enqueueNotice({ recipient: "42", text: "Новый заказ ORD-9", orderId: "ORD-9", kind: "courier" });
await trySendNotice(notice, async () => true);
record("notice-no-token", notice.sent === false && notice.last_error === "NO_TOKEN", notice.last_error);
process.env.TELEGRAM_BOT_TOKEN = "test-token";
let blockedCalls = 0;
await trySendNotice(notice, async () => {
  blockedCalls += 1;
  return true;
});
record("notice-blocked", notice.sent === false && notice.status === "blocked" && blockedCalls === 0, notice.status);
process.env.TELEGRAM_TEST_IDS = "42";
let attempts = 0;
await trySendNotice(notice, async () => {
  attempts += 1;
  const error = new Error("timeout");
  error.name = "TimeoutError";
  throw error;
});
record("notice-timeout", notice.sent === false && notice.last_error === "TIMEOUT" && attempts === 1, notice.last_error);
await trySendNotice(notice, async () => {
  attempts += 1;
  return true;
});
const before = attempts;
await trySendNotice(notice, async () => {
  attempts += 1;
  return true;
});
record("notice-once", notice.sent === true && attempts === before && before === 2, `attempts ${attempts}`);

const failed = checks.filter((item) => !item.ok);
if (failed.length) {
  console.error(`FAILED ${failed.length}`);
  process.exit(1);
}
console.log(`OK ${checks.length}`);
