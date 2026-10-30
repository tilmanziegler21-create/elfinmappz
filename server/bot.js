import path from "path";
import { fileURLToPath } from "url";
import { copyKeys, language, t } from "./botCopy.js";
import { customerHandle, formatLine, orderNumber } from "./lineLabel.js";

export const startLogoFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public/elf.jpg");

const PAGE = 5;
const COURIER_PAGE = 8;
const hits = new Map();
const sessions = new Map();

const STATUS = {
  ru: { buffer: "Черновик", pending: "Ожидает", assigned: "Назначен", picked_up: "В пути", delivered: "Выдан", cancelled: "Отменён" },
  de: { buffer: "Entwurf", pending: "Wartet", assigned: "Zugewiesen", picked_up: "Unterwegs", delivered: "Übergeben", cancelled: "Storniert" },
  en: { buffer: "Draft", pending: "Waiting", assigned: "Assigned", picked_up: "On the way", delivered: "Delivered", cancelled: "Cancelled" },
};

export function parseUpdate(raw) {
  const safe = String(raw).replace(/"(id|user_id)"\s*:\s*(\d{16,})/g, '"$1":"$2"');
  return JSON.parse(safe);
}

export function httpsUrl(value) {
  const url = String(value || "").trim();
  if (!url.startsWith("https://")) return "";
  return url;
}

function session(chatId) {
  const key = String(chatId);
  if (!sessions.has(key)) sessions.set(key, {});
  return sessions.get(key);
}

function limited(chatId) {
  const now = Date.now();
  const next = (hits.get(String(chatId)) || []).filter((time) => now - time < 10_000);
  if (next.length >= 25) {
    hits.set(String(chatId), next);
    return true;
  }
  next.push(now);
  hits.set(String(chatId), next);
  return false;
}

function euro(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  const sign = number < 0 ? "−" : "";
  return `${sign}${Math.abs(number).toFixed(2).replace(".", ",")} €`;
}

function esc(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function safeId(id) {
  const value = String(id || "");
  return /^[A-Za-z0-9_-]{1,40}$/.test(value) ? value : "";
}

function berlinDay(date) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const pick = (type) => parts.find((item) => item.type === type)?.value || "";
  return { iso: `${pick("year")}-${pick("month")}-${pick("day")}`, label: `${pick("day")}.${pick("month")}.${pick("year")}` };
}

function shiftIso(iso, days) {
  const [year, month, day] = String(iso || "").split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + Number(days || 0)));
  const nextMonth = String(date.getUTCMonth() + 1).padStart(2, "0");
  const nextDay = String(date.getUTCDate()).padStart(2, "0");
  return `${date.getUTCFullYear()}-${nextMonth}-${nextDay}`;
}

function parseCash(text) {
  const raw = String(text || "").trim().replace(/\s/g, "").replace("€", "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) return null;
  return Math.round(Number(raw) * 100) / 100;
}

function when(value) {
  const text = String(value || "");
  return text ? text.slice(0, 16).replace("T", " ") : "—";
}

function statusName(lang, status) {
  return (STATUS[lang] || STATUS.ru)[status] || status || "—";
}

function shopButton(lang, url) {
  if (!url) return { text: t(lang, "shop"), callback_data: "m:nourl" };
  return { text: t(lang, "shop"), web_app: { url } };
}

function openShopButton(lang, url) {
  if (!url) return { text: t(lang, "openShop"), callback_data: "m:nourl" };
  return { text: t(lang, "openShop"), style: "primary", web_app: { url } };
}

function customerKeyboard(lang, url, user) {
  const rows = [
    [shopButton(lang, url)],
    [{ text: t(lang, "orders"), callback_data: "m:orders:0" }, { text: t(lang, "profile"), callback_data: "m:profile" }],
    [{ text: t(lang, "support"), callback_data: "m:support" }, { text: t(lang, "info"), callback_data: "m:info" }],
  ];
  if (user?.courier) rows.push([{ text: t(lang, "courierTitle"), callback_data: "c:home" }]);
  if (user?.admin) rows.push([{ text: t(lang, "admin"), callback_data: "a:home" }]);
  return rows;
}

function view(text, rows) {
  return { text, rows };
}

function actor(user) {
  return { tgId: String(user.tg_id), admin: user.status === "admin", courier: user.status === "courier" };
}

async function customerHome(user, ctx) {
  const lang = user.lang || "ru";
  return view(t(lang, "welcome"), customerKeyboard(lang, httpsUrl(ctx.miniAppUrl), actor(user)));
}

async function ordersPage(user, ctx, page) {
  const lang = user.lang || "ru";
  if (ctx.ordersReady === false) {
    return view(t(lang, "ordersUnavailable"), [[shopButton(lang, httpsUrl(ctx.miniAppUrl))], [{ text: t(lang, "back"), callback_data: "m:home" }]]);
  }
  const orders = await ctx.ordersFor(user.tg_id);
  if (!orders.length) {
    return view(t(lang, "emptyOrders"), [[shopButton(lang, httpsUrl(ctx.miniAppUrl))], [{ text: t(lang, "back"), callback_data: "m:home" }]]);
  }
  const start = Math.max(0, page) * PAGE;
  const slice = orders.slice(start, start + PAGE);
  const lines = [t(lang, "ordersTitle"), ""];
  for (const order of slice) {
    lines.push(`📦 ${orderNumber(order)}`, `${statusName(lang, order.status)} · ${euro(order.final_amount ?? order.total_amount)}`, when(order.created_at), "");
  }
  const rows = slice.map((order) => [{ text: `${t(lang, "more")} ${orderNumber(order)}`.slice(0, 64), callback_data: `m:od:${order.id}` }]);
  const nav = [];
  if (start > 0) nav.push({ text: t(lang, "prev"), callback_data: `m:orders:${page - 1}` });
  if (start + PAGE < orders.length) nav.push({ text: t(lang, "next"), callback_data: `m:orders:${page + 1}` });
  if (nav.length) rows.push(nav);
  rows.push([{ text: t(lang, "back"), callback_data: "m:home" }]);
  return view(lines.join("\n").trim(), rows);
}

async function orderDetail(user, ctx, orderId) {
  const lang = user.lang || "ru";
  const order = await ctx.orderFor(user.tg_id, orderId);
  if (!order) return view(t(lang, "missing"), [[{ text: t(lang, "back"), callback_data: "m:orders:0" }]]);
  const items = await ctx.items(order.id);
  const lines = [
    `📦 ${orderNumber(order)}`,
    customerHandle(order.username),
    "",
    statusName(lang, order.status),
    euro(order.final_amount ?? order.total_amount),
    when(order.created_at),
    order.delivery_method || "—",
    [order.delivery_date, order.delivery_time].filter(Boolean).join(" · ") || "—",
    "",
    ...items.map((item) => formatLine(item).text),
  ];
  return view(lines.join("\n"), [[{ text: t(lang, "back"), callback_data: "m:orders:0" }]]);
}

async function profileView(user, ctx) {
  const lang = user.lang || "ru";
  const name = user.first_name || "—";
  const username = customerHandle(user.username);
  const lines = [
    t(lang, "profileTitle"),
    "",
    `${t(lang, "profileName")}: ${name}`,
    `${t(lang, "profileUser")}: ${username}`,
    `${t(lang, "profileCity")}: Hamburg`,
  ];
  if (ctx.ordersReady === false) lines.push("", t(lang, "ordersUnavailable"));
  else {
    const profile = await ctx.profile(user);
    lines.push(
      `${t(lang, "profileDone")}: ${profile.delivered}`,
      `${t(lang, "profileLast")}: ${when(profile.last)}`,
      `${t(lang, "profileLevel")}: ${profile.level} / 10`,
    );
  }
  const text = lines.join("\n");
  return view(text, [
    [{ text: t(lang, "orders"), callback_data: "m:orders:0" }],
    [shopButton(lang, httpsUrl(ctx.miniAppUrl))],
    [{ text: t(lang, "back"), callback_data: "m:home" }],
  ]);
}

async function supportHome(user, ctx) {
  const lang = user.lang || "ru";
  const orders = ctx.ordersReady === false ? [] : (await ctx.ordersFor(user.tg_id)).slice(0, 5);
  const rows = orders.map((order) => [{ text: order.id, callback_data: `m:sup:${order.id}` }]);
  rows.push([{ text: t(lang, "supportFree"), callback_data: "m:sup:none" }]);
  rows.push([{ text: t(lang, "back"), callback_data: "m:home" }]);
  const manager = ctx.managerId ? "" : `\n\n${t(lang, "supportNoManager")}`;
  return view(`${t(lang, "supportPick")}${manager}`, rows);
}

function courierDenied() {
  return { ...view("Доступ только для активных курьеров.", []), html: true };
}

function courierNow(ctx) {
  const value = typeof ctx.now === "function" ? ctx.now() : new Date();
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function lineText(item) {
  return esc(formatLine(item).text);
}

function orderAmount(order) {
  const amount = Number(order?.total_amount);
  return Number.isFinite(amount) ? amount : 0;
}

async function loadBoard(user, ctx) {
  if (typeof ctx.courierBoard !== "function") return null;
  const board = await ctx.courierBoard(user);
  return Array.isArray(board) ? board : null;
}

function dayLabel(iso) {
  const [year, month, day] = String(iso || "").split("-");
  if (!year || !month || !day) return "—";
  return `${day}.${month}.${year}`;
}

function panelText(orders, today) {
  const tomorrow = shiftIso(today.iso, 1);
  const groups = [
    { title: "СЕГОДНЯ", day: today, list: orders.filter((order) => order.delivery_date === today.iso) },
    { title: "ЗАВТРА", day: { iso: tomorrow, label: dayLabel(tomorrow) }, list: orders.filter((order) => order.delivery_date === tomorrow) },
  ];
  const lines = ["🚚 <b>ELFIN MARKET — Панель курьера</b>", ""];
  for (const group of groups) {
    const cash = group.list.reduce((sum, order) => sum + orderAmount(order), 0);
    lines.push(`📅 <b>${group.title} · ${group.day.label}</b>`);
    lines.push(`📦 Заказов: ${group.list.length}`);
    lines.push(`💰 Касса, ожидается: ${euro(cash)}`);
    if (!group.list.length) lines.push("Открытых заказов нет.");
    for (const order of group.list) {
      lines.push("", `• ${esc(orderNumber(order))} · ${esc(order.delivery_time || "—")} · ${euro(orderAmount(order))}`);
      const products = (order.lines || []).slice(0, 4).map(lineText);
      if (products.length) lines.push(products.join(", "));
    }
    lines.push("");
  }
  const other = orders.filter((order) => order.delivery_date !== today.iso && order.delivery_date !== tomorrow);
  if (other.length) {
    lines.push(`📅 <b>ДРУГИЕ ДНИ</b>`, `📦 Заказов: ${other.length}`, "Эти заказы не входят в кассу сегодня и завтра.", "");
  }
  lines.push("Касса — ожидаемая сумма открытых заказов этого дня. Выданные и отменённые сюда не входят.");
  return lines.join("\n").trim().slice(0, 3900);
}

function panelRows(orders, today, page) {
  const tomorrow = shiftIso(today.iso, 1);
  const start = Math.max(0, page) * COURIER_PAGE;
  const slice = orders.slice(start, start + COURIER_PAGE);
  const rows = [];
  for (const order of slice) {
    const id = safeId(order.id);
    if (!id) continue;
    const whenWord = order.delivery_date === today.iso ? "сегодня" : order.delivery_date === tomorrow ? "завтра" : esc(order.delivery_date || "день");
    const label = `📦 ${orderNumber(order)} · ${order.delivery_time || "—"} · ${whenWord}`;
    rows.push([{ text: label.slice(0, 64), callback_data: `c:od:${id}` }]);
  }
  const nav = [];
  if (start > 0) nav.push({ text: "←", callback_data: `c:pg:${page - 1}` });
  if (start + COURIER_PAGE < orders.length) nav.push({ text: "→", callback_data: `c:pg:${page + 1}` });
  if (nav.length) rows.push(nav);
  rows.push([{ text: "🔄 Обновить", callback_data: "c:home" }]);
  rows.push([{ text: "🏠 Главное меню", callback_data: "c:home" }]);
  return rows;
}

async function courierHome(user, ctx, page = 0) {
  const orders = await loadBoard(user, ctx);
  if (!orders) return courierDenied();
  const today = berlinDay(courierNow(ctx));
  return { ...view(panelText(orders, today), panelRows(orders, today, page)), html: true };
}

function expectedAmount(order, mode, custom) {
  const expected = orderAmount(order);
  if (mode === "m2") return Math.round((expected - 2) * 100) / 100;
  if (mode === "m3") return Math.round((expected - 3) * 100) / 100;
  if (mode === "custom") return custom;
  return expected;
}

async function courierCard(user, ctx, orderId, note = "") {
  const id = safeId(orderId);
  const order = id ? await ctx.courierOrder(user, id) : null;
  if (!order) return courierDenied();
  const open = ["pending", "assigned", "picked_up"].includes(order.status);
  const lines = [
    `📦 <b>Заказ ${esc(orderNumber(order))}</b>`,
    `👤 ${esc(customerHandle(order.username))}`,
    "",
    `📅 ${esc(order.delivery_date || "—")}`,
    `⏰ ${esc(order.delivery_time || "—")}`,
    `📌 ${esc(statusName("ru", order.status))}`,
    `💳 ${order.payment_method === "card" ? "Карта" : "Наличные"}`,
    "",
    ...(order.lines || []).map((item) => `• ${lineText(item)}`),
    "",
    `💰 По заказу: ${euro(orderAmount(order))}`,
  ];
  if (order.cash_at) {
    lines.push(`💰 Получено: ${euro(order.cash_received)}`, `Разница: ${euro(order.cash_delta)}`, "Исходная сумма заказа не изменена.");
  }
  if (note) lines.push("", esc(note));
  else if (open) lines.push("", "Подтвердите фактическую выдачу:");
  const rows = [];
  if (open && id) {
    rows.push([{ text: "✅ Ровная сумма", callback_data: `c:cf:${id}:full` }]);
    rows.push([{ text: "−2€", callback_data: `c:cf:${id}:m2` }, { text: "−3€", callback_data: `c:cf:${id}:m3` }]);
    rows.push([{ text: "✏️ Своя сумма", callback_data: `c:own:${id}` }]);
    rows.push([{ text: "❌ Не выдано", callback_data: `c:why:${id}` }]);
  }
  const clientName = String(order.username || "").replace(/^@/, "");
  if (/^[A-Za-z0-9_]{5,32}$/.test(clientName) && /[A-Za-z_]/.test(clientName)) {
    rows.push([{ text: "💬 Написать клиенту", url: `https://t.me/${clientName}` }]);
  }
  rows.push([{ text: "⬅️ Назад в панель", callback_data: "c:home" }]);
  return { ...view(lines.join("\n"), rows), html: true };
}

function adminHome(user) {
  const lang = user.lang || "ru";
  if (user.status !== "admin") return view(t(lang, "denied"), [[{ text: t(lang, "back"), callback_data: "m:home" }]]);
  return view(t(lang, "adminTitle"), [
    [{ text: t(lang, "summary"), callback_data: "a:sum" }],
    [{ text: t(lang, "adminOrders"), callback_data: "a:orders" }, { text: t(lang, "adminCouriers"), callback_data: "a:couriers" }],
    [{ text: t(lang, "adminHealth"), callback_data: "a:health" }, { text: t(lang, "adminTickets"), callback_data: "a:tickets" }],
    [{ text: t(lang, "back"), callback_data: "m:home" }],
  ]);
}

async function courierRoute(user, ctx, state, action, extra, arg) {
  const id = safeId(extra);
  if (action === "home" || action === "list" || action === "pg") return courierHome(user, ctx, action === "pg" ? Number(extra || 0) : 0);
  if (!id) return courierDenied();
  const order = await ctx.courierOrder(user, id);
  if (!order) return courierDenied();
  if (action === "od") return courierCard(user, ctx, id);
  if (action === "own") {
    state.pending = { type: "cash", orderId: id };
    return { ...view(`✏️ Своя сумма\n${id}\n\nНапишите полученную сумму, например 16,50.\nИсходная сумма заказа не изменится.\nОтмена — напишите «нет».`, [[{ text: "⬅️ Назад в панель", callback_data: "c:home" }]]), html: true };
  }
  if (action === "cf" || action === "ask") {
    const mode = action === "ask" ? "full" : (arg || "full");
    const received = expectedAmount(order, mode);
    if (!Number.isFinite(received) || received < 0) return courierCard(user, ctx, id, "Эта сумма меньше нуля. Выберите другую.");
    return { ...view(`Подтвердите выдачу ${esc(id)}\nПо заказу: ${euro(orderAmount(order))}\nК получению: ${euro(received)}\nРазница: ${euro(received - orderAmount(order))}\nИсходная сумма заказа не меняется.`, [
      [{ text: "✅ Подтвердить", callback_data: `c:yes:${id}:${mode}` }],
      [{ text: "⬅️ Назад", callback_data: `c:od:${id}` }],
    ]), html: true };
  }
  if (action === "yes" || action === "go") {
    const mode = action === "go" ? "full" : (arg || "full");
    const custom = mode === "custom" && state.pending?.orderId === id ? state.pending.amount : null;
    if (mode === "custom" && custom == null) return courierCard(user, ctx, id, "Сначала напишите сумму.");
    const received = mode === "custom" ? custom : expectedAmount(order, mode);
    const result = await ctx.collect(user, id, mode === "full" || action === "go" ? null : received);
    state.pending = null;
    if (result?.invalid) return courierCard(user, ctx, id, "Некорректная сумма.");
    if (result?.ok) return courierCard(user, ctx, id, "Заказ отмечен выданным.");
    return { ...view(t(user.lang || "ru", result?.closed ? "already" : "denied"), [[{ text: "⬅️ Назад в панель", callback_data: "c:home" }]]), html: true };
  }
  if (action === "why") {
    return { ...view(`Подтвердить, что заказ ${esc(id)} не выдан?`, [
      [{ text: "Да, указать причину", callback_data: `c:nx:${id}` }],
      [{ text: "⬅️ Назад", callback_data: `c:od:${id}` }],
    ]), html: true };
  }
  if (action === "nx") {
    state.pending = { type: "cancel", orderId: id };
    return { ...view(t(user.lang || "ru", "askReason"), [[{ text: "⬅️ Назад", callback_data: `c:od:${id}` }]]), html: true };
  }
  return courierHome(user, ctx, 0);
}

async function route(user, data, ctx, state) {
  const lang = user.lang || "ru";
  const parts = String(data || "").split(":");
  const [scope, action, extra] = parts;
  if (scope === "m" && action === "home") return customerHome(user, ctx);
  if (scope === "m" && action === "nourl") return view(t(lang, "noUrl"), [[{ text: t(lang, "back"), callback_data: "m:home" }]]);
  if (scope === "m" && action === "orders") return ordersPage(user, ctx, Number(extra || 0));
  if (scope === "m" && action === "od") return orderDetail(user, ctx, extra);
  if (scope === "m" && action === "profile") return profileView(user, ctx);
  if (scope === "m" && action === "info") return view(t(lang, "infoBody"), [[{ text: t(lang, "back"), callback_data: "m:home" }]]);
  if (scope === "m" && action === "support") return supportHome(user, ctx);
  if (scope === "m" && action === "sup") {
    state.pending = { type: "support", orderId: extra === "none" ? "" : extra };
    return view(t(lang, "supportAsk"), [[{ text: t(lang, "back"), callback_data: "m:support" }]]);
  }
  if (scope === "c") return courierRoute(user, ctx, state, action, extra, parts[3] || "");
  if (scope === "a") {
    if (user.status !== "admin") return view(t(lang, "denied"), [[{ text: t(lang, "back"), callback_data: "m:home" }]]);
    if (action === "home") return adminHome(user);
    if (action === "sum") return view(await ctx.summaryText(), [[{ text: t(lang, "back"), callback_data: "a:home" }]]);
    if (action === "orders") return view(await ctx.adminOrdersText(), [[{ text: t(lang, "back"), callback_data: "a:home" }]]);
    if (action === "couriers") return view(await ctx.adminCouriersText(), [[{ text: t(lang, "back"), callback_data: "a:home" }]]);
    if (action === "health") return view(await ctx.healthText(), [[{ text: t(lang, "back"), callback_data: "a:home" }]]);
    if (action === "tickets") return view(await ctx.ticketsText(), [[{ text: t(lang, "back"), callback_data: "a:home" }]]);
  }
  return customerHome(user, ctx);
}

function commandOf(text) {
  const word = String(text || "").trim().split(/\s+/)[0].split("@")[0].toLowerCase();
  if (word === "/start" || word === "/shop" || word === "/orders" || word === "/profile" || word === "/help" || word === "/admin" || word === "/courier" || word === "/myid") return word;
  return "";
}

function startArg(text) {
  const parts = String(text || "").trim().split(/\s+/);
  const word = (parts[0] || "").split("@")[0].toLowerCase();
  if (word !== "/start") return "";
  return parts.slice(1).join("").slice(0, 64);
}

export async function handleUpdate(update, ctx) {
  const callback = update.callback_query;
  if (callback) {
    const from = callback.from || {};
    const chatId = String(callback.message?.chat?.id ?? from.id);
    const lang = language(from.language_code);
    if (limited(chatId)) {
      return { answer: { id: callback.id, text: t(lang, "rate") } };
    }
    try {
      const user = ctx.ensureUser(from);
      user.lang = user.lang || lang;
      if (ctx.refreshCourier) await ctx.refreshCourier(user);
      const state = session(chatId);
      const screen = await route(user, callback.data, ctx, state);
      const messageId = callback.message?.message_id;
      return {
        answer: { id: callback.id, text: "" },
        edit: messageId ? { chatId, messageId, ...screen } : null,
        send: messageId ? null : { chatId, ...screen },
      };
    } catch {
      return { answer: { id: callback.id, text: t(lang, "fail") } };
    }
  }
  const message = update.message;
  if (!message?.from || message.chat?.id == null) return null;
  const chatId = String(message.chat.id);
  const lang = language(message.from.language_code);
  if (limited(chatId)) return { send: { chatId, text: t(lang, "rate"), rows: [] } };
  const user = ctx.ensureUser(message.from);
  user.lang = user.lang || lang;
  if (ctx.refreshCourier) await ctx.refreshCourier(user);
  const state = session(chatId);
  const command = commandOf(message.text);
  if (command) state.pending = null;
  if (command === "/myid") {
    const ownId = String(message.from?.id ?? "");
    const text = /^\d{1,20}$/.test(ownId) ? `Ваш Telegram ID: ${ownId}` : "Telegram ID не получен.";
    return { send: { chatId, text, rows: [] } };
  }
  let screen;
  if (command === "/start" && user.status !== "courier") {
    const payload = startArg(message.text);
    const linked = payload.startsWith("ord_") ? safeId(payload.slice(4)) : "";
    if (linked) {
      const order = typeof ctx.orderFor === "function" ? await ctx.orderFor(user.tg_id, linked) : null;
      if (!order) {
        screen = view("Этот заказ вам недоступен.", [[{ text: t(user.lang, "back"), callback_data: "m:home" }]]);
      } else {
        state.pending = { type: "courier-note", orderId: order.id };
        screen = view(`Напишите одно сообщение курьеру по заказу ${esc(order.id)}.`, []);
      }
      return { send: { chatId, ...screen, html: true } };
    }
    const url = httpsUrl(ctx.miniAppUrl);
    return {
      photo: {
        chatId,
        caption: t(user.lang, "welcomeCaption"),
        rows: [[openShopButton(user.lang, url)]],
      },
    };
  }
  if (command === "/start" || command === "/courier") screen = await courierHome(user, ctx, 0);
  else if (command === "/shop") {
    const url = httpsUrl(ctx.miniAppUrl);
    screen = url ? view(t(user.lang, "shopLead"), [[openShopButton(user.lang, url)]]) : view(t(user.lang, "noUrl"), [[openShopButton(user.lang, "")]]);
  }
  else if (command === "/orders") screen = await ordersPage(user, ctx, 0);
  else if (command === "/profile") screen = await profileView(user, ctx);
  else if (command === "/help") screen = view(`${t(user.lang, "help")}\n\n${t(user.lang, "infoBody")}`, [[{ text: t(user.lang, "support"), callback_data: "m:support" }], [{ text: t(user.lang, "back"), callback_data: "m:home" }]]);
  else if (command === "/admin") screen = adminHome(user);
  else if (state.pending?.type === "courier-note") {
    const text = String(message.text || "").trim();
    const orderId = state.pending.orderId;
    if (!text || text.length > 500) screen = view(`Напишите одно сообщение курьеру по заказу ${esc(orderId)}.`, []);
    else if (typeof ctx.relayToCourier !== "function") screen = view("Сейчас написать курьеру нельзя.", []);
    else {
      const result = await ctx.relayToCourier(user, orderId, text);
      state.pending = null;
      screen = view(result?.ok ? "Сообщение передано курьеру." : "Сообщение пока не доставлено. Заказ сохранён.", []);
    }
  } else if (state.pending?.type === "support") {
    const text = String(message.text || "").trim();
    if (!text || text.length > 1000) screen = view(t(user.lang, "supportAsk"), [[{ text: t(user.lang, "back"), callback_data: "m:home" }]]);
    else {
      const ticket = await ctx.saveTicket(user, state.pending.orderId, text);
      state.pending = null;
      screen = view(`${t(user.lang, "supportDone")}\n${ticket.id}`, [[{ text: t(user.lang, "back"), callback_data: "m:home" }]]);
    }
  } else if (state.pending?.type === "cash") {
    const typed = String(message.text || "").trim().toLowerCase();
    const orderId = state.pending.orderId;
    if (typed === "нет" || typed === "отмена") {
      state.pending = null;
      screen = await courierCard(user, ctx, orderId, "Ввод суммы отменён.");
    } else {
      const amount = parseCash(message.text);
      const order = await ctx.courierOrder(user, orderId);
      const expected = order ? orderAmount(order) : NaN;
      if (amount == null || !order) screen = await courierCard(user, ctx, orderId, amount == null ? "Нужна сумма в евро, например 16,50." : "Заказ недоступен.");
      else if (amount - expected > 0.001) screen = { ...view(`Сумма не больше ${euro(expected)}. Напишите ещё раз или «нет».`, [[{ text: "⬅️ Назад", callback_data: `c:od:${orderId}` }]]), html: true };
      else {
        state.pending = { type: "cash", orderId, amount };
        screen = { ...view(`Подтвердите выдачу ${esc(orderId)}\nПо заказу: ${euro(expected)}\nК получению: ${euro(amount)}\nРазница: ${euro(amount - expected)}\nИсходная сумма заказа не меняется.`, [
          [{ text: "✅ Подтвердить", callback_data: `c:yes:${orderId}:custom` }],
          [{ text: "Отмена", callback_data: `c:od:${orderId}` }],
        ]), html: true };
      }
    }
  } else if (state.pending?.type === "cancel") {
    const reason = String(message.text || "").trim();
    if (!reason || reason.length > 200) screen = view(t(user.lang, "reasonBad"), [[{ text: t(user.lang, "back"), callback_data: "c:home" }]]);
    else {
      const result = await ctx.cancel(user, state.pending.orderId, reason);
      state.pending = null;
      const text = result?.ok ? t(user.lang, "doneCancel") : t(user.lang, result?.closed ? "already" : "denied");
      screen = view(text, [[{ text: t(user.lang, "back"), callback_data: "c:home" }]]);
    }
  } else screen = await customerHome(user, ctx);
  return { send: { chatId, ...screen } };
}

export function markup(rows, styled = true) {
  return {
    inline_keyboard: (rows || []).map((row) => row.map((button) => {
      if (styled || !button.style) return button;
      const next = { ...button };
      delete next.style;
      return next;
    })),
  };
}

export function menuButton(url) {
  const href = httpsUrl(url);
  if (!href) return null;
  return { type: "web_app", text: "Магазин", web_app: { url: href } };
}

export const commands = [
  { command: "start", description: "Главное меню" },
  { command: "shop", description: "Открыть магазин" },
  { command: "orders", description: "Мои заказы" },
  { command: "courier", description: "Панель курьера" },
  { command: "help", description: "Помощь" },
  { command: "myid", description: "Показать свой Telegram ID" },
];

export function sameCopyKeys() {
  return copyKeys;
}

const seenUpdates = new Set();

export async function onceUpdate(update, run) {
  const id = update?.update_id;
  const key = id == null || id === "" ? "" : String(id);
  if (key && seenUpdates.has(key)) return { duplicate: true };
  if (key) {
    seenUpdates.add(key);
    if (seenUpdates.size > 5000) seenUpdates.delete(seenUpdates.values().next().value);
  }
  try {
    return await run();
  } catch (error) {
    if (key) seenUpdates.delete(key);
    throw error;
  }
}
